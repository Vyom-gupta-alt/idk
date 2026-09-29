package com.reelguard.app.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.domain.UsageState
import com.reelguard.app.domain.UserSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json

/**
 * All persistent state lives in one local Preferences DataStore file
 * (`files/datastore/reelguard.preferences_pb`). There is no database, no network and no
 * backup: `android:allowBackup="false"` keeps it out of cloud backups too.
 *
 * Each document is stored as JSON under a single key, which makes updates atomic
 * and keeps the schema in the @Serializable data classes.
 */
internal val storeJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
}

private fun <T> Preferences.decode(key: Preferences.Key<String>, serializer: KSerializer<T>, default: T): T =
    this[key]?.let { runCatching { storeJson.decodeFromString(serializer, it) }.getOrNull() } ?: default

class JsonDocument<T>(
    private val store: DataStore<Preferences>,
    name: String,
    private val serializer: KSerializer<T>,
    private val default: T,
) {
    private val key = stringPreferencesKey(name)

    val flow: Flow<T> = store.data.map { it.decode(key, serializer, default) }.distinctUntilChanged()

    suspend fun get(): T = flow.first()

    suspend fun update(transform: (T) -> T): T {
        var result = default
        store.edit { prefs ->
            result = transform(prefs.decode(key, serializer, default))
            prefs[key] = storeJson.encodeToString(serializer, result)
        }
        return result
    }

    suspend fun clear() {
        store.edit { it.remove(key) }
    }
}

class SettingsRepository(store: DataStore<Preferences>) {
    private val doc = JsonDocument(store, "settings", UserSettings.serializer(), UserSettings())
    val settings: Flow<UserSettings> = doc.flow
    suspend fun get() = doc.get()
    suspend fun update(transform: (UserSettings) -> UserSettings) = doc.update(transform)
    suspend fun reset() = doc.clear()
}

class UsageRepository(store: DataStore<Preferences>) {
    private val doc = JsonDocument(store, "usage", UsageState.serializer(), UsageState())
    val usage: Flow<UsageState> = doc.flow
    suspend fun get() = doc.get()
    suspend fun update(transform: (UsageState) -> UsageState) = doc.update(transform)
    suspend fun clear() = doc.clear()
}

/** Detection rules: the built-in defaults, unless the user pasted a replacement. */
class RulesRepository(private val store: DataStore<Preferences>) {
    private val key = stringPreferencesKey("rules_override")

    val rules: Flow<DetectionRules> = store.data.map { prefs ->
        prefs[key]?.let { DetectionRules.parse(it).getOrNull() } ?: DetectionRules.DEFAULT
    }.distinctUntilChanged()

    val isCustom: Flow<Boolean> = store.data.map { it[key] != null }.distinctUntilChanged()

    suspend fun setOverride(json: String): Result<DetectionRules> {
        val parsed = DetectionRules.parse(json)
        parsed.onSuccess { rules -> store.edit { it[key] = rules.toJson() } }
        return parsed
    }

    suspend fun reset() {
        store.edit { it.remove(key) }
    }
}
