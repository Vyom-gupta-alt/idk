package com.reelguard.app.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelguard.app.diagnostics.DiagnosticsBus
import com.reelguard.app.domain.ProtectionMode
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.permissions.AccessibilityPermission
import com.reelguard.app.ui.MainViewModel
import com.reelguard.app.ui.components.ChoiceChips
import com.reelguard.app.ui.components.SectionCard

private const val STEPS = 7

/**
 * Onboarding. The permission step is a Play-policy "prominent disclosure": it explains
 * exactly what the accessibility permission is used for and requires an explicit "I agree"
 * before we open Android Settings. Declining is always possible.
 */
@Composable
fun OnboardingScreen(vm: MainViewModel, settings: UserSettings) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    BackHandler(enabled = step > 0) { step-- }

    OnboardingContent(
        step = step,
        settings = settings,
        onStep = { step = it },
        update = vm::updateSettings,
        serviceEnabledCheck = { AccessibilityPermission.isEnabled(it) },
    )
}

@Composable
fun OnboardingContent(
    step: Int,
    settings: UserSettings,
    onStep: (Int) -> Unit,
    update: ((UserSettings) -> UserSettings) -> Unit,
    serviceEnabledCheck: (android.content.Context) -> Boolean,
) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            LinearProgressIndicator(progress = { (step + 1) / STEPS.toFloat() }, modifier = Modifier.fillMaxWidth())
            when (step) {
                0 -> Welcome(next = { onStep(1) })
                1 -> HowItWorks(next = { onStep(2) }, back = { onStep(0) })
                2 -> Disclosure(
                    accept = { update { it.copy(disclosureAccepted = true) }; onStep(3) },
                    decline = { update { it.copy(disclosureAccepted = false) }; onStep(4) },
                )
                3 -> EnableService(settings, serviceEnabledCheck, next = { onStep(4) }, back = { onStep(2) })
                4 -> ChooseMode(settings, update, next = { onStep(5) }, back = { onStep(3) })
                5 -> Notifications(next = { onStep(6) }, back = { onStep(4) })
                else -> TestIt(finish = { update { it.copy(onboardingComplete = true) } }, back = { onStep(5) })
            }
        }
    }
}

@Composable
private fun Title(text: String) {
    Text(text, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.semantics { heading() })
}

@Composable
private fun NavRow(back: (() -> Unit)?, nextLabel: String, next: () -> Unit, nextEnabled: Boolean = true, nextTag: String = "onboarding_next") {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (back != null) OutlinedButton(onClick = back, modifier = Modifier.weight(1f)) { Text("Back") }
        Button(onClick = next, enabled = nextEnabled, modifier = Modifier.weight(1f).testTag(nextTag)) { Text(nextLabel) }
    }
}

@Composable
private fun Welcome(next: () -> Unit) {
    Title("Instagram, without the endless Reels")
    Text("ReelGuard lets you keep using Instagram to talk to friends, and to watch Reels they send you, while " +
        "keeping the Reels feed from swallowing your time.")
    Text("• The Reels feed is blocked or time-limited, your choice.\n" +
        "• Reels opened from your messages still play.\n" +
        "• Everything happens on this phone. ReelGuard has no internet access.")
    Spacer(Modifier.height(8.dp))
    NavRow(null, "Get started", next)
}

@Composable
private fun HowItWorks(next: () -> Unit, back: () -> Unit) {
    Title("How it works, honestly")
    Text("Instagram has no official way for other apps to control Reels. ReelGuard works by recognising Instagram's " +
        "screens (the Reels tab, the full-screen Reels player, your messages) using Android's accessibility feature.")
    SectionCard(title = "What ReelGuard does") {
        Text("1. If you open the Reels tab, it steps in.\n" +
            "2. If you open a Reel from a message, it plays.\n" +
            "3. If you keep swiping past it into more Reels, ReelGuard treats that as browsing the feed.")
    }
    SectionCard(title = "Limits you should know") {
        Text("• ReelGuard can't know which Reel a friend sent you, only where you opened it from.\n" +
            "• Instagram changes its app often. An update can confuse ReelGuard until its rules are updated " +
            "(Diagnostics helps with that).\n" +
            "• instagram.com in a web browser is not covered. ReelGuard doesn't watch your browser.")
    }
    NavRow(back, "Continue", next)
}

@Composable
private fun Disclosure(accept: () -> Unit, decline: () -> Unit) {
    Title("Accessibility permission")
    Text("ReelGuard uses Android's AccessibilityService API to see which Instagram screen is open, so it can block " +
        "the Reels feed. Before you turn it on, here is exactly what that means:")
    SectionCard(title = "What the permission allows") {
        Text("Android lets an accessibility service observe and interact with the screen of apps it's allowed to " +
            "see. ReelGuard limits this to Instagram (and Instagram Lite, or apps you add yourself). Android does not " +
            "send it anything from other apps.")
    }
    SectionCard(title = "What ReelGuard reads") {
        Text("• Instagram's internal screen-element names (e.g. \"reels tab\", \"message composer\")\n" +
            "• Whether a tab is selected\n" +
            "• Scroll events inside the Reels player\n" +
            "• While timing Reels: which app is in front, and nothing else about it")
    }
    SectionCard(title = "What ReelGuard never reads or stores") {
        Text("Your messages, captions, usernames, comments, passwords, screenshots, or anything you type. " +
            "Its code never asks Android for on-screen text.")
    }
    SectionCard(title = "What it does with it") {
        Text("It decides locally whether to show the ReelGuard block screen and press Back. It stores only daily " +
            "totals (minutes, number of blocks) on your phone. ReelGuard has no internet permission, so nothing can " +
            "be uploaded. There are no ads or analytics.")
    }
    Text("You can turn this off at any time in Android Settings → Accessibility, or uninstall ReelGuard.",
        style = MaterialTheme.typography.bodySmall)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = decline, modifier = Modifier.weight(1f).testTag("disclosure_decline")) { Text("Not now") }
        Button(onClick = accept, modifier = Modifier.weight(1f).testTag("disclosure_accept")) { Text("I agree") }
    }
}

@Composable
private fun EnableService(
    settings: UserSettings,
    enabledCheck: (android.content.Context) -> Boolean,
    next: () -> Unit,
    back: () -> Unit,
) {
    val context = LocalContext.current
    var enabled by remember { mutableStateOf(enabledCheck(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { enabled = enabledCheck(context) }
    val restricted = remember { AccessibilityPermission.mayNeedRestrictedSettings(context) }

    Title("Turn on ReelGuard")
    if (enabled) {
        Text("✓ ReelGuard's accessibility service is on.", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
    } else {
        Text("In the next screen, tap ReelGuard (under Downloaded apps / Installed services), then turn it on.")
        if (restricted) {
            SectionCard(title = "If the switch is greyed out") {
                Text("Android 13 and later protect accessibility settings for apps installed outside an app store. " +
                    "To allow it: open App info → ⋮ menu (top right) → \"Allow restricted settings\", confirm, then " +
                    "come back and try again. On some phones you first need to try once so the menu item appears.")
                OutlinedButton(onClick = { context.startActivity(AccessibilityPermission.appDetailsIntent(context)) }) {
                    Text("Open App info")
                }
            }
        }
        Button(
            onClick = { context.startActivity(AccessibilityPermission.settingsIntent()) },
            enabled = settings.disclosureAccepted,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Open Accessibility settings") }
    }
    TextButton(onClick = next) { Text(if (enabled) "Continue" else "Skip for now") }
    OutlinedButton(onClick = back) { Text("Back") }
}

@Composable
private fun ChooseMode(
    settings: UserSettings,
    update: ((UserSettings) -> UserSettings) -> Unit,
    next: () -> Unit,
    back: () -> Unit,
) {
    Title("Choose how strict")
    Text("You can change this later in Settings.")
    ModePicker(settings.mode, settings) { m -> update { it.copy(mode = m) } }
    if (settings.mode == ProtectionMode.TIME_LIMIT) {
        ChoiceChips("Reels browsing per day", listOf(5, 10, 15, 20), settings.timeLimitMinutes, { "$it min" }) { v ->
            update { it.copy(timeLimitMinutes = v) }
        }
    }
    if (settings.mode == ProtectionMode.COOLDOWN) {
        ChoiceChips("Break after", listOf(5, 10, 15, 20), settings.cooldownModeContinuousMinutes, { "$it min" }) { v ->
            update { it.copy(cooldownModeContinuousMinutes = v) }
        }
    }
    NavRow(back, "Continue", next)
}

@Composable
private fun Notifications(next: () -> Unit, back: () -> Unit) {
    Title("One optional notification")
    Text("ReelGuard can let you know if Android stops its service (for example after it's turned off, or killed by " +
        "battery saving). That's the only notification it ever sends.")
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { next() }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Button(onClick = { launcher.launch(Manifest.permission.POST_NOTIFICATIONS) }, modifier = Modifier.fillMaxWidth()) {
            Text("Allow notification")
        }
    }
    NavRow(back, if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "No thanks" else "Continue", next)
}

@Composable
private fun TestIt(finish: () -> Unit, back: () -> Unit) {
    val live by DiagnosticsBus.live.collectAsStateWithLifecycle()
    val connected by DiagnosticsBus.serviceConnected.collectAsStateWithLifecycle()
    Title("Test it")
    Text("1. Open Instagram and tap the Reels tab. ReelGuard should step in.\n" +
        "2. Open a chat where someone sent you a Reel and tap it. It should play.\n" +
        "3. Swipe up from that Reel. After the allowance, ReelGuard should step in.\n" +
        "4. If something looks wrong, open Diagnostics from the home screen.")
    SectionCard(title = "What ReelGuard sees right now") {
        Text(
            when {
                !connected -> "Service not running yet."
                live == null -> "Waiting for Instagram…"
                else -> "Instagram screen: ${live?.interpreted?.name?.lowercase()?.replace('_', ' ')}"
            },
            modifier = Modifier.testTag("onboarding_live"),
        )
    }
    NavRow(back, "Finish", finish, nextTag = "onboarding_finish")
}
