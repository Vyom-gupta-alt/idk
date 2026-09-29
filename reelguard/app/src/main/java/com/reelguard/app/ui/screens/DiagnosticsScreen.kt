package com.reelguard.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelguard.app.BuildConfig
import com.reelguard.app.diagnostics.DiagnosticsBus
import com.reelguard.app.diagnostics.label
import com.reelguard.app.domain.InstagramPackages
import com.reelguard.app.permissions.AccessibilityPermission
import com.reelguard.app.permissions.InstalledApps
import com.reelguard.app.ui.MainViewModel
import com.reelguard.app.ui.components.SectionCard
import com.reelguard.app.ui.components.SwitchRow
import com.reelguard.app.ui.theme.LocalStatusColors
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.launch

/**
 * What the service believes is happening, shown as classifications and rule ids only.
 * No screen text is ever displayed here, because the service never reads any.
 */
@Composable
fun DiagnosticsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val connected by DiagnosticsBus.serviceConnected.collectAsStateWithLifecycle()
    val live by DiagnosticsBus.live.collectAsStateWithLifecycle()
    val recent by DiagnosticsBus.recent.collectAsStateWithLifecycle()
    val streak by DiagnosticsBus.unknownStreak.collectAsStateWithLifecycle()
    val inspector by DiagnosticsBus.inspectorEnabled.collectAsStateWithLifecycle()
    val inspectorIds by DiagnosticsBus.inspectorIds.collectAsStateWithLifecycle()
    val usage by vm.usage.collectAsStateWithLifecycle()
    val rules by vm.rules.collectAsStateWithLifecycle()
    val custom by vm.rulesAreCustom.collectAsStateWithLifecycle()
    val status = LocalStatusColors.current
    val igVersion = remember { InstalledApps.versionOf(context, InstagramPackages.INSTAGRAM) }
    val liteVersion = remember { InstalledApps.versionOf(context, InstagramPackages.INSTAGRAM_LITE) }
    val time = remember { DateFormat.getTimeInstance(DateFormat.MEDIUM) }

    // The inspector is a developer tool; never leave it running in the background.
    DisposableEffect(Unit) { onDispose { DiagnosticsBus.setInspectorEnabled(false) } }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionCard(title = "Service") {
            Text("Enabled in Android Settings: ${yesNo(AccessibilityPermission.isEnabled(context))}")
            Text("Running now: ${yesNo(connected)}")
            Text("ReelGuard ${BuildConfig.VERSION_NAME}")
            Text("Instagram: ${igVersion ?: "not installed"}")
            Text("Instagram Lite: ${liteVersion ?: "not installed"}")
        }

        SectionCard(title = "Detection rules") {
            Text("Rules version ${rules.version}${if (custom) " (custom)" else " (built-in)"}")
            Text(
                "Tested Instagram versions: " +
                    rules.testedInstagramVersions.ifEmpty { listOf("none recorded; verify on your device") }.joinToString(),
            )
            if (streak >= DiagnosticsBus.UNKNOWN_STREAK_WARNING) {
                Text(
                    "Warning: the last $streak Instagram screens matched no known screen. Instagram may have " +
                        "changed; use the inspector below to find the new ids.",
                    color = status.warn,
                )
            }
        }

        SectionCard(title = "Live") {
            val l = live
            if (l == null) {
                Text("Open Instagram to see what ReelGuard detects.")
            } else {
                Text("Screen: ${l.detection?.state ?: "-"} (${l.detection?.confidence ?: "-"})")
                Text("Rule: ${l.detection?.reason ?: l.appKind.name.lowercase()}")
                Text("Interpreted as: ${l.interpreted}")
                Text("Reel session: ${l.session?.let { "from ${it.origin}, ${it.reelsSeen} Reel(s) seen" } ?: "none"}")
                Text("Decision: ${l.decision.label()} · counting as ${l.viewingKind}")
            }
        }

        SectionCard(title = "Recent detections (memory only)") {
            if (recent.isEmpty()) Text("Nothing yet.")
            recent.take(20).forEach { e ->
                Text(
                    "${time.format(Date(e.wallMs))}  ${e.state} · ${e.reason} → ${e.decision}",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                )
            }
            if (recent.isNotEmpty()) TextButton(onClick = DiagnosticsBus::clearRecent) { Text("Clear") }
        }

        SectionCard(title = "\"Blocked by mistake\" reports") {
            if (usage.reports.isEmpty()) Text("No reports. Use \"This was blocked by mistake\" on the block screen.")
            usage.reports.forEach { r ->
                Text(
                    "${DateFormat.getDateTimeInstance().format(Date(r.wallMs))}: ${r.reason} on ${r.screen}" +
                        (r.origin?.let { ", from $it" } ?: "") + ", ${r.reelsSeen} Reel(s), rules v${r.rulesVersion}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (usage.reports.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        val text = buildReport(igVersion, rules.version, usage.reports.map { r ->
                            "${r.wallMs} ${r.reason} screen=${r.screen} origin=${r.origin} reels=${r.reelsSeen} rules=v${r.rulesVersion}"
                        })
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
                        context.startActivity(Intent.createChooser(send, "Share report"))
                    }) { Text("Share…") }
                    OutlinedButton(onClick = vm::clearReports) { Text("Delete reports") }
                }
                Text("Sharing is manual: you choose the app and can read the text first. It contains no screen content.",
                    style = MaterialTheme.typography.bodySmall)
            }
        }

        SectionCard(title = "Developer: view-id inspector") {
            SwitchRow(
                "Show Instagram's view ids",
                inspector,
                { DiagnosticsBus.setInspectorEnabled(it) },
                subtitle = "Lists internal element names (never text) of the current Instagram screen. Kept in memory " +
                    "only and switched off when you leave this page. Use split screen to see it next to Instagram.",
            )
            if (inspector) {
                if (inspectorIds.isEmpty()) Text("Switch to Instagram, then come back.")
                SelectionContainer {
                    Text(
                        inspectorIds.joinToString("\n"),
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
        }

        RulesEditor(vm, rules.toJson())
    }
}

@Composable
private fun RulesEditor(vm: MainViewModel, currentJson: String) {
    var open by rememberSaveable { mutableStateOf(false) }
    var text by rememberSaveable(currentJson) { mutableStateOf(currentJson) }
    var message by rememberSaveable { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    SectionCard(title = "Advanced: detection rules (JSON)") {
        Text("Replace the view ids ReelGuard looks for without an app update. Invalid rules are rejected.",
            style = MaterialTheme.typography.bodySmall)
        if (!open) {
            OutlinedButton(onClick = { open = true }) { Text("Edit rules") }
        } else {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth().heightIn(min = 200.dp),
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            )
            message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    scope.launch {
                        message = vm.saveRules(text).fold({ "Saved rules v${it.version}." }, { "Not saved: ${it.message}" })
                    }
                }) { Text("Save") }
                OutlinedButton(onClick = { vm.resetRules(); message = "Reset to built-in rules." }) { Text("Reset") }
                TextButton(onClick = { open = false }) { Text("Close") }
            }
        }
    }
}

private fun yesNo(b: Boolean) = if (b) "yes" else "no"

internal fun buildReport(instagramVersion: String?, rulesVersion: Int, lines: List<String>): String = buildString {
    appendLine("ReelGuard mistake report")
    appendLine("App ${BuildConfig.VERSION_NAME}, Instagram ${instagramVersion ?: "?"}, rules v$rulesVersion, Android ${android.os.Build.VERSION.SDK_INT}")
    lines.forEach { appendLine(it) }
}
