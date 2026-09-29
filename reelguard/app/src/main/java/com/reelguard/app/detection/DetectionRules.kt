package com.reelguard.app.detection

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Logical signal names. The detector reasons only about these keys; which concrete Instagram
 * view ids map to them lives in [DetectionRules], which can be replaced at runtime.
 */
object SignalKeys {
    const val REELS_TAB = "reels_tab"
    const val REELS_VIEWER = "reels_viewer"
    const val HOME_TAB = "home_tab"
    const val EXPLORE_TAB = "explore_tab"
    const val PROFILE_TAB = "profile_tab"
    const val DM_TAB = "dm_tab"
    const val DM_THREAD = "dm_thread"
    const val DM_INBOX = "dm_inbox"
    const val PROFILE_HEADER = "profile_header"
    const val STORY_VIEWER = "story_viewer"

    val ALL = listOf(REELS_TAB, REELS_VIEWER, HOME_TAB, EXPLORE_TAB, PROFILE_TAB, DM_TAB, DM_THREAD, DM_INBOX, PROFILE_HEADER, STORY_VIEWER)
}

/** One logical signal and the alternative view ids that indicate it. Any match counts. */
@Serializable
data class SignalRule(
    val key: String,
    val viewIds: List<String>,
)

/**
 * All Instagram-specific knowledge in one place.
 *
 * Naming trap: inside Instagram, Reels are called "clips" and "reel" usually means *Stories*.
 *
 * IMPORTANT: these ids are best-known values, not a public contract, and were not verified
 * against a live Instagram build when this file was written. Use Diagnostics → View-id
 * inspector on a real device to confirm them, then paste corrected JSON into Diagnostics.
 */
@Serializable
data class DetectionRules(
    val version: Int,
    val testedInstagramVersions: List<String> = emptyList(),
    val notes: String = "",
    val signals: List<SignalRule>,
    /** Scroll events from these ids count as Reel-to-Reel swipes. Empty = any scroll in the viewer. */
    val reelsPagerViewIds: List<String> = emptyList(),
) {
    fun validate(): List<String> = buildList {
        if (version < 1) add("version must be >= 1")
        val keys = signals.map { it.key }
        keys.groupBy { it }.filter { it.value.size > 1 }.keys.forEach { add("duplicate signal key: $it") }
        keys.filter { it !in SignalKeys.ALL }.forEach { add("unknown signal key: $it (known: ${SignalKeys.ALL.joinToString()})") }
        if (SignalKeys.REELS_VIEWER !in keys) add("rules must define '${SignalKeys.REELS_VIEWER}'")
        signals.flatMap { it.viewIds }.filterNot { VIEW_ID.matches(it) }.forEach { add("malformed view id: $it") }
        reelsPagerViewIds.filterNot { VIEW_ID.matches(it) }.forEach { add("malformed pager id: $it") }
    }

    fun signal(key: String): SignalRule? = signals.firstOrNull { it.key == key }

    fun toJson(): String = json.encodeToString(serializer(), this)

    companion object {
        private val VIEW_ID = Regex("^[a-zA-Z0-9_.]+:id/[a-zA-Z0-9_]+$")

        val json = Json {
            prettyPrint = true
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        /** Parses and validates user-supplied JSON. */
        fun parse(text: String): Result<DetectionRules> = runCatching {
            val rules = json.decodeFromString(serializer(), text)
            val problems = rules.validate()
            require(problems.isEmpty()) { problems.joinToString("\n") }
            rules
        }

        private const val P = "com.instagram.android:id/"

        val DEFAULT = DetectionRules(
            version = 1,
            testedInstagramVersions = emptyList(),
            notes = "Default rules. Unverified: confirm with the Diagnostics inspector on your device.",
            signals = listOf(
                SignalRule(SignalKeys.REELS_TAB, listOf("${P}clips_tab")),
                SignalRule(
                    SignalKeys.REELS_VIEWER,
                    listOf(
                        "${P}clips_viewer_view_pager",
                        "${P}clips_viewer_container",
                        "${P}root_clips_layout",
                        "${P}clips_video_container",
                    ),
                ),
                SignalRule(SignalKeys.HOME_TAB, listOf("${P}feed_tab")),
                SignalRule(SignalKeys.EXPLORE_TAB, listOf("${P}search_tab")),
                SignalRule(SignalKeys.PROFILE_TAB, listOf("${P}profile_tab")),
                SignalRule(SignalKeys.DM_TAB, listOf("${P}direct_tab")),
                SignalRule(
                    SignalKeys.DM_THREAD,
                    listOf(
                        "${P}row_thread_composer_edittext",
                        "${P}row_thread_composer_container",
                        "${P}direct_thread_message_list",
                    ),
                ),
                SignalRule(
                    SignalKeys.DM_INBOX,
                    listOf(
                        "${P}inbox_refreshable_thread_list_recyclerview",
                        "${P}direct_inbox_thread_list",
                    ),
                ),
                SignalRule(SignalKeys.PROFILE_HEADER, listOf("${P}row_profile_header", "${P}profile_header_container")),
                SignalRule(SignalKeys.STORY_VIEWER, listOf("${P}reel_viewer_root", "${P}reel_viewer_media_container")),
            ),
            reelsPagerViewIds = listOf("${P}clips_viewer_view_pager"),
        )
    }
}
