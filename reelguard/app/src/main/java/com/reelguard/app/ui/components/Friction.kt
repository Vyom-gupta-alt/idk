package com.reelguard.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.reelguard.app.domain.OverrideAvailability
import com.reelguard.app.domain.OverrideManager
import com.reelguard.app.domain.OverrideSettings
import kotlinx.coroutines.delay

/**
 * Deliberate, honest friction: a visible countdown and (optionally) a typed reason before
 * a protective setting can be relaxed. "Never mind" is always available and equally visible.
 * No guilt copy, no hidden buttons, no fake urgency.
 */
@Composable
fun FrictionGate(
    title: String,
    explanation: String,
    delaySeconds: Int,
    requireReason: Boolean,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    extraContent: @Composable () -> Unit = {},
) {
    var remaining by rememberSaveable { mutableIntStateOf(delaySeconds.coerceAtLeast(0)) }
    var reason by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        while (remaining > 0) {
            delay(1_000)
            remaining--
        }
    }

    val reasonOk = !requireReason || reason.trim().length >= OverrideManager.MIN_REASON_LENGTH
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text(explanation, style = MaterialTheme.typography.bodyMedium)
        extraContent()
        if (requireReason) {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(200) },
                modifier = Modifier.fillMaxWidth().testTag("friction_reason"),
                label = { Text("Why do you need this? (not saved)") },
                supportingText = {
                    Text("At least ${OverrideManager.MIN_REASON_LENGTH} characters. Kept only on this screen.")
                },
            )
        }
        if (remaining > 0) {
            Text(
                "You can continue in $remaining s",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("friction_countdown"),
            )
            LinearProgressIndicator(
                progress = { 1f - remaining / delaySeconds.coerceAtLeast(1).toFloat() },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).testTag("friction_cancel")) {
                Text("Never mind")
            }
            Button(
                onClick = onConfirm,
                enabled = remaining == 0 && reasonOk,
                modifier = Modifier.weight(1f).testTag("friction_confirm"),
            ) { Text(confirmLabel) }
        }
    }
}

/** The temporary-override flow, shared by the home screen and the block screen. */
@Composable
fun OverrideFlow(
    availability: OverrideAvailability,
    settings: OverrideSettings,
    onGrant: (minutes: Int) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (availability) {
        is OverrideAvailability.Available -> {
            val choices = OverrideManager.durationChoices(settings)
            var minutes by rememberSaveable { mutableIntStateOf(choices.first()) }
            FrictionGate(
                title = "Temporary override",
                explanation = "Reels limits will be paused for the time you choose, then turn back on " +
                    "automatically. After it ends, the next override is available in ${settings.cooldownMinutes} min." +
                    if (settings.maxPerDay > 0) " You can use ${settings.maxPerDay} per day." else "",
                delaySeconds = settings.delaySeconds,
                requireReason = settings.requireReason,
                confirmLabel = "Pause for $minutes min",
                onConfirm = { onGrant(minutes) },
                onCancel = onCancel,
                modifier = modifier,
            ) {
                ChoiceChips("Duration", choices, minutes, { "$it min" }) { minutes = it }
            }
        }
        else -> {
            val message = when (availability) {
                OverrideAvailability.Disabled -> "Overrides are turned off in settings."
                is OverrideAvailability.AlreadyActive ->
                    "An override is already active for ${formatCountdown(availability.remainingMs)}."
                is OverrideAvailability.CoolingDown ->
                    "The next override is available in ${formatCountdown(availability.remainingMs)}."
                is OverrideAvailability.DailyCapReached ->
                    "You've used all ${availability.cap} overrides for today. They reset at midnight."
                is OverrideAvailability.Available -> ""
            }
            Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Temporary override", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text(message, modifier = Modifier.testTag("override_unavailable"))
                Text(
                    "You are always in control of your phone: ReelGuard can be turned off in Android " +
                        "Settings → Accessibility, or uninstalled, at any time.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text("Close") }
            }
        }
    }
}
