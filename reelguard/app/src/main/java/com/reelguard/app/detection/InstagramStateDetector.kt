package com.reelguard.app.detection

import com.reelguard.app.domain.ScreenState

/**
 * Minimal read-only view of an accessibility node.
 *
 * PRIVACY: deliberately exposes only structural properties. There is no text or
 * content-description accessor, so detection code *cannot* read what is on screen.
 */
interface NodeView {
    val viewId: String?
    val isSelected: Boolean
    val isVisibleToUser: Boolean
}

/** A window's node tree, queried by view id (the search runs inside the target app). */
interface NodeQuery {
    fun findByViewId(viewId: String): List<NodeView>
}

/** Which logical signals are visible on screen, and which of them are in a selected state. */
data class ScreenSignals(
    val present: Set<String>,
    val selected: Set<String>,
) {
    companion object {
        val NONE = ScreenSignals(emptySet(), emptySet())
    }
}

enum class Confidence { LOW, MEDIUM, HIGH }

data class DetectionResult(
    val state: ScreenState,
    val confidence: Confidence,
    /** Stable, content-free rule identifier, safe to show and to include in reports. */
    val reason: String,
    val elapsedMs: Long,
    val signals: ScreenSignals,
)

/** Extracts [ScreenSignals] by asking only for the view ids listed in the rules. */
class SignalExtractor(private val rules: DetectionRules) {
    fun extract(root: NodeQuery): ScreenSignals {
        val present = mutableSetOf<String>()
        val selected = mutableSetOf<String>()
        for (rule in rules.signals) {
            for (id in rule.viewIds) {
                val nodes = root.findByViewId(id).filter { it.isVisibleToUser }
                if (nodes.isEmpty()) continue
                present += rule.key
                if (nodes.any { it.isSelected }) selected += rule.key
            }
        }
        return ScreenSignals(present, selected)
    }
}

interface InstagramStateDetector {
    fun detect(signals: ScreenSignals, elapsedMs: Long): DetectionResult
}

/**
 * Deterministic, ordered rules. The first matching rule wins. No ML, no network.
 */
class RuleBasedInstagramStateDetector : InstagramStateDetector {

    override fun detect(signals: ScreenSignals, elapsedMs: Long): DetectionResult {
        fun has(k: String) = k in signals.present
        fun sel(k: String) = k in signals.selected
        fun r(state: ScreenState, c: Confidence, reason: String) = DetectionResult(state, c, reason, elapsedMs, signals)

        return when {
            has(SignalKeys.REELS_VIEWER) && sel(SignalKeys.REELS_TAB) ->
                r(ScreenState.REELS_TAB, Confidence.HIGH, "viewer+reels_tab_selected")
            has(SignalKeys.REELS_VIEWER) ->
                r(ScreenState.REEL_VIEWER, Confidence.HIGH, "reels_viewer")
            sel(SignalKeys.REELS_TAB) ->
                r(ScreenState.REELS_TAB, Confidence.MEDIUM, "reels_tab_selected_no_viewer")
            has(SignalKeys.STORY_VIEWER) ->
                r(ScreenState.STORIES, Confidence.HIGH, "story_viewer")
            has(SignalKeys.DM_THREAD) ->
                r(ScreenState.DM_THREAD, Confidence.HIGH, "dm_thread")
            has(SignalKeys.DM_INBOX) || sel(SignalKeys.DM_TAB) ->
                r(ScreenState.DM_INBOX, Confidence.HIGH, "dm_inbox")
            sel(SignalKeys.EXPLORE_TAB) ->
                r(ScreenState.EXPLORE, Confidence.HIGH, "explore_tab_selected")
            sel(SignalKeys.PROFILE_TAB) || has(SignalKeys.PROFILE_HEADER) ->
                r(ScreenState.PROFILE, Confidence.MEDIUM, "profile")
            sel(SignalKeys.HOME_TAB) ->
                r(ScreenState.HOME, Confidence.HIGH, "home_tab_selected")
            signals.present.isNotEmpty() ->
                r(ScreenState.OTHER, Confidence.LOW, "known_ids_but_no_rule")
            else ->
                r(ScreenState.UNKNOWN, Confidence.LOW, "no_known_ids")
        }
    }
}
