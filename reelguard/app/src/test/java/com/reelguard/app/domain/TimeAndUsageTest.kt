package com.reelguard.app.domain

import com.reelguard.app.testutil.FakeClock
import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TimeWindowTest {
    @Test fun simpleWindow() {
        val w = TimeWindow(18 * 60, 19 * 60)
        assertTrue(w.contains(18 * 60))
        assertTrue(w.contains(18 * 60 + 59))
        assertFalse(w.contains(19 * 60))
        assertFalse(w.contains(17 * 60))
    }

    @Test fun wrapsPastMidnight() {
        val w = TimeWindow(22 * 60, 1 * 60)
        assertTrue(w.contains(23 * 60))
        assertTrue(w.contains(30))
        assertFalse(w.contains(12 * 60))
    }

    @Test fun zeroLengthMeansAllDay() = assertTrue(TimeWindow(600, 600).contains(0))

    @Test(expected = IllegalArgumentException::class)
    fun rejectsOutOfRange() {
        TimeWindow(-1, 10)
    }

    @Test fun label() = assertEquals("07:05–22:30", TimeWindow(7 * 60 + 5, 22 * 60 + 30).label())
}

class DeadlineTest {
    @Test fun sameBootUsesMonotonicClock_wallClockChangesIgnored() {
        val clock = FakeClock()
        val d = Deadline.after(clock.now(), 30 * 60_000L)
        clock.setWallClock(clock.wallMs + 24 * 3_600_000L) // user jumps a day ahead
        assertTrue(d.isActive(clock.now()))
        assertEquals(30 * 60_000L, d.remainingMs(clock.now()))
        clock.advanceMinutes(30)
        assertFalse(d.isActive(clock.now()))
    }

    @Test fun afterRebootFallsBackToWallClock() {
        val clock = FakeClock()
        val d = Deadline.after(clock.now(), 30 * 60_000L)
        clock.reboot(downtimeMs = 10 * 60_000L)
        assertEquals(20 * 60_000L, d.remainingMs(clock.now()))
    }

    @Test fun remainingNeverNegative() {
        val clock = FakeClock()
        val d = Deadline.after(clock.now(), 1_000)
        clock.advanceMinutes(5)
        assertEquals(0, d.remainingMs(clock.now()))
    }
}

class UsageLogicTest {
    private val zone = ZoneOffset.UTC

    @Test fun firstUseSetsDayAndAnchor() {
        val clock = FakeClock()
        val s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        assertEquals("2026-09-29", s.day)
        assertEquals(clock.now(), s.anchor)
    }

    @Test fun applyAccumulates() {
        val clock = FakeClock()
        var s = UsageState()
        s = UsageLogic.apply(s, UsageDelta(browsingMs = 60_000, blocks = 1), clock.now(), zone)
        s = UsageLogic.apply(s, UsageDelta(browsingMs = 30_000, intentionalMs = 5_000), clock.now(), zone)
        assertEquals(90_000, s.browsingMs)
        assertEquals(5_000, s.intentionalMs)
        assertEquals(1, s.blocks)
    }

    @Test fun midnightRolloverArchivesYesterday() {
        val clock = FakeClock(LocalDateTime.of(2026, 9, 29, 23, 50))
        var s = UsageLogic.apply(UsageState(), UsageDelta(browsingMs = 120_000, blocks = 2), clock.now(), zone)
        clock.advanceMinutes(20)
        s = UsageLogic.rollover(s, clock.now(), zone)
        assertEquals("2026-09-30", s.day)
        assertEquals(0, s.browsingMs)
        assertEquals(DaySummary("2026-09-29", 120_000, 0, 2), s.history.first())
    }

    @Test fun movingWallClockForwardDoesNotResetTodaysUsage() {
        val clock = FakeClock(LocalDateTime.of(2026, 9, 29, 12, 0))
        var s = UsageLogic.apply(UsageState(), UsageDelta(browsingMs = 15 * 60_000L), clock.now(), zone)
        clock.setWallClock(clock.wallMs + 24 * 3_600_000L) // "it's tomorrow now"
        s = UsageLogic.rollover(s, clock.now(), zone)
        assertEquals("2026-09-29", s.day)
        assertEquals(15 * 60_000L, s.browsingMs)
    }

    @Test fun realTimePassingStillRollsOverEvenAfterClockTampering() {
        val clock = FakeClock(LocalDateTime.of(2026, 9, 29, 12, 0))
        var s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        clock.setWallClock(clock.wallMs - 3 * 3_600_000L) // set back 3h
        clock.elapsedMs += 13 * 3_600_000L // 13 real hours pass → 01:00 next day
        s = UsageLogic.rollover(s, clock.now(), zone)
        assertEquals("2026-09-30", s.day)
    }

    @Test fun neverRollsBackwardsAcrossReboot() {
        val clock = FakeClock(LocalDateTime.of(2026, 9, 29, 12, 0))
        var s = UsageLogic.apply(UsageState(), UsageDelta(browsingMs = 60_000), clock.now(), zone)
        clock.reboot()
        clock.setWallClock(LocalDateTime.of(2026, 9, 28, 12, 0).toInstant(zone).toEpochMilli())
        s = UsageLogic.rollover(s, clock.now(), zone)
        assertEquals("2026-09-29", s.day)
        assertEquals(60_000, s.browsingMs)
    }

    @Test fun historyIsCapped() {
        val clock = FakeClock()
        var s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        repeat(20) {
            clock.advance(24 * 3_600_000L)
            s = UsageLogic.rollover(s, clock.now(), zone)
        }
        assertEquals(UsageState.HISTORY_DAYS, s.history.size)
    }

    @Test fun lastSevenDaysOldestFirst() {
        val clock = FakeClock()
        var s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        repeat(3) {
            s = UsageLogic.apply(s, UsageDelta(browsingMs = 1_000L * (it + 1)), clock.now(), zone)
            clock.advance(24 * 3_600_000L)
            s = UsageLogic.rollover(s, clock.now(), zone)
        }
        val week = UsageLogic.lastSevenDays(s)
        assertEquals(4, week.size)
        assertEquals(s.day, week.last().day)
        assertEquals(1_000L, week.first().browsingMs)
    }

    @Test fun reportsAreCapped() {
        var s = UsageState()
        repeat(30) {
            s = UsageLogic.addReport(s, FalsePositiveReport(it.toLong(), BlockReason.REELS_FEED, ScreenState.REELS_TAB, null, 1, 1))
        }
        assertEquals(UsageState.MAX_REPORTS, s.reports.size)
        assertEquals(29L, s.reports.first().wallMs)
    }

    @Test fun negativeDeltasAreIgnored() {
        val clock = FakeClock()
        val s = UsageLogic.apply(UsageState(), UsageDelta(browsingMs = -5_000), clock.now(), zone)
        assertEquals(0, s.browsingMs)
    }
}

class UsageMeterTest {
    @Test fun attributesIntervalToKindOnScreenDuringIt() {
        val m = UsageMeter()
        assertTrue(m.tick(0, ViewingKind.BROWSING).isEmpty)
        assertEquals(4_000, m.tick(4_000, ViewingKind.INTENTIONAL).browsingMs)
        assertEquals(3_000, m.tick(7_000, ViewingKind.NONE).intentionalMs)
        assertTrue(m.tick(20_000, ViewingKind.NONE).isEmpty)
    }

    @Test fun capsLongGaps() {
        val m = UsageMeter(maxTickMs = 10_000)
        m.tick(0, ViewingKind.BROWSING)
        assertEquals(10_000, m.tick(3_600_000, ViewingKind.BROWSING).browsingMs)
    }
}

class ContinuousBrowsingTrackerTest {
    @Test fun accumulatesAndResetsAfterBreak() {
        val t = ContinuousBrowsingTracker(breakMs = 120_000)
        assertEquals(5_000, t.onBrowsing(5_000, 5_000))
        assertEquals(10_000, t.onBrowsing(10_000, 5_000))
        // 3-minute gap without browsing
        assertEquals(5_000, t.onBrowsing(10_000 + 180_000 + 5_000, 5_000))
    }

    @Test fun shortBreakDoesNotReset() {
        val t = ContinuousBrowsingTracker(breakMs = 120_000)
        t.onBrowsing(5_000, 5_000)
        assertEquals(10_000, t.onBrowsing(5_000 + 60_000 + 5_000, 5_000))
    }
}
