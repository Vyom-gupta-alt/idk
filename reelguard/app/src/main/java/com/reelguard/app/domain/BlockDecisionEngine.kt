package com.reelguard.app.domain

import kotlinx.serialization.Serializable

@Serializable
enum class BlockReason {
    REELS_FEED,
    SWIPED_PAST_ALLOWANCE,
    REEL_NOT_INTENTIONAL,
    DAILY_LIMIT_REACHED,
    OUTSIDE_ALLOWED_PERIOD,
    COOLDOWN_ACTIVE,
    EXPLORE_BLOCKED,
    ALTERNATIVE_CLIENT,
}

/** What kind of Reels viewing (if any) is happening, for usage accounting. */
enum class ViewingKind { NONE, INTENTIONAL, BROWSING }

sealed interface Decision {
    data object Allow : Decision
    data class Block(val reason: BlockReason) : Decision
}

data class Evaluation(val decision: Decision, val kind: ViewingKind, val interpreted: InterpretedState)

data class EvaluationContext(
    val policy: Policy,
    val protectionEnabled: Boolean,
    val appKind: AppKind,
    val blockInstagramLite: Boolean,
    val screen: ScreenState,
    val session: ReelSession?,
    val usage: UsageState,
    val now: TimeStamp,
    val minuteOfDay: Int,
)

/**
 * Pure, deterministic policy evaluation. No Android dependencies, fully unit-tested.
 */
object BlockDecisionEngine {

    fun evaluate(ctx: EvaluationContext): Evaluation {
        val p = ctx.policy
        val (kind, interpreted, notIntentionalReason) = classify(ctx)

        fun allow() = Evaluation(Decision.Allow, kind, interpreted)
        fun block(r: BlockReason) = Evaluation(Decision.Block(r), kind, interpreted)

        if (!ctx.protectionEnabled) return allow()
        if (ctx.usage.overrideUntil?.isActive(ctx.now) == true) return allow()

        when (ctx.appKind) {
            AppKind.UNRELATED -> return Evaluation(Decision.Allow, ViewingKind.NONE, InterpretedState.UNKNOWN)
            AppKind.EXTRA_CLIENT -> return block(BlockReason.ALTERNATIVE_CLIENT)
            AppKind.INSTAGRAM_LITE -> return if (ctx.blockInstagramLite) block(BlockReason.ALTERNATIVE_CLIENT) else allow()
            AppKind.INSTAGRAM -> Unit
        }

        if (ctx.usage.cooldownUntil?.isActive(ctx.now) == true) {
            if (p.cooldownScope == CooldownScope.ALL_INSTAGRAM) return block(BlockReason.COOLDOWN_ACTIVE)
            if (kind == ViewingKind.BROWSING) return block(BlockReason.COOLDOWN_ACTIVE)
        }

        if (ctx.screen == ScreenState.EXPLORE && p.blockExplore) return block(BlockReason.EXPLORE_BLOCKED)

        return when (kind) {
            ViewingKind.NONE -> allow()
            ViewingKind.INTENTIONAL -> {
                val limitHit = p.countIntentionalTowardLimit && p.hasFiniteDailyLimit &&
                    usedTowardLimit(ctx) >= p.dailyBrowsingLimitMs
                if (limitHit) block(BlockReason.DAILY_LIMIT_REACHED) else allow()
            }
            ViewingKind.BROWSING -> {
                val reason = browsingBlockReason(ctx, notIntentionalReason)
                if (reason == null) allow() else block(reason)
            }
        }
    }

    private fun usedTowardLimit(ctx: EvaluationContext): Long =
        ctx.usage.browsingMs + if (ctx.policy.countIntentionalTowardLimit) ctx.usage.intentionalMs else 0

    private fun browsingBlockReason(ctx: EvaluationContext, notIntentional: BlockReason): BlockReason? {
        val p = ctx.policy
        if (!p.browsingEverAllowed) return notIntentional
        if (!p.inAllowedPeriod(ctx.minuteOfDay)) return BlockReason.OUTSIDE_ALLOWED_PERIOD
        if (p.hasFiniteDailyLimit && usedTowardLimit(ctx) >= p.dailyBrowsingLimitMs) return BlockReason.DAILY_LIMIT_REACHED
        return null
    }

    /**
     * Returns the viewing kind, the interpreted state, and the reason to use if browsing is
     * not permitted at all.
     */
    private fun classify(ctx: EvaluationContext): Triple<ViewingKind, InterpretedState, BlockReason> {
        val p = ctx.policy
        return when (ctx.screen) {
            ScreenState.REELS_TAB -> Triple(ViewingKind.BROWSING, InterpretedState.REELS_FEED, BlockReason.REELS_FEED)
            ScreenState.REEL_VIEWER -> {
                val session = ctx.session ?: ReelSession(ReelOrigin.UNKNOWN, ctx.now.elapsedMs)
                val allowance: Int? = when (session.origin) {
                    ReelOrigin.DM -> if (p.allowDmReels) p.dmReelAllowance else null
                    ReelOrigin.EXTERNAL -> if (p.allowExternalReels) p.externalReelAllowance else null
                    ReelOrigin.PROFILE, ReelOrigin.HOME_FEED, ReelOrigin.STORIES, ReelOrigin.UNKNOWN ->
                        if (p.allowOtherSingleReels) 0 else null
                    ReelOrigin.EXPLORE -> if (p.allowOtherSingleReels && !p.blockExplore) 0 else null
                    ReelOrigin.REELS_TAB -> null
                }
                when {
                    session.origin == ReelOrigin.REELS_TAB ->
                        Triple(ViewingKind.BROWSING, InterpretedState.REELS_FEED, BlockReason.REELS_FEED)
                    allowance == null ->
                        Triple(ViewingKind.BROWSING, InterpretedState.REELS_FEED, BlockReason.REEL_NOT_INTENTIONAL)
                    session.reelsSeen <= 1 + allowance -> {
                        val interpreted = when (session.origin) {
                            ReelOrigin.DM -> InterpretedState.DM_REEL
                            ReelOrigin.EXTERNAL -> InterpretedState.SHARED_REEL
                            else -> InterpretedState.SINGLE_REEL
                        }
                        Triple(ViewingKind.INTENTIONAL, interpreted, BlockReason.SWIPED_PAST_ALLOWANCE)
                    }
                    else -> Triple(ViewingKind.BROWSING, InterpretedState.REELS_FEED, BlockReason.SWIPED_PAST_ALLOWANCE)
                }
            }
            ScreenState.HOME -> Triple(ViewingKind.NONE, InterpretedState.HOME, BlockReason.REELS_FEED)
            ScreenState.DM_INBOX, ScreenState.DM_THREAD -> Triple(ViewingKind.NONE, InterpretedState.DM, BlockReason.REELS_FEED)
            ScreenState.EXPLORE -> Triple(ViewingKind.NONE, InterpretedState.EXPLORE, BlockReason.EXPLORE_BLOCKED)
            ScreenState.PROFILE -> Triple(ViewingKind.NONE, InterpretedState.PROFILE, BlockReason.REELS_FEED)
            ScreenState.STORIES -> Triple(ViewingKind.NONE, InterpretedState.STORIES, BlockReason.REELS_FEED)
            ScreenState.OTHER -> Triple(ViewingKind.NONE, InterpretedState.OTHER, BlockReason.REELS_FEED)
            ScreenState.UNKNOWN -> Triple(ViewingKind.NONE, InterpretedState.UNKNOWN, BlockReason.REELS_FEED)
        }
    }

    /** Remaining browsing budget, for display. Null when there is no finite limit. */
    fun remainingBrowsingMs(policy: Policy, usage: UsageState): Long? {
        if (!policy.hasFiniteDailyLimit) return null
        val used = usage.browsingMs + if (policy.countIntentionalTowardLimit) usage.intentionalMs else 0
        return (policy.dailyBrowsingLimitMs - used).coerceAtLeast(0)
    }
}
