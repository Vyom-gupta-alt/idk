package com.reelguard.app.domain

import java.time.ZoneId

sealed interface OverrideAvailability {
    data class Available(val maxMinutes: Int) : OverrideAvailability
    data object Disabled : OverrideAvailability
    data class AlreadyActive(val remainingMs: Long) : OverrideAvailability
    data class CoolingDown(val remainingMs: Long) : OverrideAvailability
    data class DailyCapReached(val cap: Int) : OverrideAvailability
}

/**
 * Temporary overrides ("pause protection for N minutes"). Friction (countdown, reason) is a
 * UI concern; the rules for *whether* an override may be granted live here.
 */
object OverrideManager {
    val DURATION_CHOICES = listOf(5, 10, 15, 30)
    const val MIN_REASON_LENGTH = 10

    fun availability(settings: OverrideSettings, usage: UsageState, now: TimeStamp, zone: ZoneId): OverrideAvailability {
        if (!settings.enabled) return OverrideAvailability.Disabled
        val u = UsageLogic.rollover(usage, now, zone)
        u.overrideUntil?.let { if (it.isActive(now)) return OverrideAvailability.AlreadyActive(it.remainingMs(now)) }
        u.nextOverrideAllowedAt?.let { if (it.isActive(now)) return OverrideAvailability.CoolingDown(it.remainingMs(now)) }
        if (settings.maxPerDay in 1..u.overridesToday) return OverrideAvailability.DailyCapReached(settings.maxPerDay)
        return OverrideAvailability.Available(settings.maxDurationMinutes.coerceAtLeast(1))
    }

    fun durationChoices(settings: OverrideSettings): List<Int> {
        val max = settings.maxDurationMinutes.coerceAtLeast(1)
        return (DURATION_CHOICES.filter { it <= max } + max).distinct().sorted()
    }

    fun isReasonAcceptable(settings: OverrideSettings, reason: String): Boolean =
        !settings.requireReason || reason.trim().length >= MIN_REASON_LENGTH

    /**
     * Grants an override if allowed. Returns the new state, or null if not available.
     * The reason text is intentionally *not* stored.
     */
    fun grant(settings: OverrideSettings, usage: UsageState, now: TimeStamp, zone: ZoneId, minutes: Int): UsageState? {
        if (availability(settings, usage, now, zone) !is OverrideAvailability.Available) return null
        val duration = minutes.coerceIn(1, settings.maxDurationMinutes.coerceAtLeast(1)) * 60_000L
        val u = UsageLogic.rollover(usage, now, zone)
        return u.copy(
            overrideUntil = Deadline.after(now, duration),
            nextOverrideAllowedAt = Deadline.after(now, duration + settings.cooldownMinutes.coerceAtLeast(0) * 60_000L),
            overridesToday = u.overridesToday + 1,
        )
    }

    /** Ends an active override early (e.g. "I'm done" button). */
    fun endEarly(usage: UsageState): UsageState = usage.copy(overrideUntil = null)
}
