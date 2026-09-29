package com.reelguard.app.domain

import java.time.ZoneId
import kotlinx.serialization.Serializable

/** Aggregated totals for one past day. Nothing finer-grained than this is ever stored. */
@Serializable
data class DaySummary(
    val day: String,
    val browsingMs: Long,
    val intentionalMs: Long,
    val blocks: Int,
)

/** A local-only "this was incorrectly blocked" report. Contains no screen content. */
@Serializable
data class FalsePositiveReport(
    val wallMs: Long,
    val reason: BlockReason,
    val screen: ScreenState,
    val origin: ReelOrigin?,
    val reelsSeen: Int,
    val rulesVersion: Int,
)

/**
 * All persisted usage data. Aggregated per day; there are no per-Reel or per-session records.
 */
@Serializable
data class UsageState(
    val day: String = "",
    val browsingMs: Long = 0,
    val intentionalMs: Long = 0,
    val blocks: Int = 0,
    val overridesToday: Int = 0,
    /** Previous days, newest first, at most [HISTORY_DAYS]. */
    val history: List<DaySummary> = emptyList(),
    /** First timestamp seen in the current boot; used to detect wall-clock changes. */
    val anchor: TimeStamp? = null,
    val cooldownUntil: Deadline? = null,
    val overrideUntil: Deadline? = null,
    val nextOverrideAllowedAt: Deadline? = null,
    val reports: List<FalsePositiveReport> = emptyList(),
) {
    companion object {
        const val HISTORY_DAYS = 14
        const val MAX_REPORTS = 20
    }
}

/** Increments produced by the running service, applied atomically to the stored state. */
data class UsageDelta(
    val browsingMs: Long = 0,
    val intentionalMs: Long = 0,
    val blocks: Int = 0,
    val startCooldown: Deadline? = null,
) {
    val isEmpty: Boolean get() = browsingMs == 0L && intentionalMs == 0L && blocks == 0 && startCooldown == null

    operator fun plus(o: UsageDelta) = UsageDelta(
        browsingMs + o.browsingMs,
        intentionalMs + o.intentionalMs,
        blocks + o.blocks,
        o.startCooldown ?: startCooldown,
    )
}

object UsageLogic {

    /** Moves the state to the current (trusted) day, archiving the previous one. Pure. */
    fun rollover(state: UsageState, now: TimeStamp, zone: ZoneId): UsageState {
        val anchor = state.anchor?.takeIf { it.bootCount == now.bootCount && it.bootCount >= 0 } ?: now
        val today = TrustedTime.dayKey(TrustedTime.trustedWallMs(anchor, now), zone)
        val withAnchor = if (anchor == state.anchor) state else state.copy(anchor = anchor)
        return when {
            state.day.isEmpty() -> withAnchor.copy(day = today)
            state.day == today -> withAnchor
            // ISO dates sort lexically. Never roll *backwards*: setting the clock to yesterday
            // (across a reboot, where we cannot detect it) must not reset today's usage.
            today < state.day -> withAnchor
            else -> {
                val summary = DaySummary(state.day, state.browsingMs, state.intentionalMs, state.blocks)
                withAnchor.copy(
                    day = today,
                    browsingMs = 0,
                    intentionalMs = 0,
                    blocks = 0,
                    overridesToday = 0,
                    history = (listOf(summary) + state.history).take(UsageState.HISTORY_DAYS),
                )
            }
        }
    }

    fun apply(state: UsageState, delta: UsageDelta, now: TimeStamp, zone: ZoneId): UsageState {
        val s = rollover(state, now, zone)
        return s.copy(
            browsingMs = s.browsingMs + delta.browsingMs.coerceAtLeast(0),
            intentionalMs = s.intentionalMs + delta.intentionalMs.coerceAtLeast(0),
            blocks = s.blocks + delta.blocks.coerceAtLeast(0),
            cooldownUntil = delta.startCooldown ?: s.cooldownUntil,
        )
    }

    /** Local view of state plus not-yet-persisted increments. */
    fun effective(state: UsageState, pending: UsageDelta, now: TimeStamp, zone: ZoneId): UsageState =
        if (pending.isEmpty) rollover(state, now, zone) else apply(state, pending, now, zone)

    fun addReport(state: UsageState, report: FalsePositiveReport): UsageState =
        state.copy(reports = (listOf(report) + state.reports).take(UsageState.MAX_REPORTS))

    /** Last 7 days including today, oldest first, for the home screen chart. */
    fun lastSevenDays(state: UsageState): List<DaySummary> {
        val today = DaySummary(state.day, state.browsingMs, state.intentionalMs, state.blocks)
        return (listOf(today) + state.history).take(7).reversed()
    }
}

/**
 * Converts a stream of "what is on screen now" observations into time attributed per kind.
 * The time between two ticks is attributed to the kind that was on screen *during* that
 * interval. Gaps are capped so a missed "left Instagram" signal can't inflate usage much.
 */
class UsageMeter(private val maxTickMs: Long = 10_000L) {
    private var lastTickElapsed: Long = -1
    var currentKind: ViewingKind = ViewingKind.NONE
        private set

    /** Attributes the time since the last call to the kind that was on screen meanwhile. */
    fun advance(nowElapsed: Long): UsageDelta {
        val delta = if (lastTickElapsed < 0) 0 else (nowElapsed - lastTickElapsed).coerceIn(0, maxTickMs)
        lastTickElapsed = nowElapsed
        return when (currentKind) {
            ViewingKind.BROWSING -> UsageDelta(browsingMs = delta)
            ViewingKind.INTENTIONAL -> UsageDelta(intentionalMs = delta)
            ViewingKind.NONE -> UsageDelta()
        }
    }

    fun setKind(kind: ViewingKind) {
        currentKind = kind
    }

    fun tick(nowElapsed: Long, kindFromNow: ViewingKind): UsageDelta =
        advance(nowElapsed).also { setKind(kindFromNow) }

    fun stop(nowElapsed: Long): UsageDelta = tick(nowElapsed, ViewingKind.NONE)
}

/**
 * Tracks *continuous* browsing for cooldown mode. A break of at least [breakMs] resets it.
 */
class ContinuousBrowsingTracker(private val breakMs: Long = 2 * 60_000L) {
    private var lastBrowsingElapsed: Long = -1
    var continuousMs: Long = 0
        private set

    fun onBrowsing(nowElapsed: Long, deltaMs: Long): Long {
        if (lastBrowsingElapsed >= 0 && nowElapsed - deltaMs - lastBrowsingElapsed >= breakMs) continuousMs = 0
        if (deltaMs > 0) {
            continuousMs += deltaMs
            lastBrowsingElapsed = nowElapsed
        }
        return continuousMs
    }

    fun reset() {
        continuousMs = 0
        lastBrowsingElapsed = -1
    }
}
