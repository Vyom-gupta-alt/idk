package com.reelguard.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelguard.app.diagnostics.DiagnosticsBus
import com.reelguard.app.domain.BlockDecisionEngine
import com.reelguard.app.domain.Policy
import com.reelguard.app.domain.PolicyResolver
import com.reelguard.app.domain.ProtectionMode
import com.reelguard.app.domain.UsageLogic
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.permissions.AccessibilityPermission
import com.reelguard.app.ui.MainViewModel
import com.reelguard.app.ui.Route
import com.reelguard.app.ui.components.SectionCard
import com.reelguard.app.ui.components.UsageRing
import com.reelguard.app.ui.components.WeekBars
import com.reelguard.app.ui.components.formatCountdown
import com.reelguard.app.ui.components.formatMinutes
import com.reelguard.app.ui.components.rememberTicker
import com.reelguard.app.ui.theme.LocalStatusColors
import java.time.LocalDate

fun ProtectionMode.title(): String = when (this) {
    ProtectionMode.STRICT -> "Strict"
    ProtectionMode.FRIEND -> "Friend"
    ProtectionMode.TIME_LIMIT -> "Time limit"
    ProtectionMode.COOLDOWN -> "Cooldown"
    ProtectionMode.CUSTOM -> "Custom"
}

fun ProtectionMode.describe(s: UserSettings): String = when (this) {
    ProtectionMode.STRICT -> "Reels feed and Explore are blocked. Only the exact Reel you open from a message or link plays."
    ProtectionMode.FRIEND -> "Reels feed is blocked. Reels from messages play, plus one more. Single Reels elsewhere play, " +
        "but swiping on is blocked."
    ProtectionMode.TIME_LIMIT -> "Like Friend, plus ${s.timeLimitMinutes} min of Reels browsing per day."
    ProtectionMode.COOLDOWN -> "Browse Reels, but after ${s.cooldownModeContinuousMinutes} min in a row, take a " +
        "${s.cooldownModeCooldownMinutes} min break."
    ProtectionMode.CUSTOM -> "Your own combination of limits."
}

@Composable
fun HomeScreen(vm: MainViewModel, settings: UserSettings, onNavigate: (Route) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val usageRaw by vm.usage.collectAsStateWithLifecycle()
    val connected by DiagnosticsBus.serviceConnected.collectAsStateWithLifecycle()
    val now by rememberTicker(vm.clock)
    var serviceEnabled by remember { mutableStateOf(AccessibilityPermission.isEnabled(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { serviceEnabled = AccessibilityPermission.isEnabled(context) }

    val usage = UsageLogic.rollover(usageRaw, now, vm.clock.zone())
    val policy = PolicyResolver.resolve(settings)
    val status = LocalStatusColors.current
    val overrideRemaining = usage.overrideUntil?.remainingMs(now) ?: 0
    val cooldownRemaining = usage.cooldownUntil?.remainingMs(now) ?: 0

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // --- Protection status -------------------------------------------------------
        val (icon, color, headline, detail) = when {
            !serviceEnabled -> StatusLine(Icons.Outlined.ErrorOutline, status.bad, "Protection: OFF",
                "The accessibility service is turned off in Android Settings.")
            !connected -> StatusLine(Icons.Outlined.ErrorOutline, status.warn, "Protection: starting…",
                "Enabled, but Android hasn't started the service yet. If this persists, see Troubleshooting.")
            !settings.protectionEnabled -> StatusLine(Icons.Outlined.ErrorOutline, status.bad, "Protection: OFF",
                "Turned off in ReelGuard. Usage is still counted.")
            overrideRemaining > 0 -> StatusLine(Icons.Outlined.PauseCircle, status.warn, "Paused",
                "Limits resume in ${formatCountdown(overrideRemaining)}.")
            else -> StatusLine(Icons.Outlined.CheckCircle, status.good, "Protection: ON", "Watching Instagram only.")
        }
        SectionCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(32.dp))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(headline, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.testTag("home_status"))
                    Text(detail, style = MaterialTheme.typography.bodyMedium)
                }
            }
            when {
                !serviceEnabled -> Button(
                    onClick = { context.startActivity(AccessibilityPermission.settingsIntent()) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Open Accessibility settings") }
                !settings.protectionEnabled -> Button(
                    onClick = { vm.setProtectionEnabled(true) },
                    modifier = Modifier.fillMaxWidth().testTag("home_turn_on"),
                ) { Text("Turn protection on") }
                overrideRemaining > 0 -> OutlinedButton(onClick = vm::endOverride, modifier = Modifier.fillMaxWidth()) {
                    Text("Resume protection now")
                }
                else -> OutlinedButton(
                    onClick = { onNavigate(Route.PAUSE) },
                    modifier = Modifier.fillMaxWidth().testTag("home_pause"),
                ) { Text("Pause temporarily…") }
            }
        }

        // --- Today's usage -----------------------------------------------------------
        SectionCard(title = "Instagram Reels today") {
            UsageSummary(policy, usage.browsingMs, usage.intentionalMs, status.good, status.bad)
            if (cooldownRemaining > 0) {
                Text("Break in progress: ${formatCountdown(cooldownRemaining)} left", color = status.warn,
                    fontWeight = FontWeight.SemiBold)
            }
            Text("Shared Reels watched: ${formatMinutes(usage.intentionalMs)}", style = MaterialTheme.typography.bodyMedium)
            Text("Times ReelGuard stepped in: ${usage.blocks}", style = MaterialTheme.typography.bodyMedium)
        }

        // --- Mode ------------------------------------------------------------------------
        SectionCard(title = "Mode: ${settings.mode.title()}") {
            Text(settings.mode.describe(settings), style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = { onNavigate(Route.SETTINGS) }, modifier = Modifier.testTag("home_settings")) {
                Icon(Icons.Outlined.Settings, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Settings")
            }
        }

        // --- Week --------------------------------------------------------------------
        SectionCard(title = "Reels browsing, last 7 days") {
            val days = UsageLogic.lastSevenDays(usage).map { d ->
                val label = runCatching { LocalDate.parse(d.day).dayOfWeek.name.take(1) }.getOrDefault("?")
                label to d.browsingMs
            }
            WeekBars(days, MaterialTheme.colorScheme.primary)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { onNavigate(Route.DIAGNOSTICS) }, modifier = Modifier.weight(1f)) {
                Icon(Icons.Outlined.BugReport, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Diagnostics")
            }
            OutlinedButton(onClick = { onNavigate(Route.PRIVACY) }, modifier = Modifier.weight(1f)) {
                Icon(Icons.Outlined.PrivacyTip, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Privacy")
            }
        }
    }
}

private data class StatusLine(val icon: ImageVector, val color: androidx.compose.ui.graphics.Color, val headline: String, val detail: String)

@Composable
private fun UsageSummary(
    policy: Policy,
    browsingMs: Long,
    intentionalMs: Long,
    good: androidx.compose.ui.graphics.Color,
    bad: androidx.compose.ui.graphics.Color,
) {
    val usedForLimit = browsingMs + if (policy.countIntentionalTowardLimit) intentionalMs else 0
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        when {
            !policy.browsingEverAllowed -> UsageRing(
                progress = 0f,
                centerTop = formatMinutes(browsingMs),
                centerBottom = "feed browsing\nFeed blocked in this mode",
                ringColor = good,
            )
            policy.hasFiniteDailyLimit -> {
                val remaining = BlockDecisionEngine.remainingBrowsingMs(policy, com.reelguard.app.domain.UsageState(
                    browsingMs = browsingMs, intentionalMs = intentionalMs)) ?: 0
                UsageRing(
                    progress = usedForLimit.toFloat() / policy.dailyBrowsingLimitMs,
                    centerTop = formatMinutes(usedForLimit),
                    centerBottom = "of ${formatMinutes(policy.dailyBrowsingLimitMs)}\n${formatMinutes(remaining)} remaining",
                    ringColor = if (remaining == 0L) bad else good,
                )
            }
            else -> UsageRing(
                progress = 0f,
                centerTop = formatMinutes(browsingMs),
                centerBottom = "browsing today\nNo daily limit",
                ringColor = good,
            )
        }
    }
}
