package com.reelguard.app.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.domain.ProtectionMode
import com.reelguard.app.domain.UsageDelta
import com.reelguard.app.domain.UsageLogic
import com.reelguard.app.domain.UsageState
import com.reelguard.app.testutil.FakeClock
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Real DataStore on a temp file; each "session" simulates a process restart. */
class PersistenceTest {
    private val dir: File = Files.createTempDirectory("reelguard").toFile()
    private val file = File(dir, "test.preferences_pb")

    private fun <T> session(block: suspend (SettingsRepository, UsageRepository, RulesRepository) -> T): T {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = scope) { file }
        return try {
            runBlocking { block(SettingsRepository(store), UsageRepository(store), RulesRepository(store)) }
        } finally {
            scope.cancel()
        }
    }

    @Test fun settingsSurviveRestart() {
        session { s, _, _ -> s.update { it.copy(mode = ProtectionMode.STRICT, timeLimitMinutes = 7, onboardingComplete = true) } }
        val loaded = session { s, _, _ -> s.get() }
        assertEquals(ProtectionMode.STRICT, loaded.mode)
        assertEquals(7, loaded.timeLimitMinutes)
        assertTrue(loaded.onboardingComplete)
    }

    @Test fun usageSurvivesRestartAndConcurrentUpdatesAreNotLost() {
        val clock = FakeClock()
        session { _, u, _ ->
            repeat(50) {
                u.update { UsageLogic.apply(it, UsageDelta(browsingMs = 1_000), clock.now(), clock.zone()) }
            }
        }
        val loaded = session { _, u, _ -> u.get() }
        assertEquals(50_000L, loaded.browsingMs)
    }

    @Test fun defaultsWhenEmptyAndClearWorks() {
        session { s, u, _ ->
            assertEquals(ProtectionMode.FRIEND, s.get().mode)
            u.update { it.copy(browsingMs = 5) }
            u.clear()
            assertEquals(UsageState(), u.get())
        }
    }

    @Test fun invalidRulesAreRejectedAndDefaultsKept() {
        session { _, _, r ->
            assertTrue(r.setOverride("{}").isFailure)
            assertEquals(DetectionRules.DEFAULT, r.rules.first())
            assertFalse(r.isCustom.first())
            val custom = DetectionRules.DEFAULT.copy(version = 9)
            assertTrue(r.setOverride(custom.toJson()).isSuccess)
        }
        session { _, _, r ->
            assertEquals(9, r.rules.first().version)
            r.reset()
            assertEquals(DetectionRules.DEFAULT, r.rules.first())
        }
    }

    @Test fun corruptStoredJsonFallsBackToDefaults() {
        session { s, _, _ ->
            s.update { it.copy(mode = ProtectionMode.STRICT) }
        }
        // Simulate an older/garbled document by writing a value the decoder can't read.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = scope) { file }
        runBlocking {
            store.edit { it[stringPreferencesKey("settings")] = "{garbage" }
            assertEquals(ProtectionMode.FRIEND, SettingsRepository(store).get().mode)
        }
        scope.cancel()
    }
}
