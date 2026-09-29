package com.reelguard.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.os.Build
import android.view.accessibility.AccessibilityManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.reelguard.app.accessibility.ReelGuardAccessibilityService
import com.reelguard.app.blocking.BlockActivity
import com.reelguard.app.domain.BlockAction
import com.reelguard.app.domain.BlockReason
import com.reelguard.app.domain.BlockRequest
import com.reelguard.app.domain.InstagramPackages
import com.reelguard.app.domain.ScreenState
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Verifies the privacy-critical service declaration as parsed by the real OS. */
@RunWith(AndroidJUnit4::class)
class ServiceDeclarationTest {
    @Test fun serviceIsRestrictedToInstagramPackagesAndHonestlyDeclared() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val am = ctx.getSystemService(AccessibilityManager::class.java)
        val info = am.installedAccessibilityServiceList.firstOrNull {
            it.resolveInfo.serviceInfo.packageName == ctx.packageName &&
                it.resolveInfo.serviceInfo.name == ReelGuardAccessibilityService::class.java.name
        }
        assertNotNull("service not registered", info)
        info!!
        assertEquals(InstagramPackages.DEFAULT.toSet(), info.packageNames!!.toSet())
        assertTrue(info.flags and AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS != 0)
        val expectedEvents = android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
            android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
            android.view.accessibility.AccessibilityEvent.TYPE_VIEW_SCROLLED
        assertEquals(expectedEvents, info.eventTypes)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) assertFalse(info.isAccessibilityTool)
    }

    @Test fun appHasNoInternetPermission() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val requested = ctx.packageManager
            .getPackageInfo(ctx.packageName, android.content.pm.PackageManager.GET_PERMISSIONS)
            .requestedPermissions.orEmpty()
        assertFalse(requested.contains(android.Manifest.permission.INTERNET))
    }
}

@RunWith(AndroidJUnit4::class)
class OnboardingInstrumentedTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Before fun freshInstall() {
        val c = ApplicationProvider.getApplicationContext<Context>().container
        runBlocking { c.settings.reset() }
        rule.activityRule.scenario.recreate()
    }

    @Test fun welcomeThenHowItWorks() {
        rule.onNodeWithText("Instagram, without the endless Reels").assertIsDisplayed()
        rule.onNodeWithTag("onboarding_next").performClick()
        rule.onNodeWithText("How it works, honestly").assertIsDisplayed()
    }

    @Test fun survivesRotation() {
        rule.onNodeWithTag("onboarding_next").performClick()
        rule.activityRule.scenario.recreate()
        rule.onNodeWithText("How it works, honestly").assertIsDisplayed()
    }
}

@RunWith(AndroidJUnit4::class)
class BlockActivityInstrumentedTest {
    @get:Rule val rule = createEmptyComposeRule()
    private val ctx: Context get() = ApplicationProvider.getApplicationContext()

    private fun launch(reason: BlockReason) = ActivityScenario.launch<BlockActivity>(
        BlockActivity.intent(ctx, BlockRequest(reason, BlockAction.NONE, ScreenState.REELS_TAB, null, 1)),
    )

    @After fun lightMode() {
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("cmd uimode night no").close()
    }

    @Test fun showsReasonAndSurvivesRecreation() {
        launch(BlockReason.REELS_FEED).use { scenario ->
            rule.onNodeWithText("Reels feed is blocked").assertIsDisplayed()
            scenario.recreate()
            rule.onNodeWithText("Reels feed is blocked").assertIsDisplayed()
        }
    }

    @Test fun darkModeRenders() {
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("cmd uimode night yes").close()
        launch(BlockReason.DAILY_LIMIT_REACHED).use {
            rule.onNodeWithText("You've reached today's Reels limit").assertIsDisplayed()
        }
    }

    @Test fun overrideFlowOpensFromBlockScreen() {
        launch(BlockReason.REELS_FEED).use {
            rule.onNodeWithTag("block_override").performClick()
            rule.onNodeWithText("Temporary override").assertIsDisplayed()
        }
    }
}
