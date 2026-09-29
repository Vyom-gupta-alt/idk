package com.reelguard.app.domain

import kotlinx.serialization.Serializable

/**
 * User-facing protection modes. Each preset resolves to a [Policy] via [PolicyResolver];
 * [CUSTOM] exposes every knob through [CustomSettings].
 */
@Serializable
enum class ProtectionMode { STRICT, FRIEND, TIME_LIMIT, COOLDOWN, CUSTOM }

@Serializable
enum class CooldownScope { REELS_ONLY, ALL_INSTAGRAM }

/** A daily window, in minutes since local midnight. May wrap past midnight (e.g. 22:00–01:00). */
@Serializable
data class TimeWindow(val startMinute: Int, val endMinute: Int) {
    init {
        require(startMinute in 0 until MINUTES_PER_DAY) { "startMinute out of range" }
        require(endMinute in 0 until MINUTES_PER_DAY) { "endMinute out of range" }
    }

    fun contains(minuteOfDay: Int): Boolean = when {
        startMinute == endMinute -> true // a zero-length window means "all day"
        startMinute < endMinute -> minuteOfDay in startMinute until endMinute
        else -> minuteOfDay >= startMinute || minuteOfDay < endMinute
    }

    fun label(): String = "${fmt(startMinute)}–${fmt(endMinute)}"

    private fun fmt(m: Int) = "%02d:%02d".format(m / 60, m % 60)

    companion object {
        const val MINUTES_PER_DAY = 24 * 60
    }
}

@Serializable
data class CustomSettings(
    /** Minutes of Reels *browsing* allowed per day. 0 = the feed is always blocked. */
    val dailyLimitMinutes: Int = 10,
    /** Continuous browsing that triggers a cooldown. 0 = cooldowns off. */
    val continuousLimitMinutes: Int = 0,
    val cooldownMinutes: Int = 30,
    val cooldownScope: CooldownScope = CooldownScope.REELS_ONLY,
    /** Browsing is only possible inside these windows. Empty = any time of day. */
    val allowedPeriods: List<TimeWindow> = emptyList(),
    val allowDmReels: Boolean = true,
    /** Extra Reels (beyond the one you opened) allowed after opening a Reel from a DM. */
    val dmReelAllowance: Int = 1,
    /** Reels opened from outside Instagram: notifications, links in other apps. */
    val allowExternalReels: Boolean = true,
    val externalReelAllowance: Int = 0,
    /** A single Reel opened from a profile, the home feed, Stories or Explore. */
    val allowOtherSingleReels: Boolean = true,
    val blockExplore: Boolean = false,
    val countIntentionalTowardLimit: Boolean = false,
)

@Serializable
data class OverrideSettings(
    val enabled: Boolean = true,
    /** Countdown shown before an override (or settings change) can be confirmed. */
    val delaySeconds: Int = 20,
    val requireReason: Boolean = true,
    val maxDurationMinutes: Int = 15,
    /** Minimum gap between the end of one override and the start of the next. */
    val cooldownMinutes: Int = 60,
    val maxPerDay: Int = 3,
)

/**
 * Everything the user can configure. Persisted as one JSON document in DataStore.
 * Defaults are deliberately protective: clearing app data resets to Friend mode, not "off".
 */
@Serializable
data class UserSettings(
    val protectionEnabled: Boolean = true,
    val mode: ProtectionMode = ProtectionMode.FRIEND,
    val timeLimitMinutes: Int = 15,
    val cooldownModeContinuousMinutes: Int = 10,
    val cooldownModeCooldownMinutes: Int = 30,
    val custom: CustomSettings = CustomSettings(),
    val overrides: OverrideSettings = OverrideSettings(),
    /** Instagram Lite exposes almost no view ids, so it can only be blocked entirely. */
    val blockInstagramLite: Boolean = true,
    /** Extra package names (alternative clients) that are blocked entirely. */
    val blockedExtraPackages: List<String> = emptyList(),
    /** Require the friction countdown before settings can be changed. */
    val settingsLock: Boolean = true,
    val onboardingComplete: Boolean = false,
    val disclosureAccepted: Boolean = false,
)

object InstagramPackages {
    const val INSTAGRAM = "com.instagram.android"
    const val INSTAGRAM_LITE = "com.instagram.lite"

    val DEFAULT = listOf(INSTAGRAM, INSTAGRAM_LITE)

    private val PACKAGE_NAME = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$")

    fun isValidPackageName(name: String): Boolean = PACKAGE_NAME.matches(name)
}

enum class AppKind { INSTAGRAM, INSTAGRAM_LITE, EXTRA_CLIENT, UNRELATED }

fun UserSettings.appKindOf(packageName: String): AppKind = when (packageName) {
    InstagramPackages.INSTAGRAM -> AppKind.INSTAGRAM
    InstagramPackages.INSTAGRAM_LITE -> AppKind.INSTAGRAM_LITE
    in blockedExtraPackages -> AppKind.EXTRA_CLIENT
    else -> AppKind.UNRELATED
}

/** The complete set of packages the accessibility service is allowed to receive events from. */
fun UserSettings.monitoredPackages(): List<String> =
    (InstagramPackages.DEFAULT + blockedExtraPackages).distinct()
