package com.reelguard.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.reelguard.app.domain.CooldownScope
import com.reelguard.app.domain.CustomSettings
import com.reelguard.app.domain.InstagramPackages
import com.reelguard.app.domain.OverrideSettings
import com.reelguard.app.domain.ProtectionMode
import com.reelguard.app.domain.TimeWindow
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.ui.MainViewModel
import com.reelguard.app.ui.Route
import com.reelguard.app.ui.components.ChoiceChips
import com.reelguard.app.ui.components.FrictionGate
import com.reelguard.app.ui.components.SectionCard
import com.reelguard.app.ui.components.SwitchRow

@Composable
fun SettingsScreen(vm: MainViewModel, settings: UserSettings, onNavigate: (Route) -> Unit, modifier: Modifier = Modifier) {
    // The lock is per visit: leaving the screen locks it again.
    var unlocked by rememberSaveable { mutableStateOf(!settings.settingsLock) }
    if (!unlocked) {
        Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
            FrictionGate(
                title = "Settings are locked",
                explanation = "Settings lock is on, so there's a short pause before you can change limits. " +
                    "This helps changes be deliberate rather than impulsive.",
                delaySeconds = settings.overrides.delaySeconds,
                requireReason = false,
                confirmLabel = "Unlock",
                onConfirm = { unlocked = true },
                onCancel = { onNavigate(Route.HOME) },
            )
        }
        return
    }
    SettingsEditor(settings, vm::updateSettings, onNavigate, vm, modifier)
}

@Composable
fun SettingsEditor(
    settings: UserSettings,
    update: ((UserSettings) -> UserSettings) -> Unit,
    onNavigate: (Route) -> Unit,
    vm: MainViewModel?,
    modifier: Modifier = Modifier,
) {
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    var confirmClear by rememberSaveable { mutableStateOf(false) }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(title = "Mode") {
            ModePicker(settings.mode, settings) { m -> update { it.copy(mode = m) } }
        }

        when (settings.mode) {
            ProtectionMode.TIME_LIMIT -> SectionCard(title = "Time limit") {
                ChoiceChips("Reels browsing per day", listOf(5, 10, 15, 20, 30), settings.timeLimitMinutes, { "$it min" }) { v ->
                    update { it.copy(timeLimitMinutes = v) }
                }
            }
            ProtectionMode.COOLDOWN -> SectionCard(title = "Cooldown") {
                ChoiceChips("Break after watching continuously for", listOf(5, 10, 15, 20, 30),
                    settings.cooldownModeContinuousMinutes, { "$it min" }) { v -> update { it.copy(cooldownModeContinuousMinutes = v) } }
                ChoiceChips("Break length", listOf(10, 15, 30, 60), settings.cooldownModeCooldownMinutes, { "$it min" }) { v ->
                    update { it.copy(cooldownModeCooldownMinutes = v) }
                }
                Text("A pause of 2 minutes or more resets the continuous timer.", style = MaterialTheme.typography.bodySmall)
            }
            ProtectionMode.CUSTOM -> CustomEditor(settings.custom) { transform -> update { it.copy(custom = transform(it.custom)) } }
            else -> Unit
        }

        OverrideEditor(settings.overrides) { transform -> update { it.copy(overrides = transform(it.overrides)) } }

        SectionCard(title = "Other Instagram apps") {
            SwitchRow(
                "Block Instagram Lite entirely",
                settings.blockInstagramLite,
                { v -> update { it.copy(blockInstagramLite = v) } },
                subtitle = "Lite hides its screen structure, so ReelGuard can't tell its messages apart from Reels.",
            )
            ExtraPackagesEditor(settings.blockedExtraPackages) { list -> update { it.copy(blockedExtraPackages = list) } }
        }

        SectionCard(title = "Protection") {
            SwitchRow(
                "Settings lock",
                settings.settingsLock,
                { v -> update { it.copy(settingsLock = v) } },
                subtitle = "Require a short pause before changing settings.",
            )
            if (settings.protectionEnabled) {
                OutlinedButton(onClick = { onNavigate(Route.TURN_OFF) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Turn off protection…")
                }
            } else {
                Button(onClick = { update { it.copy(protectionEnabled = true) } }, modifier = Modifier.fillMaxWidth()) {
                    Text("Turn protection on")
                }
            }
        }

        SectionCard(title = "Your data") {
            Text(
                "Everything ReelGuard stores stays on this phone: daily totals, settings, and any mistake reports.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedButton(onClick = { confirmClear = true }, modifier = Modifier.fillMaxWidth()) { Text("Clear usage history") }
            OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth().testTag("delete_all")) {
                Text("Delete all data and reset")
            }
            TextButton(onClick = { onNavigate(Route.PRIVACY) }) { Text("Privacy & permissions") }
            TextButton(onClick = { onNavigate(Route.DIAGNOSTICS) }) { Text("Diagnostics") }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear usage history?") },
            text = { Text("Past days' totals and mistake reports are deleted. Today's totals and any active break are kept.") },
            confirmButton = { TextButton(onClick = { vm?.clearUsageHistory(); vm?.clearReports(); confirmClear = false }) { Text("Clear") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete all data?") },
            text = {
                Text("All usage, settings and reports are deleted and you'll see the setup again. " +
                    "The accessibility service stays enabled with default protection until you turn it off in Android Settings.")
            },
            confirmButton = { TextButton(onClick = { vm?.deleteAllData(); confirmDelete = false }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
fun ModePicker(selected: ProtectionMode, settings: UserSettings = UserSettings(), onSelect: (ProtectionMode) -> Unit) {
    Column(Modifier.selectableGroup()) {
        ProtectionMode.entries.forEach { m ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .selectable(selected = m == selected, role = Role.RadioButton, onClick = { onSelect(m) })
                    .padding(vertical = 6.dp)
                    .testTag("mode_${m.name}"),
                verticalAlignment = Alignment.Top,
            ) {
                RadioButton(selected = m == selected, onClick = null)
                Column(Modifier.padding(start = 12.dp)) {
                    Text(m.title(), style = MaterialTheme.typography.bodyLarge)
                    Text(m.describe(settings), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun CustomEditor(c: CustomSettings, update: ((CustomSettings) -> CustomSettings) -> Unit) {
    var addingPeriod by rememberSaveable { mutableStateOf(false) }
    SectionCard(title = "Custom limits") {
        ChoiceChips("Reels browsing per day", listOf(0, 5, 10, 15, 20, 30, 60), c.dailyLimitMinutes,
            { if (it == 0) "None" else "$it min" }) { v -> update { it.copy(dailyLimitMinutes = v) } }
        ChoiceChips("Break after continuous browsing", listOf(0, 5, 10, 15, 20, 30), c.continuousLimitMinutes,
            { if (it == 0) "Off" else "$it min" }) { v -> update { it.copy(continuousLimitMinutes = v) } }
        if (c.continuousLimitMinutes > 0) {
            ChoiceChips("Break length", listOf(10, 15, 30, 60), c.cooldownMinutes, { "$it min" }) { v ->
                update { it.copy(cooldownMinutes = v) }
            }
            SwitchRow(
                "Pause all of Instagram during breaks",
                c.cooldownScope == CooldownScope.ALL_INSTAGRAM,
                { v -> update { it.copy(cooldownScope = if (v) CooldownScope.ALL_INSTAGRAM else CooldownScope.REELS_ONLY) } },
                subtitle = "Off: only Reels are paused and messages keep working.",
            )
        }
        Text("Allowed times for browsing", style = MaterialTheme.typography.bodyMedium)
        if (c.allowedPeriods.isEmpty()) Text("Any time of day", style = MaterialTheme.typography.bodySmall)
        c.allowedPeriods.forEachIndexed { i, w ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(w.label(), modifier = Modifier.weight(1f))
                IconButton(onClick = { update { it.copy(allowedPeriods = it.allowedPeriods.filterIndexed { j, _ -> j != i }) } }) {
                    Icon(Icons.Outlined.Delete, contentDescription = "Remove ${w.label()}")
                }
            }
        }
        TextButton(onClick = { addingPeriod = true }) { Text("Add allowed time") }

        SwitchRow("Allow Reels opened from messages", c.allowDmReels, { v -> update { it.copy(allowDmReels = v) } })
        if (c.allowDmReels) {
            ChoiceChips("Extra Reels after a shared one", listOf(0, 1, 2, 3, 5), c.dmReelAllowance, { "$it" }) { v ->
                update { it.copy(dmReelAllowance = v) }
            }
        }
        SwitchRow(
            "Allow Reels opened from outside Instagram",
            c.allowExternalReels,
            { v -> update { it.copy(allowExternalReels = v) } },
            subtitle = "Notifications and links in other apps. ReelGuard can't see which one; it only knows " +
                "Instagram wasn't open just before.",
        )
        SwitchRow(
            "Allow single Reels elsewhere",
            c.allowOtherSingleReels,
            { v -> update { it.copy(allowOtherSingleReels = v) } },
            subtitle = "One Reel from a profile, the home feed or Stories. Swiping on counts as browsing.",
        )
        SwitchRow("Block Explore", c.blockExplore, { v -> update { it.copy(blockExplore = v) } })
        SwitchRow(
            "Count shared Reels toward the daily limit",
            c.countIntentionalTowardLimit,
            { v -> update { it.copy(countIntentionalTowardLimit = v) } },
        )
    }
    if (addingPeriod) {
        AddPeriodDialog(onDismiss = { addingPeriod = false }) { w ->
            update { it.copy(allowedPeriods = it.allowedPeriods + w) }
            addingPeriod = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddPeriodDialog(onDismiss: () -> Unit, onAdd: (TimeWindow) -> Unit) {
    val start = rememberTimePickerState(initialHour = 18, initialMinute = 0, is24Hour = true)
    val end = rememberTimePickerState(initialHour = 19, initialMinute = 0, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Allowed time") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("From")
                TimeInput(start)
                Text("Until")
                TimeInput(end)
            }
        },
        confirmButton = {
            TextButton(onClick = { onAdd(TimeWindow(start.hour * 60 + start.minute, end.hour * 60 + end.minute)) }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun OverrideEditor(o: OverrideSettings, update: ((OverrideSettings) -> OverrideSettings) -> Unit) {
    SectionCard(title = "Temporary overrides") {
        SwitchRow("Allow temporary overrides", o.enabled, { v -> update { it.copy(enabled = v) } })
        if (o.enabled) {
            ChoiceChips("Longest override", listOf(5, 10, 15, 30), o.maxDurationMinutes, { "$it min" }) { v ->
                update { it.copy(maxDurationMinutes = v) }
            }
            ChoiceChips("Time between overrides", listOf(15, 30, 60, 120), o.cooldownMinutes, { "$it min" }) { v ->
                update { it.copy(cooldownMinutes = v) }
            }
            ChoiceChips("Overrides per day", listOf(1, 2, 3, 5, 0), o.maxPerDay, { if (it == 0) "No cap" else "$it" }) { v ->
                update { it.copy(maxPerDay = v) }
            }
        }
        ChoiceChips("Waiting time before confirming", listOf(5, 10, 20, 30, 60), o.delaySeconds, { "$it s" }) { v ->
            update { it.copy(delaySeconds = v) }
        }
        SwitchRow("Ask me to type a reason", o.requireReason, { v -> update { it.copy(requireReason = v) } },
            subtitle = "The reason is never saved.")
    }
}

@Composable
private fun ExtraPackagesEditor(packages: List<String>, onChange: (List<String>) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val valid = InstagramPackages.isValidPackageName(text.trim()) && text.trim() !in InstagramPackages.DEFAULT
    Text("Other apps to block entirely (advanced)", style = MaterialTheme.typography.bodyMedium)
    packages.forEach { p ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(p, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            IconButton(onClick = { onChange(packages - p) }) { Icon(Icons.Outlined.Delete, contentDescription = "Remove $p") }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            label = { Text("Package name") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        TextButton(enabled = valid, onClick = { onChange((packages + text.trim()).distinct()); text = "" }) { Text("Add") }
    }
    Text(
        "ReelGuard receives events only from the apps listed here and from Instagram. Nothing else is observed.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
