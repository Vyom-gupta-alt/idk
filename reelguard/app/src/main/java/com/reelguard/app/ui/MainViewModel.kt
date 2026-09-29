package com.reelguard.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.reelguard.app.container
import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.domain.OverrideAvailability
import com.reelguard.app.domain.OverrideManager
import com.reelguard.app.domain.UsageLogic
import com.reelguard.app.domain.UsageState
import com.reelguard.app.domain.UserSettings
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val c = app.container
    val clock = c.clock

    /** Null until the first read from disk, so the UI can avoid flashing onboarding. */
    val settings: StateFlow<UserSettings?> = c.settings.settings.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val usage: StateFlow<UsageState> = c.usage.usage.stateIn(viewModelScope, SharingStarted.Eagerly, UsageState())
    val rules: StateFlow<DetectionRules> = c.rules.rules.stateIn(viewModelScope, SharingStarted.Eagerly, DetectionRules.DEFAULT)
    val rulesAreCustom: StateFlow<Boolean> = c.rules.isCustom.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    fun updateSettings(transform: (UserSettings) -> UserSettings) {
        c.appScope.launch { c.settings.update(transform) }
    }

    fun overrideAvailability(): OverrideAvailability {
        val s = settings.value ?: UserSettings()
        return OverrideManager.availability(s.overrides, usage.value, clock.now(), clock.zone())
    }

    fun grantOverride(minutes: Int) {
        val s = settings.value ?: return
        c.appScope.launch {
            c.usage.update { OverrideManager.grant(s.overrides, it, clock.now(), clock.zone(), minutes) ?: it }
        }
    }

    fun endOverride() {
        c.appScope.launch { c.usage.update { OverrideManager.endEarly(it) } }
    }

    fun setProtectionEnabled(enabled: Boolean) = updateSettings { it.copy(protectionEnabled = enabled) }

    fun clearReports() {
        c.appScope.launch { c.usage.update { it.copy(reports = emptyList()) } }
    }

    /** Deletes usage history but keeps active cooldowns/overrides so this isn't a bypass. */
    fun clearUsageHistory() {
        c.appScope.launch {
            c.usage.update { u ->
                val today = UsageLogic.rollover(u, clock.now(), clock.zone())
                UsageState(
                    day = today.day,
                    browsingMs = today.browsingMs,
                    intentionalMs = today.intentionalMs,
                    anchor = today.anchor,
                    cooldownUntil = today.cooldownUntil,
                    overrideUntil = today.overrideUntil,
                    nextOverrideAllowedAt = today.nextOverrideAllowedAt,
                    overridesToday = today.overridesToday,
                )
            }
        }
    }

    /** Removes every piece of data the app has stored. Equivalent to "Clear storage". */
    fun deleteAllData() {
        c.appScope.launch {
            c.usage.clear()
            c.rules.reset()
            c.settings.reset()
        }
    }

    suspend fun saveRules(json: String): Result<DetectionRules> = c.rules.setOverride(json)

    fun resetRules() {
        c.appScope.launch { c.rules.reset() }
    }
}
