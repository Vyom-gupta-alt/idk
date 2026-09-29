package com.reelguard.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.reelguard.app.blocking.BlockCopyFactory
import com.reelguard.app.blocking.BlockScreen
import com.reelguard.app.domain.BlockReason
import com.reelguard.app.domain.PolicyResolver
import com.reelguard.app.domain.ProtectionMode
import com.reelguard.app.domain.TimeStamp
import com.reelguard.app.domain.UsageState
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.ui.components.FrictionGate
import com.reelguard.app.ui.screens.OnboardingContent
import com.reelguard.app.ui.screens.SettingsEditor
import com.reelguard.app.ui.theme.ReelGuardTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/**
 * Compose UI tests executed on the JVM with Robolectric (no device needed).
 * The same screens are also covered by instrumented tests under src/androidTest.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class BlockScreenUiTest {
    @get:Rule val rule = createComposeRule()
    private val now = TimeStamp(0, 0, 1)

    private fun copy(reason: BlockReason, mode: ProtectionMode = ProtectionMode.FRIEND) =
        BlockCopyFactory.create(reason, PolicyResolver.resolve(UserSettings(mode = mode)), UsageState(), now)

    @Test fun showsReasonAndAllActions() {
        var back = 0; var close = 0; var override = 0; var report = 0
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                BlockScreen(copy(BlockReason.REELS_FEED), true, false, { back++ }, { close++ }, { override++ }, { report++ })
            }
        }
        rule.onNodeWithText("Reels feed is blocked").assertIsDisplayed()
        rule.onNodeWithText("Messages, and Reels your friends send you, still work.").assertIsDisplayed()
        rule.onNodeWithTag("block_go_back").performClick()
        rule.onNodeWithTag("block_close").performClick()
        rule.onNodeWithTag("block_override").performClick()
        rule.onNodeWithTag("block_report").performScrollTo().performClick()
        assertEquals(listOf(1, 1, 1, 1), listOf(back, close, override, report))
    }

    @Test fun wholeAppBlockHidesGoBack() {
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                BlockScreen(copy(BlockReason.ALTERNATIVE_CLIENT), false, false, {}, {}, {}, {})
            }
        }
        rule.onNodeWithTag("block_go_back").assertDoesNotExist()
        rule.onNodeWithTag("block_override").assertDoesNotExist()
        rule.onNodeWithTag("block_close").assertIsDisplayed()
    }

    @Test fun reportButtonDisablesAfterSaving() {
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                BlockScreen(copy(BlockReason.SWIPED_PAST_ALLOWANCE), true, true, {}, {}, {}, {})
            }
        }
        rule.onNodeWithTag("block_report").performScrollTo().assertIsNotEnabled()
        rule.onNodeWithText("Saved on this device. See Diagnostics.").assertExists()
    }

    @Test fun rendersInDarkTheme() {
        rule.setContent {
            ReelGuardTheme(darkTheme = true, dynamicColor = false) {
                BlockScreen(copy(BlockReason.DAILY_LIMIT_REACHED, ProtectionMode.TIME_LIMIT), true, false, {}, {}, {}, {})
            }
        }
        rule.onNodeWithText("You've reached today's Reels limit").assertIsDisplayed()
    }
}

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class FrictionGateUiTest {
    @get:Rule val rule = createComposeRule()

    @Test fun confirmOnlyAfterCountdownAndReason() {
        var confirmed = false
        rule.mainClock.autoAdvance = false
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                FrictionGate("Pause?", "Explanation", delaySeconds = 3, requireReason = true, confirmLabel = "Pause",
                    onConfirm = { confirmed = true }, onCancel = {})
            }
        }
        rule.onNodeWithTag("friction_confirm").assertIsNotEnabled()
        rule.onNodeWithTag("friction_cancel").assertIsEnabled()
        rule.mainClock.advanceTimeBy(3_500)
        rule.onNodeWithTag("friction_confirm").assertIsNotEnabled() // reason still missing
        rule.onNodeWithTag("friction_reason").performTextInput("Checking a recipe video")
        rule.mainClock.advanceTimeByFrame()
        rule.onNodeWithTag("friction_confirm").assertIsEnabled().performClick()
        assertTrue(confirmed)
    }

    @Test fun countdownSurvivesConfigurationChange() {
        val restoration = StateRestorationTester(rule)
        rule.mainClock.autoAdvance = false
        restoration.setContent {
            ReelGuardTheme(dynamicColor = false) {
                FrictionGate("Pause?", "Explanation", delaySeconds = 10, requireReason = false, confirmLabel = "Pause",
                    onConfirm = {}, onCancel = {})
            }
        }
        rule.mainClock.advanceTimeBy(8_500)
        restoration.emulateSavedInstanceStateRestore()
        rule.mainClock.advanceTimeBy(2_500)
        // Would still be disabled if the countdown had restarted from 10 s.
        rule.onNodeWithTag("friction_confirm").assertIsEnabled()
    }
}

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class OnboardingUiTest {
    @get:Rule val rule = createComposeRule()

    @Test fun fullFlowRequiresExplicitConsentAndCompletes() {
        var settings by mutableStateOf(UserSettings())
        var step by mutableIntStateOf(0)
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                OnboardingContent(step, settings, { step = it }, { t -> settings = t(settings) }, serviceEnabledCheck = { false })
            }
        }
        rule.onNodeWithTag("onboarding_next").performClick() // welcome
        rule.onNodeWithTag("onboarding_next").performScrollTo().performClick() // how it works
        rule.onNodeWithText("What ReelGuard never reads or stores").performScrollTo().assertIsDisplayed()
        assertEquals(false, settings.disclosureAccepted)
        rule.onNodeWithTag("disclosure_accept").performScrollTo().performClick()
        assertEquals(true, settings.disclosureAccepted)
        assertEquals(3, step)
        rule.onNodeWithText("Skip for now").performScrollTo().performClick()
        rule.onNodeWithTag("mode_STRICT").performScrollTo().performClick()
        assertEquals(ProtectionMode.STRICT, settings.mode)
        rule.onNodeWithTag("onboarding_next").performScrollTo().performClick() // mode
        rule.onNodeWithTag("onboarding_next").performScrollTo().performClick() // notifications
        rule.onNodeWithTag("onboarding_finish").performScrollTo().performClick()
        assertTrue(settings.onboardingComplete)
    }

    @Test fun decliningDisclosureSkipsPermissionStep() {
        var settings by mutableStateOf(UserSettings())
        var step by mutableIntStateOf(2)
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                OnboardingContent(step, settings, { step = it }, { t -> settings = t(settings) }, serviceEnabledCheck = { false })
            }
        }
        rule.onNodeWithTag("disclosure_decline").performScrollTo().performClick()
        assertEquals(false, settings.disclosureAccepted)
        assertEquals(4, step)
    }
}

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class SettingsUiTest {
    @get:Rule val rule = createComposeRule()

    @Test fun changingModeAndTimeLimitUpdatesSettings() {
        var settings by mutableStateOf(UserSettings())
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                SettingsEditor(settings, { t -> settings = t(settings) }, onNavigate = {}, vm = null)
            }
        }
        rule.onNodeWithTag("mode_TIME_LIMIT").performClick()
        assertEquals(ProtectionMode.TIME_LIMIT, settings.mode)
        rule.onNodeWithText("20 min").performScrollTo().performClick()
        assertEquals(20, settings.timeLimitMinutes)
    }

    @Test fun customModeShowsAllKnobs() {
        var settings by mutableStateOf(UserSettings(mode = ProtectionMode.CUSTOM))
        rule.setContent {
            ReelGuardTheme(dynamicColor = false) {
                SettingsEditor(settings, { t -> settings = t(settings) }, onNavigate = {}, vm = null)
            }
        }
        rule.onNodeWithText("Block Explore").performScrollTo().performClick()
        assertTrue(settings.custom.blockExplore)
        rule.onNodeWithText("Allow Reels opened from outside Instagram").performScrollTo().performClick()
        assertEquals(false, settings.custom.allowExternalReels)
        rule.onNodeWithText("Add allowed time").performScrollTo().assertIsDisplayed()
    }
}
