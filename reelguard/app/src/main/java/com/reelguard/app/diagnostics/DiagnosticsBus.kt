package com.reelguard.app.diagnostics

import com.reelguard.app.detection.Confidence
import com.reelguard.app.domain.Decision
import com.reelguard.app.domain.InterpretedState
import com.reelguard.app.domain.LiveStatus
import com.reelguard.app.domain.ScreenState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * In-process, in-memory channel between the accessibility service and the UI.
 *
 * PRIVACY: nothing here is written to disk, and everything is gone when the process dies.
 * Entries contain classifications and rule identifiers only, never screen text.
 */
object DiagnosticsBus {
    data class Entry(
        val wallMs: Long,
        val state: ScreenState,
        val confidence: Confidence?,
        val reason: String,
        val interpreted: InterpretedState,
        val decision: String,
    )

    private const val MAX_ENTRIES = 40
    const val UNKNOWN_STREAK_WARNING = 12

    private val _serviceConnected = MutableStateFlow(false)
    val serviceConnected: StateFlow<Boolean> = _serviceConnected.asStateFlow()

    private val _live = MutableStateFlow<LiveStatus?>(null)
    val live: StateFlow<LiveStatus?> = _live.asStateFlow()

    private val _recent = MutableStateFlow<List<Entry>>(emptyList())
    val recent: StateFlow<List<Entry>> = _recent.asStateFlow()

    /** Consecutive detections that matched no specific screen: a hint the rules are stale. */
    private val _unknownStreak = MutableStateFlow(0)
    val unknownStreak: StateFlow<Int> = _unknownStreak.asStateFlow()

    /** Developer inspector: off by default, in-memory only, cleared when turned off. */
    private val _inspectorEnabled = MutableStateFlow(false)
    val inspectorEnabled: StateFlow<Boolean> = _inspectorEnabled.asStateFlow()

    private val _inspectorIds = MutableStateFlow<List<String>>(emptyList())
    val inspectorIds: StateFlow<List<String>> = _inspectorIds.asStateFlow()

    fun setServiceConnected(connected: Boolean) {
        _serviceConnected.value = connected
        if (!connected) _live.value = null
    }

    fun publish(status: LiveStatus, wallMs: Long) {
        val previous = _live.value
        _live.value = status
        val detection = status.detection
        val entry = Entry(
            wallMs = wallMs,
            state = detection?.state ?: ScreenState.UNKNOWN,
            confidence = detection?.confidence,
            reason = detection?.reason ?: status.appKind.name.lowercase(),
            interpreted = status.interpreted,
            decision = status.decision.label(),
        )
        val changed = previous == null ||
            previous.detection?.state != detection?.state ||
            previous.decision != status.decision ||
            previous.interpreted != status.interpreted
        if (changed) _recent.update { (listOf(entry) + it).take(MAX_ENTRIES) }

        if (detection != null) {
            val vague = detection.state == ScreenState.OTHER || detection.state == ScreenState.UNKNOWN
            _unknownStreak.update { if (vague) it + 1 else 0 }
        }
    }

    fun setInspectorEnabled(enabled: Boolean) {
        _inspectorEnabled.value = enabled
        if (!enabled) _inspectorIds.value = emptyList()
    }

    fun publishInspectorIds(ids: List<String>) {
        if (_inspectorEnabled.value) _inspectorIds.value = ids
    }

    fun clearRecent() {
        _recent.value = emptyList()
    }
}

fun Decision.label(): String = when (this) {
    is Decision.Allow -> "allow"
    is Decision.Block -> "block:${reason.name.lowercase()}"
}
