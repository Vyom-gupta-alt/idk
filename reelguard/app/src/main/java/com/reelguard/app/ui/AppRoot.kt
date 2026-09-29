package com.reelguard.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelguard.app.ui.components.FrictionGate
import com.reelguard.app.ui.components.OverrideFlow
import com.reelguard.app.ui.screens.DiagnosticsScreen
import com.reelguard.app.ui.screens.HomeScreen
import com.reelguard.app.ui.screens.OnboardingScreen
import com.reelguard.app.ui.screens.PrivacyScreen
import com.reelguard.app.ui.screens.SettingsScreen

enum class Route(val title: String) {
    HOME("ReelGuard"),
    SETTINGS("Settings"),
    DIAGNOSTICS("Diagnostics"),
    PRIVACY("Privacy & permissions"),
    PAUSE("Pause protection"),
    TURN_OFF("Turn off protection"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(vm: MainViewModel) {
    val settings by vm.settings.collectAsStateWithLifecycle()
    val current = settings

    if (current == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    if (!current.onboardingComplete) {
        OnboardingScreen(vm, current)
        return
    }

    var stack by rememberSaveable { mutableStateOf(listOf(Route.HOME)) }
    val route = stack.last()
    fun push(r: Route) { stack = stack + r }
    fun pop() { if (stack.size > 1) stack = stack.dropLast(1) }
    BackHandler(enabled = stack.size > 1) { pop() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(route.title) },
                navigationIcon = {
                    if (stack.size > 1) {
                        IconButton(onClick = ::pop) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
        when (route) {
            Route.HOME -> HomeScreen(vm, current, onNavigate = ::push, modifier = modifier)
            Route.SETTINGS -> SettingsScreen(vm, current, onNavigate = ::push, modifier = modifier)
            Route.DIAGNOSTICS -> DiagnosticsScreen(vm, modifier = modifier)
            Route.PRIVACY -> PrivacyScreen(modifier = modifier)
            Route.PAUSE -> Box(modifier.verticalScroll(rememberScrollState()).padding(24.dp)) {
                OverrideFlow(
                    availability = vm.overrideAvailability(),
                    settings = current.overrides,
                    onGrant = { minutes -> vm.grantOverride(minutes); pop() },
                    onCancel = ::pop,
                )
            }
            Route.TURN_OFF -> Box(modifier.verticalScroll(rememberScrollState()).padding(24.dp)) {
                FrictionGate(
                    title = "Turn off protection?",
                    explanation = "Reels will not be limited until you turn protection back on. " +
                        "Usage will still be counted on this device. To stop ReelGuard completely, you can also " +
                        "turn it off in Android Settings → Accessibility, or uninstall it.",
                    delaySeconds = current.overrides.delaySeconds,
                    requireReason = current.overrides.requireReason,
                    confirmLabel = "Turn off",
                    onConfirm = {
                        vm.setProtectionEnabled(false)
                        stack = listOf(Route.HOME)
                    },
                    onCancel = ::pop,
                )
            }
        }
    }
}
