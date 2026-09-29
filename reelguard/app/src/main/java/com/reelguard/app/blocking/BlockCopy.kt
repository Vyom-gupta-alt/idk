package com.reelguard.app.blocking

import com.reelguard.app.domain.BlockReason
import com.reelguard.app.domain.Policy
import com.reelguard.app.domain.TimeStamp
import com.reelguard.app.domain.UsageState
import com.reelguard.app.ui.components.formatCountdown
import com.reelguard.app.ui.components.formatMinutes

data class BlockCopy(
    val title: String,
    val body: String,
    /** Whether returning to Instagram makes sense (false when all of Instagram is blocked). */
    val canReturnToInstagram: Boolean,
    val reassurance: String = "Messages, and Reels your friends send you, still work.",
)

/** Plain, non-judgmental explanations. No impersonation of Instagram or Android system UI. */
object BlockCopyFactory {
    fun create(reason: BlockReason, policy: Policy, usage: UsageState, now: TimeStamp): BlockCopy = when (reason) {
        BlockReason.REELS_FEED -> BlockCopy(
            title = "Reels feed is blocked",
            body = "ReelGuard keeps the endless Reels feed closed.",
            canReturnToInstagram = true,
        )
        BlockReason.SWIPED_PAST_ALLOWANCE -> BlockCopy(
            title = "That's the end of what was shared",
            body = "Swiping on from a shared Reel leads into the Reels feed, so ReelGuard stopped here.",
            canReturnToInstagram = true,
        )
        BlockReason.REEL_NOT_INTENTIONAL -> BlockCopy(
            title = "Only Reels shared with you are allowed",
            body = "Your current mode allows Reels opened from your messages or from links, not from other parts of Instagram.",
            canReturnToInstagram = true,
        )
        BlockReason.DAILY_LIMIT_REACHED -> BlockCopy(
            title = "You've reached today's Reels limit",
            body = "${formatMinutes(usage.browsingMs)} of ${formatMinutes(policy.dailyBrowsingLimitMs)} used. " +
                "Your limit resets at midnight.",
            canReturnToInstagram = true,
        )
        BlockReason.OUTSIDE_ALLOWED_PERIOD -> BlockCopy(
            title = "Reels aren't available right now",
            body = "Allowed times: " + policy.allowedPeriods.joinToString { it.label() } + ".",
            canReturnToInstagram = true,
        )
        BlockReason.COOLDOWN_ACTIVE -> {
            val remaining = usage.cooldownUntil?.remainingMs(now) ?: 0
            BlockCopy(
                title = "Taking a break",
                body = "You watched Reels continuously for a while. Reels are available again in " +
                    "${formatCountdown(remaining)}.",
                canReturnToInstagram = policy.cooldownScope == com.reelguard.app.domain.CooldownScope.REELS_ONLY,
                reassurance = if (policy.cooldownScope == com.reelguard.app.domain.CooldownScope.REELS_ONLY) {
                    "Messages still work during the break."
                } else {
                    "All of Instagram is paused during this break (your choice in settings)."
                },
            )
        }
        BlockReason.EXPLORE_BLOCKED -> BlockCopy(
            title = "Explore is blocked",
            body = "Explore is turned off in your current mode.",
            canReturnToInstagram = true,
        )
        BlockReason.ALTERNATIVE_CLIENT -> BlockCopy(
            title = "This Instagram app is blocked",
            body = "ReelGuard can only tell messages apart from Reels in the main Instagram app, so other " +
                "Instagram apps (like Instagram Lite) are blocked. You can change this in settings.",
            canReturnToInstagram = false,
            reassurance = "Use the main Instagram app for messages.",
        )
    }
}
