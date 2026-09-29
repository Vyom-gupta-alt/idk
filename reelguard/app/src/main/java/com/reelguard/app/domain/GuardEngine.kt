package com.reelguard.app.domain

import com.reelguard.app.detection.DetectionResult

enum class BlockAction {
    /** Press Back inside Instagram to leave the Reels viewer/tab, then show the block screen. */
    BACK,
    /** Go to the launcher. Used when Back did not help, or all of Instagram is blocked. */
    HOME,
    /** Only show the block screen (e.g. Instagram is not the focused window in split screen). */
    NONE,
}

data class BlockRequest(
    val reason: BlockReason,
    val action: BlockAction,
    val screen: ScreenState,
    val origin: ReelOrigin?,
    val reelsSeen: Int,
)

/** Snapshot for Diagnostics. Contains no screen content, only classifications. */
data class LiveStatus(
    val detection: DetectionResult?,
    val appKind: AppKind,
    val interpreted: InterpretedState,
    val session: ReelSession?,
    val decision: Decision,
    val viewingKind: ViewingKind,
)

enum class Foreground { MONITORED, OTHER, UNKNOWN }

/**
 * Orchestrates detection results, Reel sessions, usage metering, cooldowns and blocking.
 *
 * Pure Kotlin and single-threaded (the service calls it on the main thread). Android-facing
 * effects go through [Sink], so the whole pipeline is unit-testable with a fake clock.
 */
class GuardEngine(
    private val clock: Clock,
    private val sink: Sink,
    private val flushIntervalMs: Long = 15_000L,
    private val unconfirmedForegroundMs: Long = 60_000L,
) {
    interface Sink {
        fun persist(delta: UsageDelta)
        fun block(request: BlockRequest)
        fun status(status: LiveStatus)
    }

    var settings: UserSettings = UserSettings()
        set(value) {
            field = value
            policy = PolicyResolver.resolve(value)
        }

    var policy: Policy = PolicyResolver.resolve(settings)
        private set

    /** Latest persisted usage (observed from the repository). */
    var storedUsage: UsageState = UsageState()

    private var pending = UsageDelta()
    private val sessions = ReelSessionTracker()
    private val meter = UsageMeter()
    private val continuous = ContinuousBrowsingTracker()

    private var lastDetection: DetectionResult? = null
    private var lastScreen = ScreenState.UNKNOWN
    private var lastAppKind = AppKind.INSTAGRAM
    private var lastMonitoredSignalElapsed = Long.MIN_VALUE
    private var lastFlushElapsed = Long.MIN_VALUE
    private var lastBlockElapsed = Long.MIN_VALUE
    private var inActiveWindow = true

    val session: ReelSession? get() = sessions.session

    /** True while time is being attributed; the service runs a heartbeat only then. */
    fun needsHeartbeat(): Boolean = meter.currentKind != ViewingKind.NONE

    fun onDetection(result: DetectionResult, instagramIsActiveWindow: Boolean) {
        val now = clock.now()
        lastDetection = result
        lastScreen = result.state
        lastAppKind = AppKind.INSTAGRAM
        inActiveWindow = instagramIsActiveWindow
        lastMonitoredSignalElapsed = now.elapsedMs
        sessions.onScreen(result.state, now.elapsedMs)
        evaluateAndAct(now)
    }

    /** A window from Instagram Lite or a blocked extra client came to the front. */
    fun onAlternativeClient(appKind: AppKind, isActiveWindow: Boolean) {
        val now = clock.now()
        lastDetection = null
        lastScreen = ScreenState.OTHER
        lastAppKind = appKind
        inActiveWindow = isActiveWindow
        lastMonitoredSignalElapsed = now.elapsedMs
        evaluateAndAct(now)
    }

    fun onScroll(sample: ScrollSample) {
        if (lastAppKind != AppKind.INSTAGRAM) return
        val before = sessions.session?.reelsSeen
        sessions.onScroll(sample)
        lastMonitoredSignalElapsed = sample.elapsedMs
        if (sessions.session?.reelsSeen != before) evaluateAndAct(clock.now())
    }

    fun onHeartbeat(foreground: Foreground) {
        val now = clock.now()
        when (foreground) {
            Foreground.OTHER -> onLeftInstagram()
            Foreground.MONITORED -> {
                lastMonitoredSignalElapsed = now.elapsedMs
                evaluateAndAct(now)
            }
            Foreground.UNKNOWN ->
                if (now.elapsedMs - lastMonitoredSignalElapsed > unconfirmedForegroundMs) onLeftInstagram()
                else evaluateAndAct(now)
        }
    }

    /** Screen off, another app in front, or the service is shutting down. */
    fun onLeftInstagram() {
        val now = clock.now()
        pending += meter.stop(now.elapsedMs)
        sessions.onLeftInstagram(now.elapsedMs)
        lastScreen = ScreenState.UNKNOWN
        flush(now)
        emitStatus(Evaluation(Decision.Allow, ViewingKind.NONE, InterpretedState.UNKNOWN))
    }

    fun flush() = flush(clock.now())

    /** Current usage including increments not yet written to storage. */
    fun effectiveUsage(): UsageState = UsageLogic.effective(storedUsage, pending, clock.now(), clock.zone())

    private fun evaluateAndAct(now: TimeStamp) {
        // 1. Attribute the time since the last observation to what was on screen meanwhile.
        val spent = meter.advance(now.elapsedMs)
        pending += spent
        if (spent.browsingMs > 0 && policy.continuousLimitMs > 0) {
            val continuousMs = continuous.onBrowsing(now.elapsedMs, spent.browsingMs)
            if (continuousMs >= policy.continuousLimitMs) {
                pending += UsageDelta(startCooldown = Deadline.after(now, policy.cooldownMs))
                continuous.reset()
                flush(now)
            }
        }

        // 2. Decide based on the up-to-date usage.
        val zone = clock.zone()
        val usage = UsageLogic.effective(storedUsage, pending, now, zone)
        val evaluation = BlockDecisionEngine.evaluate(
            EvaluationContext(
                policy = policy,
                protectionEnabled = settings.protectionEnabled,
                appKind = lastAppKind,
                blockInstagramLite = settings.blockInstagramLite,
                screen = lastScreen,
                session = sessions.session,
                usage = usage,
                now = now,
                minuteOfDay = TrustedTime.minuteOfDay(TrustedTime.trustedWallMs(usage.anchor, now), zone),
            ),
        )

        // 3. Act.
        when (val d = evaluation.decision) {
            is Decision.Allow -> meter.setKind(evaluation.kind)
            is Decision.Block -> {
                meter.setKind(ViewingKind.NONE)
                requestBlock(d.reason, now)
            }
        }
        if (now.elapsedMs - lastFlushElapsed >= flushIntervalMs) flush(now)
        emitStatus(evaluation)
    }

    private fun requestBlock(reason: BlockReason, now: TimeStamp) {
        val sinceLast = now.elapsedMs - lastBlockElapsed
        // Instagram emits bursts of events; one block per burst is enough.
        if (lastBlockElapsed != Long.MIN_VALUE && sinceLast < BLOCK_DEBOUNCE_MS) return
        val repeated = lastBlockElapsed != Long.MIN_VALUE && sinceLast < BLOCK_ESCALATE_MS
        lastBlockElapsed = now.elapsedMs

        val wholeAppBlocked = reason == BlockReason.ALTERNATIVE_CLIENT ||
            (reason == BlockReason.COOLDOWN_ACTIVE && policy.cooldownScope == CooldownScope.ALL_INSTAGRAM)
        val action = when {
            !inActiveWindow -> BlockAction.NONE
            wholeAppBlocked || repeated -> BlockAction.HOME // Back did not get us out last time
            else -> BlockAction.BACK
        }
        pending += UsageDelta(blocks = 1)
        val s = sessions.session
        sink.block(BlockRequest(reason, action, lastScreen, s?.origin, s?.reelsSeen ?: 0))
        flush(now)
    }

    private fun flush(now: TimeStamp) {
        lastFlushElapsed = now.elapsedMs
        if (pending.isEmpty) return
        val delta = pending
        pending = UsageDelta()
        // Keep the local view consistent until the repository emits the persisted value.
        storedUsage = UsageLogic.apply(storedUsage, delta, now, clock.zone())
        sink.persist(delta)
    }

    private fun emitStatus(evaluation: Evaluation) {
        sink.status(
            LiveStatus(
                detection = lastDetection,
                appKind = lastAppKind,
                interpreted = evaluation.interpreted,
                session = sessions.session,
                decision = evaluation.decision,
                viewingKind = evaluation.kind,
            ),
        )
    }

    companion object {
        const val BLOCK_DEBOUNCE_MS = 1_500L
        const val BLOCK_ESCALATE_MS = 6_000L
    }
}
