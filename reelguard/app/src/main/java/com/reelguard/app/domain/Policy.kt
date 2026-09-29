package com.reelguard.app.domain

/**
 * The effective rules the decision engine applies. Presets and custom settings both
 * resolve to this, so [BlockDecisionEngine] never needs to know about modes.
 */
data class Policy(
    val allowDmReels: Boolean,
    val dmReelAllowance: Int,
    val allowExternalReels: Boolean,
    val externalReelAllowance: Int,
    val allowOtherSingleReels: Boolean,
    val blockExplore: Boolean,
    /** Daily browsing budget. 0 = never; [UNLIMITED] = no daily cap. */
    val dailyBrowsingLimitMs: Long,
    /** 0 = no continuous-session cooldowns. */
    val continuousLimitMs: Long,
    val cooldownMs: Long,
    val cooldownScope: CooldownScope,
    val allowedPeriods: List<TimeWindow>,
    val countIntentionalTowardLimit: Boolean,
) {
    val browsingEverAllowed: Boolean get() = dailyBrowsingLimitMs > 0
    val hasFiniteDailyLimit: Boolean get() = dailyBrowsingLimitMs in 1 until UNLIMITED

    fun inAllowedPeriod(minuteOfDay: Int): Boolean =
        allowedPeriods.isEmpty() || allowedPeriods.any { it.contains(minuteOfDay) }

    companion object {
        const val UNLIMITED = Long.MAX_VALUE
    }
}

object PolicyResolver {
    private const val MINUTE = 60_000L

    fun resolve(settings: UserSettings): Policy = when (settings.mode) {
        ProtectionMode.STRICT -> Policy(
            allowDmReels = true,
            dmReelAllowance = 0,
            allowExternalReels = true,
            externalReelAllowance = 0,
            allowOtherSingleReels = false,
            blockExplore = true,
            dailyBrowsingLimitMs = 0,
            continuousLimitMs = 0,
            cooldownMs = 0,
            cooldownScope = CooldownScope.REELS_ONLY,
            allowedPeriods = emptyList(),
            countIntentionalTowardLimit = false,
        )

        ProtectionMode.FRIEND -> Policy(
            allowDmReels = true,
            dmReelAllowance = 1,
            allowExternalReels = true,
            externalReelAllowance = 0,
            allowOtherSingleReels = true,
            blockExplore = false,
            dailyBrowsingLimitMs = 0,
            continuousLimitMs = 0,
            cooldownMs = 0,
            cooldownScope = CooldownScope.REELS_ONLY,
            allowedPeriods = emptyList(),
            countIntentionalTowardLimit = false,
        )

        ProtectionMode.TIME_LIMIT -> Policy(
            allowDmReels = true,
            dmReelAllowance = 1,
            allowExternalReels = true,
            externalReelAllowance = 0,
            allowOtherSingleReels = true,
            blockExplore = false,
            dailyBrowsingLimitMs = settings.timeLimitMinutes.coerceAtLeast(0) * MINUTE,
            continuousLimitMs = 0,
            cooldownMs = 0,
            cooldownScope = CooldownScope.REELS_ONLY,
            allowedPeriods = emptyList(),
            countIntentionalTowardLimit = false,
        )

        ProtectionMode.COOLDOWN -> Policy(
            allowDmReels = true,
            dmReelAllowance = 1,
            allowExternalReels = true,
            externalReelAllowance = 0,
            allowOtherSingleReels = true,
            blockExplore = false,
            dailyBrowsingLimitMs = Policy.UNLIMITED,
            continuousLimitMs = settings.cooldownModeContinuousMinutes.coerceAtLeast(1) * MINUTE,
            cooldownMs = settings.cooldownModeCooldownMinutes.coerceAtLeast(1) * MINUTE,
            cooldownScope = CooldownScope.REELS_ONLY,
            allowedPeriods = emptyList(),
            countIntentionalTowardLimit = false,
        )

        ProtectionMode.CUSTOM -> with(settings.custom) {
            Policy(
                allowDmReels = allowDmReels,
                dmReelAllowance = dmReelAllowance.coerceIn(0, 20),
                allowExternalReels = allowExternalReels,
                externalReelAllowance = externalReelAllowance.coerceIn(0, 20),
                allowOtherSingleReels = allowOtherSingleReels,
                blockExplore = blockExplore,
                dailyBrowsingLimitMs = dailyLimitMinutes.coerceAtLeast(0) * MINUTE,
                continuousLimitMs = continuousLimitMinutes.coerceAtLeast(0) * MINUTE,
                cooldownMs = cooldownMinutes.coerceAtLeast(1) * MINUTE,
                cooldownScope = cooldownScope,
                allowedPeriods = allowedPeriods,
                countIntentionalTowardLimit = countIntentionalTowardLimit,
            )
        }
    }
}
