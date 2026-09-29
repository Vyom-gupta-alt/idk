package com.reelguard.app.domain

import com.reelguard.app.testutil.FakeClock
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicyResolverTest {
    @Test fun strictAllowsNoBrowsingAndBlocksExplore() {
        val p = PolicyResolver.resolve(UserSettings(mode = ProtectionMode.STRICT))
        assertEquals(0, p.dailyBrowsingLimitMs)
        assertEquals(0, p.dmReelAllowance)
        assertTrue(p.blockExplore)
        assertTrue(!p.allowOtherSingleReels)
    }

    @Test fun friendAllowsOneExtraDmReel() {
        val p = PolicyResolver.resolve(UserSettings(mode = ProtectionMode.FRIEND))
        assertEquals(1, p.dmReelAllowance)
        assertEquals(0, p.dailyBrowsingLimitMs)
    }

    @Test fun timeLimitUsesConfiguredMinutes() {
        val p = PolicyResolver.resolve(UserSettings(mode = ProtectionMode.TIME_LIMIT, timeLimitMinutes = 20))
        assertEquals(20 * 60_000L, p.dailyBrowsingLimitMs)
        assertTrue(p.hasFiniteDailyLimit)
    }

    @Test fun cooldownIsUnlimitedDailyWithContinuousLimit() {
        val p = PolicyResolver.resolve(
            UserSettings(mode = ProtectionMode.COOLDOWN, cooldownModeContinuousMinutes = 10, cooldownModeCooldownMinutes = 30),
        )
        assertEquals(Policy.UNLIMITED, p.dailyBrowsingLimitMs)
        assertTrue(!p.hasFiniteDailyLimit)
        assertEquals(10 * 60_000L, p.continuousLimitMs)
        assertEquals(30 * 60_000L, p.cooldownMs)
    }

    @Test fun customClampsValues() {
        val p = PolicyResolver.resolve(
            UserSettings(mode = ProtectionMode.CUSTOM, custom = CustomSettings(dmReelAllowance = 99, dailyLimitMinutes = -5)),
        )
        assertEquals(20, p.dmReelAllowance)
        assertEquals(0, p.dailyBrowsingLimitMs)
    }

    @Test fun defaultsAreProtective() {
        val s = UserSettings()
        assertTrue(s.protectionEnabled)
        assertEquals(ProtectionMode.FRIEND, s.mode)
        assertTrue(s.blockInstagramLite)
        assertTrue(s.settingsLock)
    }

    @Test fun monitoredPackagesAreOnlyInstagramPlusExtras() {
        val s = UserSettings(blockedExtraPackages = listOf("com.example.igclient"))
        assertEquals(listOf("com.instagram.android", "com.instagram.lite", "com.example.igclient"), s.monitoredPackages())
        assertEquals(AppKind.EXTRA_CLIENT, s.appKindOf("com.example.igclient"))
        assertEquals(AppKind.UNRELATED, s.appKindOf("com.whatsapp"))
    }

    @Test fun packageNameValidation() {
        assertTrue(InstagramPackages.isValidPackageName("com.example.app"))
        assertTrue(!InstagramPackages.isValidPackageName("nodots"))
        assertTrue(!InstagramPackages.isValidPackageName("com.example app"))
    }
}

class BlockDecisionEngineTest {
    private val clock = FakeClock()

    private fun ctx(
        mode: ProtectionMode = ProtectionMode.FRIEND,
        screen: ScreenState,
        session: ReelSession? = null,
        usage: UsageState = UsageState(),
        settings: UserSettings = UserSettings(mode = mode),
        appKind: AppKind = AppKind.INSTAGRAM,
        minute: Int = 12 * 60,
    ) = EvaluationContext(
        policy = PolicyResolver.resolve(settings),
        protectionEnabled = settings.protectionEnabled,
        appKind = appKind,
        blockInstagramLite = settings.blockInstagramLite,
        screen = screen,
        session = session,
        usage = usage,
        now = clock.now(),
        minuteOfDay = minute,
    )

    private fun session(origin: ReelOrigin, seen: Int = 1) = ReelSession(origin, 0, seen)

    private fun reason(e: Evaluation) = (e.decision as? Decision.Block)?.reason

    @Test fun reelsTabBlockedInFriendMode() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB))
        assertEquals(BlockReason.REELS_FEED, reason(e))
        assertEquals(InterpretedState.REELS_FEED, e.interpreted)
    }

    @Test fun dmReelAllowedWithinAllowance() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.DM, 2)))
        assertEquals(Decision.Allow, e.decision)
        assertEquals(ViewingKind.INTENTIONAL, e.kind)
        assertEquals(InterpretedState.DM_REEL, e.interpreted)
    }

    @Test fun swipingPastDmAllowanceBlocks() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.DM, 3)))
        assertEquals(BlockReason.SWIPED_PAST_ALLOWANCE, reason(e))
    }

    @Test fun strictAllowsExactlyOneDmReel() {
        val ok = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.REEL_VIEWER, session(ReelOrigin.DM, 1)))
        assertEquals(Decision.Allow, ok.decision)
        val blocked = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.REEL_VIEWER, session(ReelOrigin.DM, 2)))
        assertEquals(BlockReason.SWIPED_PAST_ALLOWANCE, reason(blocked))
    }

    @Test fun strictBlocksReelsFromProfilesAndUnknownOrigins() {
        for (o in listOf(ReelOrigin.PROFILE, ReelOrigin.HOME_FEED, ReelOrigin.UNKNOWN)) {
            val e = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.REEL_VIEWER, session(o)))
            assertEquals(o.name, BlockReason.REEL_NOT_INTENTIONAL, reason(e))
        }
    }

    @Test fun friendAllowsSingleProfileReelButNotSwiping() {
        assertEquals(Decision.Allow, BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.PROFILE))).decision)
        assertEquals(
            BlockReason.SWIPED_PAST_ALLOWANCE,
            reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.PROFILE, 2)))),
        )
    }

    @Test fun externalLinksAllowedAsSingleReel() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.EXTERNAL)))
        assertEquals(Decision.Allow, e.decision)
        assertEquals(InterpretedState.SHARED_REEL, e.interpreted)
    }

    @Test fun externalCanBeDisallowedInCustom() {
        val s = UserSettings(mode = ProtectionMode.CUSTOM, custom = CustomSettings(dailyLimitMinutes = 0, allowExternalReels = false))
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.EXTERNAL), settings = s))
        assertEquals(BlockReason.REEL_NOT_INTENTIONAL, reason(e))
    }

    @Test fun missingSessionTreatedAsUnknownOrigin() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = null))
        assertEquals(Decision.Allow, e.decision) // Friend allows one single Reel
    }

    @Test fun timeLimitAllowsBrowsingUntilLimit() {
        val s = UserSettings(mode = ProtectionMode.TIME_LIMIT, timeLimitMinutes = 10)
        val under = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = s, usage = UsageState(browsingMs = 9 * 60_000L)))
        assertEquals(Decision.Allow, under.decision)
        assertEquals(ViewingKind.BROWSING, under.kind)
        val over = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = s, usage = UsageState(browsingMs = 10 * 60_000L)))
        assertEquals(BlockReason.DAILY_LIMIT_REACHED, reason(over))
    }

    @Test fun dmReelsStillWorkAfterDailyLimit() {
        val s = UserSettings(mode = ProtectionMode.TIME_LIMIT, timeLimitMinutes = 10)
        val e = BlockDecisionEngine.evaluate(
            ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.DM), settings = s, usage = UsageState(browsingMs = 60 * 60_000L)),
        )
        assertEquals(Decision.Allow, e.decision)
    }

    @Test fun countIntentionalTowardLimitBlocksSharedReelsToo() {
        val s = UserSettings(mode = ProtectionMode.CUSTOM, custom = CustomSettings(dailyLimitMinutes = 5, countIntentionalTowardLimit = true))
        val e = BlockDecisionEngine.evaluate(
            ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.DM), settings = s, usage = UsageState(intentionalMs = 5 * 60_000L)),
        )
        assertEquals(BlockReason.DAILY_LIMIT_REACHED, reason(e))
    }

    @Test fun allowedPeriods() {
        val s = UserSettings(
            mode = ProtectionMode.CUSTOM,
            custom = CustomSettings(dailyLimitMinutes = 30, allowedPeriods = listOf(TimeWindow(18 * 60, 19 * 60))),
        )
        assertEquals(BlockReason.OUTSIDE_ALLOWED_PERIOD, reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = s, minute = 12 * 60))))
        assertEquals(Decision.Allow, BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = s, minute = 18 * 60 + 30)).decision)
    }

    @Test fun cooldownReelsOnlyKeepsMessagesAndDmReels() {
        val usage = UsageState(cooldownUntil = Deadline.after(clock.now(), 60_000))
        val s = UserSettings(mode = ProtectionMode.COOLDOWN)
        assertEquals(BlockReason.COOLDOWN_ACTIVE, reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = s, usage = usage))))
        assertEquals(Decision.Allow, BlockDecisionEngine.evaluate(ctx(screen = ScreenState.DM_THREAD, settings = s, usage = usage)).decision)
        assertEquals(Decision.Allow, BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REEL_VIEWER, session = session(ReelOrigin.DM), settings = s, usage = usage)).decision)
    }

    @Test fun cooldownAllInstagramBlocksEverything() {
        val usage = UsageState(cooldownUntil = Deadline.after(clock.now(), 60_000))
        val s = UserSettings(mode = ProtectionMode.CUSTOM, custom = CustomSettings(continuousLimitMinutes = 10, cooldownScope = CooldownScope.ALL_INSTAGRAM))
        assertEquals(BlockReason.COOLDOWN_ACTIVE, reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.DM_THREAD, settings = s, usage = usage))))
    }

    @Test fun expiredCooldownDoesNothing() {
        val usage = UsageState(cooldownUntil = Deadline.after(clock.now(), 60_000))
        clock.advanceMinutes(2)
        val e = BlockDecisionEngine.evaluate(ctx(ProtectionMode.COOLDOWN, ScreenState.REELS_TAB, usage = usage))
        assertEquals(Decision.Allow, e.decision)
    }

    @Test fun exploreBlockedOnlyWhenConfigured() {
        assertEquals(BlockReason.EXPLORE_BLOCKED, reason(BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.EXPLORE))))
        assertEquals(Decision.Allow, BlockDecisionEngine.evaluate(ctx(ProtectionMode.FRIEND, ScreenState.EXPLORE)).decision)
    }

    @Test fun normalScreensAlwaysAllowed() {
        for (screen in listOf(ScreenState.HOME, ScreenState.DM_INBOX, ScreenState.DM_THREAD, ScreenState.PROFILE, ScreenState.STORIES, ScreenState.OTHER, ScreenState.UNKNOWN)) {
            val e = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, screen))
            assertEquals(screen.name, Decision.Allow, e.decision)
            assertEquals(ViewingKind.NONE, e.kind)
        }
    }

    @Test fun overrideAllowsEverythingButStillCountsKind() {
        val usage = UsageState(overrideUntil = Deadline.after(clock.now(), 5 * 60_000L))
        val e = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.REELS_TAB, usage = usage))
        assertEquals(Decision.Allow, e.decision)
        assertEquals(ViewingKind.BROWSING, e.kind)
    }

    @Test fun protectionDisabledAllows() {
        val e = BlockDecisionEngine.evaluate(ctx(screen = ScreenState.REELS_TAB, settings = UserSettings(protectionEnabled = false)))
        assertEquals(Decision.Allow, e.decision)
    }

    @Test fun instagramLiteAndExtraClients() {
        assertEquals(BlockReason.ALTERNATIVE_CLIENT, reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.OTHER, appKind = AppKind.INSTAGRAM_LITE))))
        assertEquals(
            Decision.Allow,
            BlockDecisionEngine.evaluate(ctx(screen = ScreenState.OTHER, appKind = AppKind.INSTAGRAM_LITE, settings = UserSettings(blockInstagramLite = false))).decision,
        )
        assertEquals(BlockReason.ALTERNATIVE_CLIENT, reason(BlockDecisionEngine.evaluate(ctx(screen = ScreenState.OTHER, appKind = AppKind.EXTRA_CLIENT))))
    }

    @Test fun unrelatedAppsAreNeverTouched() {
        val e = BlockDecisionEngine.evaluate(ctx(ProtectionMode.STRICT, ScreenState.REELS_TAB, appKind = AppKind.UNRELATED))
        assertEquals(Decision.Allow, e.decision)
        assertEquals(ViewingKind.NONE, e.kind)
    }

    @Test fun remainingBrowsing() {
        val p = PolicyResolver.resolve(UserSettings(mode = ProtectionMode.TIME_LIMIT, timeLimitMinutes = 15))
        assertEquals(3 * 60_000L, BlockDecisionEngine.remainingBrowsingMs(p, UsageState(browsingMs = 12 * 60_000L)))
        assertEquals(0L, BlockDecisionEngine.remainingBrowsingMs(p, UsageState(browsingMs = 99 * 60_000L)))
        assertNull(BlockDecisionEngine.remainingBrowsingMs(PolicyResolver.resolve(UserSettings()), UsageState()))
    }
}

class OverrideManagerTest {
    private val clock = FakeClock()
    private val zone = ZoneOffset.UTC
    private val settings = OverrideSettings(maxDurationMinutes = 15, cooldownMinutes = 60, maxPerDay = 2)

    @Test fun grantThenActiveThenCooldownThenAvailable() {
        val s0 = UsageLogic.rollover(UsageState(), clock.now(), zone)
        assertTrue(OverrideManager.availability(settings, s0, clock.now(), zone) is OverrideAvailability.Available)
        val s1 = OverrideManager.grant(settings, s0, clock.now(), zone, 5)!!
        assertTrue(s1.overrideUntil!!.isActive(clock.now()))
        assertTrue(OverrideManager.availability(settings, s1, clock.now(), zone) is OverrideAvailability.AlreadyActive)
        clock.advanceMinutes(6)
        assertTrue(OverrideManager.availability(settings, s1, clock.now(), zone) is OverrideAvailability.CoolingDown)
        clock.advanceMinutes(60)
        assertTrue(OverrideManager.availability(settings, s1, clock.now(), zone) is OverrideAvailability.Available)
    }

    @Test fun durationIsCapped() {
        val s = OverrideManager.grant(settings, UsageState(), clock.now(), zone, 120)!!
        assertEquals(15 * 60_000L, s.overrideUntil!!.remainingMs(clock.now()))
    }

    @Test fun dailyCap() {
        var s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        repeat(2) {
            s = OverrideManager.grant(settings, s, clock.now(), zone, 5)!!
            clock.advanceMinutes(70)
        }
        assertEquals(OverrideAvailability.DailyCapReached(2), OverrideManager.availability(settings, s, clock.now(), zone))
        assertNull(OverrideManager.grant(settings, s, clock.now(), zone, 5))
    }

    @Test fun capResetsNextDay() {
        var s = UsageLogic.rollover(UsageState(), clock.now(), zone)
        repeat(2) {
            s = OverrideManager.grant(settings, s, clock.now(), zone, 5)!!
            clock.advanceMinutes(70)
        }
        clock.advance(24 * 3_600_000L)
        assertTrue(OverrideManager.availability(settings, s, clock.now(), zone) is OverrideAvailability.Available)
    }

    @Test fun disabled() {
        assertEquals(
            OverrideAvailability.Disabled,
            OverrideManager.availability(settings.copy(enabled = false), UsageState(), clock.now(), zone),
        )
    }

    @Test fun clockTamperingDoesNotEndCooldown() {
        val s = OverrideManager.grant(settings, UsageState(), clock.now(), zone, 5)!!
        clock.advanceMinutes(6)
        clock.setWallClock(clock.wallMs + 5 * 3_600_000L)
        assertTrue(OverrideManager.availability(settings, s, clock.now(), zone) is OverrideAvailability.CoolingDown)
    }

    @Test fun reasonRules() {
        assertTrue(!OverrideManager.isReasonAcceptable(settings, "short"))
        assertTrue(OverrideManager.isReasonAcceptable(settings, "watching a tutorial for class"))
        assertTrue(OverrideManager.isReasonAcceptable(settings.copy(requireReason = false), ""))
    }

    @Test fun durationChoicesRespectMax() {
        assertEquals(listOf(5, 10), OverrideManager.durationChoices(settings.copy(maxDurationMinutes = 10)))
        assertEquals(listOf(5, 7), OverrideManager.durationChoices(settings.copy(maxDurationMinutes = 7)))
    }

    @Test fun endEarly() {
        val s = OverrideManager.grant(settings, UsageState(), clock.now(), zone, 5)!!
        assertNull(OverrideManager.endEarly(s).overrideUntil)
    }
}
