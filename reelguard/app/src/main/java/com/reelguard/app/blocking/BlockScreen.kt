package com.reelguard.app.blocking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SelfImprovement
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Stateless block screen. Clearly branded as ReelGuard; it never imitates Instagram or
 * Android system dialogs.
 */
@Composable
fun BlockScreen(
    copy: BlockCopy,
    overrideOffered: Boolean,
    reportSaved: Boolean,
    onGoBack: () -> Unit,
    onCloseInstagram: () -> Unit,
    onOverride: () -> Unit,
    onReportMistake: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("ReelGuard", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(24.dp))
            Icon(
                Icons.Outlined.SelfImprovement,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(24.dp))
            Text(
                copy.title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() }.testTag("block_title"),
            )
            Spacer(Modifier.height(12.dp))
            Text(copy.body, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(
                copy.reassurance,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(32.dp))
            if (copy.canReturnToInstagram) {
                Button(onClick = onGoBack, modifier = Modifier.fillMaxWidth().testTag("block_go_back")) {
                    Text("Go back to Instagram")
                }
                Spacer(Modifier.height(8.dp))
            }
            OutlinedButton(onClick = onCloseInstagram, modifier = Modifier.fillMaxWidth().testTag("block_close")) {
                Text("Close Instagram")
            }
            if (overrideOffered) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onOverride, modifier = Modifier.fillMaxWidth().testTag("block_override")) {
                    Text("Temporary override")
                }
            }
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onReportMistake, enabled = !reportSaved, modifier = Modifier.testTag("block_report")) {
                Text(if (reportSaved) "Saved on this device. See Diagnostics." else "This was blocked by mistake")
            }
        }
    }
}
