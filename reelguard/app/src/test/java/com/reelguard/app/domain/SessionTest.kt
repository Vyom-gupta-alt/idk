package com.reelguard.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun scroll(t: Long, from: Int = -1, to: Int = -1, dy: Int? = null, dx: Int? = null, pager: Boolean = true) =
    ScrollSample(t, from, to, dy, dx, pager)

class SwipeCounterTest {
    @Test fun indexModeCountsDistinctSettledReels() {
        val c = SwipeCounter()
        c.onScroll(scroll(0, 0, 1)) // mid-swipe from reel 0
        assertEquals(0, c.extraReels)
        c.onScroll(scroll(100, 1, 1)) // settled on reel 1
        assertEquals(1, c.extraReels)
        c.onScroll(scroll(900, 1, 2))
        c.onScroll(scroll(1000, 2, 2))
        assertEquals(2, c.extraReels)
    }

    @Test fun indexModeSwipingBackDoesNotCount() {
        val c = SwipeCounter()
        c.onScroll(scroll(0, 0, 1)); c.onScroll(scroll(50, 1, 1))
        c.onScroll(scroll(900, 0, 1)); c.onScroll(scroll(950, 0, 0))
        assertEquals(1, c.extraReels)
    }

    @Test fun gestureModeCountsBursts() {
        val c = SwipeCounter(gestureGapMs = 600)
        c.onScroll(scroll(0)); c.onScroll(scroll(50)); c.onScroll(scroll(100))
        assertEquals(1, c.extraReels)
        c.onScroll(scroll(2_000)); c.onScroll(scroll(2_050))
        assertEquals(2, c.extraReels)
    }

    @Test fun gestureModeIgnoresUpwardSwipes() {
        val c = SwipeCounter()
        c.onScroll(scroll(0, dy = -800))
        assertEquals(0, c.extraReels)
        c.onScroll(scroll(2_000, dy = 800))
        assertEquals(1, c.extraReels)
    }

    @Test fun ignoresHorizontalAndNonPagerScrolls() {
        val c = SwipeCounter()
        assertFalse(c.onScroll(scroll(0, dy = 0, dx = 300)))
        assertFalse(c.onScroll(scroll(1_000, pager = false))) // e.g. comments sheet
        assertEquals(0, c.extraReels)
    }

    @Test fun onceInIndexModeIndexlessEventsAreIgnored() {
        val c = SwipeCounter()
        c.onScroll(scroll(0, 0, 0))
        c.onScroll(scroll(2_000))
        assertEquals(0, c.extraReels)
    }
}

class ReelSessionTrackerTest {
    @Test fun originFromDmThread() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 3_000)
        assertEquals(ReelOrigin.DM, t.session!!.origin)
        assertEquals(1, t.session!!.reelsSeen)
    }

    @Test fun originFromReelsTab() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.HOME, 1_000)
        t.onScreen(ScreenState.REELS_TAB, 2_000)
        assertEquals(ReelOrigin.REELS_TAB, t.session!!.origin)
    }

    @Test fun enteringTabFromViewerUpgradesOrigin() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 2_000)
        t.onScreen(ScreenState.REELS_TAB, 3_000)
        assertEquals(ReelOrigin.REELS_TAB, t.session!!.origin)
    }

    @Test fun externalWhenInstagramWasNotInFront() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onLeftInstagram(2_000)
        t.onScreen(ScreenState.REEL_VIEWER, 60_000) // e.g. tapped a notification
        assertEquals(ReelOrigin.EXTERNAL, t.session!!.origin)
    }

    @Test fun externalAfterLongSilence() {
        val t = ReelSessionTracker(externalGapMs = 120_000)
        t.onScreen(ScreenState.HOME, 0)
        t.onScreen(ScreenState.REEL_VIEWER, 10 * 60_000L)
        assertEquals(ReelOrigin.EXTERNAL, t.session!!.origin)
    }

    @Test fun firstEverScreenBeingViewerIsExternal() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.REEL_VIEWER, 1_000)
        assertEquals(ReelOrigin.EXTERNAL, t.session!!.origin)
    }

    @Test fun otherOrigins() {
        mapOf(
            ScreenState.PROFILE to ReelOrigin.PROFILE,
            ScreenState.HOME to ReelOrigin.HOME_FEED,
            ScreenState.EXPLORE to ReelOrigin.EXPLORE,
            ScreenState.STORIES to ReelOrigin.STORIES,
        ).forEach { (before, origin) ->
            val t = ReelSessionTracker()
            t.onScreen(before, 1_000)
            t.onScreen(ScreenState.REEL_VIEWER, 2_000)
            assertEquals(origin, t.session!!.origin)
        }
    }

    @Test fun unknownDoesNotEndSession() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 2_000)
        t.onScreen(ScreenState.UNKNOWN, 3_000)
        assertEquals(ReelOrigin.DM, t.session?.origin)
    }

    @Test fun swipesIncreaseReelsSeen() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 2_000)
        t.onScroll(scroll(3_000))
        t.onScroll(scroll(5_000))
        assertEquals(3, t.session!!.reelsSeen)
    }

    @Test fun shortDetourResumesSessionSoAllowanceIsNotRefreshed() {
        val t = ReelSessionTracker(resumeWindowMs = 20_000)
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 2_000)
        t.onScroll(scroll(3_000)); t.onScroll(scroll(5_000))
        t.onScreen(ScreenState.PROFILE, 6_000) // tap the author
        t.onScreen(ScreenState.REEL_VIEWER, 9_000) // back
        assertEquals(ReelOrigin.DM, t.session!!.origin)
        assertEquals(3, t.session!!.reelsSeen)
    }

    @Test fun returningViaDmStartsFreshSession() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.DM_THREAD, 1_000)
        t.onScreen(ScreenState.REEL_VIEWER, 2_000)
        t.onScroll(scroll(3_000)); t.onScroll(scroll(5_000))
        t.onScreen(ScreenState.DM_THREAD, 6_000)
        t.onScreen(ScreenState.REEL_VIEWER, 8_000) // tapped the next Reel a friend sent
        assertEquals(1, t.session!!.reelsSeen)
    }

    @Test fun leavingInstagramEndsSession() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.REELS_TAB, 1_000)
        t.onLeftInstagram(2_000)
        assertNull(t.session)
    }

    @Test fun scrollWithoutSessionIsIgnored() {
        val t = ReelSessionTracker()
        t.onScreen(ScreenState.HOME, 1_000)
        t.onScroll(scroll(2_000))
        assertNull(t.session)
        assertTrue(true)
    }
}
