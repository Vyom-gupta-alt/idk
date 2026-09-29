package com.reelguard.app.domain

import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.detection.RuleBasedInstagramStateDetector
import com.reelguard.app.detection.SignalExtractor
import com.reelguard.app.testutil.FakeClock
import com.reelguard.app.testutil.FakeNode
import com.reelguard.app.testutil.IgScreens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * End-to-end scenarios: mock Instagram trees → detector → engine → decisions/usage.
 * This is the "accessibility integration" layer, minus the Android framework.
 */
class GuardEngineTest {
    private val clock = FakeClock()
    private val blocks = mutableListOf<BlockRequest>()
    private val persisted = mutableListOf<UsageDelta>()
    private var lastStatus: LiveStatus? = null

    private val sink = object : GuardEngine.Sink {
        override fun persist(delta: UsageDelta) { persisted += delta }
        override fun block(request: BlockRequest) { blocks += request }
        override fun status(status: LiveStatus) { lastStatus = status }
    }

    private val extractor = SignalExtractor(DetectionRules.DEFAULT)
    private val detector = RuleBasedInstagramStateDetector()

    private fun engine(settings: UserSettings = UserSettings()) = GuardEngine(clock, sink).also { it.settings = settings }

    private fun GuardEngine.show(tree: FakeNode) = onDetection(detector.detect(extractor.extract(tree), clock.elapsedMs), true)

    private fun GuardEngine.swipe() {
        clock.advance(1_000)
        onScroll(ScrollSample(clock.elapsedMs, -1, -1, 900, 0, true))
    }

    /** Mirrors the service: heartbeats only run while time is being attributed. */
    private fun GuardEngine.watch(seconds: Int) {
        repeat(seconds / 5) {
            if (!needsHeartbeat()) return
            clock.advance(5_000)
            onHeartbeat(Foreground.MONITORED)
        }
    }

    @Test fun messagingNeverBlocks() {
        val e = engine(UserSettings(mode = ProtectionMode.STRICT))
        e.show(IgScreens.home())
        e.show(IgScreens.dmInbox())
        e.show(IgScreens.dmThread())
        e.show(IgScreens.profile())
        e.show(IgScreens.storyViewer())
        assertTrue(blocks.isEmpty())
    }

    @Test fun reelsTabIsBlockedImmediatelyWithBack() {
        val e = engine()
        e.show(IgScreens.home())
        clock.advance(500)
        e.show(IgScreens.reelsTab())
        assertEquals(1, blocks.size)
        assertEquals(BlockReason.REELS_FEED, blocks[0].reason)
        assertEquals(BlockAction.BACK, blocks[0].action)
    }

    @Test fun dmReelPlaysThenSwipingIntoFeedIsBlocked() {
        val e = engine() // Friend: 1 + 1 allowed
        e.show(IgScreens.dmThread())
        clock.advance(1_000)
        e.show(IgScreens.dmReelViewer())
        e.watch(30)
        assertTrue(blocks.isEmpty())
        assertEquals(InterpretedState.DM_REEL, lastStatus!!.interpreted)

        e.swipe() // second Reel (allowance)
        assertTrue(blocks.isEmpty())
        e.swipe() // third → feed browsing
        assertEquals(BlockReason.SWIPED_PAST_ALLOWANCE, blocks.single().reason)
    }

    @Test fun intentionalTimeIsCountedSeparatelyFromBrowsing() {
        val e = engine()
        e.show(IgScreens.dmThread())
        clock.advance(1_000)
        e.show(IgScreens.dmReelViewer())
        e.watch(60)
        e.show(IgScreens.dmThread())
        e.flush()
        val u = e.effectiveUsage()
        assertEquals(60_000L, u.intentionalMs)
        assertEquals(0L, u.browsingMs)
    }

    @Test fun burstOfEventsProducesOneBlock_thenEscalatesToHomeIfBackDidNotWork() {
        val e = engine()
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        clock.advance(200); e.show(IgScreens.reelsTab())
        clock.advance(200); e.show(IgScreens.reelsTab())
        assertEquals(1, blocks.size)
        clock.advance(2_000); e.show(IgScreens.reelsTab()) // still on Reels after Back
        assertEquals(2, blocks.size)
        assertEquals(BlockAction.HOME, blocks[1].action)
    }

    @Test fun timeLimitCountsBrowsingAndBlocksAtLimit() {
        val e = engine(UserSettings(mode = ProtectionMode.TIME_LIMIT, timeLimitMinutes = 5))
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        assertTrue(blocks.isEmpty())
        e.watch(4 * 60)
        assertTrue(blocks.isEmpty())
        e.watch(65)
        assertEquals(BlockReason.DAILY_LIMIT_REACHED, blocks.single().reason)
        assertTrue(e.effectiveUsage().browsingMs >= 5 * 60_000L)
    }

    @Test fun cooldownStartsAfterContinuousBrowsing() {
        val e = engine(UserSettings(mode = ProtectionMode.COOLDOWN, cooldownModeContinuousMinutes = 2, cooldownModeCooldownMinutes = 10))
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        e.watch(125)
        assertEquals(BlockReason.COOLDOWN_ACTIVE, blocks.single().reason)
        assertTrue(e.effectiveUsage().cooldownUntil!!.isActive(clock.now()))

        // Messages still work during a Reels-only cooldown.
        e.show(IgScreens.dmThread())
        assertEquals(1, blocks.size)

        // After the cooldown, Reels are available again.
        clock.advanceMinutes(11)
        e.show(IgScreens.reelsTab())
        assertEquals(1, blocks.size)
    }

    @Test fun overrideAllowsFeedUntilItEnds() {
        val e = engine()
        e.storedUsage = OverrideManager.grant(OverrideSettings(), UsageState(), clock.now(), clock.zone(), 5)!!
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        e.watch(4 * 60)
        assertTrue(blocks.isEmpty())
        e.watch(90) // override ends while watching; the heartbeat notices
        assertEquals(BlockReason.REELS_FEED, blocks.single().reason)
    }

    @Test fun leavingInstagramStopsCountingAndHeartbeat() {
        val e = engine(UserSettings(mode = ProtectionMode.TIME_LIMIT))
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        e.watch(30)
        assertTrue(e.needsHeartbeat())
        clock.advance(5_000)
        e.onHeartbeat(Foreground.OTHER)
        assertFalse(e.needsHeartbeat())
        val before = e.effectiveUsage().browsingMs
        clock.advanceMinutes(30)
        assertEquals(before, e.effectiveUsage().browsingMs)
    }

    @Test fun unknownForegroundStopsCountingAfterTimeout() {
        val e = engine(UserSettings(mode = ProtectionMode.TIME_LIMIT))
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        repeat(20) {
            clock.advance(5_000)
            e.onHeartbeat(Foreground.UNKNOWN)
        }
        assertFalse(e.needsHeartbeat())
        assertTrue(e.effectiveUsage().browsingMs <= 65_000L)
    }

    @Test fun notificationOpenedReelIsAllowedAsSharedReel() {
        val e = engine()
        e.show(IgScreens.dmThread())
        e.onLeftInstagram()
        clock.advanceMinutes(10)
        e.show(IgScreens.dmReelViewer()) // opened from a notification / link
        assertTrue(blocks.isEmpty())
        assertEquals(ReelOrigin.EXTERNAL, e.session!!.origin)
        e.swipe()
        assertEquals(BlockReason.SWIPED_PAST_ALLOWANCE, blocks.single().reason)
    }

    @Test fun instagramLiteIsBlockedWithHome() {
        val e = engine()
        e.onAlternativeClient(AppKind.INSTAGRAM_LITE, isActiveWindow = true)
        assertEquals(BlockReason.ALTERNATIVE_CLIENT, blocks.single().reason)
        assertEquals(BlockAction.HOME, blocks.single().action)
    }

    @Test fun splitScreenWithoutFocusOnlyShowsBlockScreen() {
        val e = engine()
        e.show(IgScreens.home())
        e.onDetection(detector.detect(extractor.extract(IgScreens.reelsTab()), clock.elapsedMs), instagramIsActiveWindow = false)
        assertEquals(BlockAction.NONE, blocks.single().action)
    }

    @Test fun blocksArePersistedAsCounts() {
        val e = engine()
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        assertEquals(1, persisted.sumOf { it.blocks })
    }

    @Test fun protectionOffNeverBlocksButStillCounts() {
        val e = engine(UserSettings(protectionEnabled = false))
        e.show(IgScreens.home())
        e.show(IgScreens.reelsTab())
        e.watch(60)
        assertTrue(blocks.isEmpty())
        assertEquals(60_000L, e.effectiveUsage().browsingMs)
    }

    @Test fun strictModeBlocksExplore() {
        val e = engine(UserSettings(mode = ProtectionMode.STRICT))
        e.show(IgScreens.explore())
        assertEquals(BlockReason.EXPLORE_BLOCKED, blocks.single().reason)
    }
}
