package com.reelguard.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.reelguard.app.ui.components.SectionCard

@Composable
fun PrivacyScreen(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("ReelGuard has no internet permission. Nothing it sees or stores can leave your phone.",
            style = MaterialTheme.typography.titleMedium)

        SectionCard(title = "Permissions") {
            Permission("Accessibility service (you turn it on)",
                "Recognises which Instagram screen is open and presses Back when the Reels feed opens. " +
                    "Limited by Android to Instagram, Instagram Lite and apps you add under Settings.")
            Permission("Notifications (optional, Android 13+)",
                "Only to tell you if the protection service stops.")
            Permission("Package visibility for Instagram and Instagram Lite",
                "Checks whether they are installed, and their version, for Diagnostics. No other apps are listed.")
        }

        SectionCard(title = "What is processed, in memory") {
            Text("• Instagram's internal element names (view ids), for example \"clips_tab\"\n" +
                "• Whether a tab is selected and whether an element is visible\n" +
                "• Scroll positions in the Reels player (a number, e.g. item 3 of the list)\n" +
                "• While a Reels session is timed, and at most every 5 seconds: the package name of the app in front")
        }

        SectionCard(title = "What is stored, on this phone only") {
            Text("• Your settings\n" +
                "• Per-day totals: minutes browsing Reels, minutes on shared Reels, number of blocks (14 days kept)\n" +
                "• Active break or override end times\n" +
                "• Mistake reports you create (reason, screen type, rules version; up to 20)\n" +
                "Delete all of it in Settings → Your data, or with Android's \"Clear storage\".")
        }

        SectionCard(title = "Never collected") {
            Text("Messages, captions, comments, usernames, profile pictures, screenshots, passwords, anything you " +
                "type, what other apps show, your location, contacts, advertising ID. No analytics, ads or crash " +
                "reporting SDKs are included. Cloud backup is disabled for this app.")
        }

        SectionCard(title = "Honest caveat") {
            Text("Android delivers accessibility events and screen elements as objects that can contain text. " +
                "ReelGuard's code never reads those text fields; its detection works through a narrow interface " +
                "that has no text accessor. The source code is available for you to verify this.",
                style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun Permission(title: String, why: String) {
    Text(title, style = MaterialTheme.typography.bodyLarge)
    Text(why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
