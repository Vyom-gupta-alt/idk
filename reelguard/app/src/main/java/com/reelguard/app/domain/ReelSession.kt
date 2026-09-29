package com.reelguard.app.domain

import kotlinx.serialization.Serializable

/**
 * Raw screen classification produced by the detector. These describe *what is on screen*,
 * not whether it is allowed. [ReelSessionTracker] adds the "how did we get here" context.
 */
@Serializable
enum class ScreenState {
    UNKNOWN,
    HOME,
    DM_INBOX,
    DM_THREAD,
    /** Reels tab selected in the bottom bar (the feed). */
    REELS_TAB,
    /** Full-screen Reels viewer, entered from anywhere. */
    REEL_VIEWER,
    EXPLORE,
    PROFILE,
    STORIES,
    /** Inside Instagram, but no known screen matched. */
    OTHER;

    val isReels: Boolean get() = this == REELS_TAB || this == REEL_VIEWER

    /** States that reliably mean "the user is on a normal, non-Reels screen". */
    val isStableNonReels: Boolean
        get() = this == HOME || this == DM_INBOX || this == DM_THREAD || this == EXPLORE ||
            this == PROFILE || this == STORIES
}

/** Where a Reels-viewer session was entered from. */
@Serializable
enum class ReelOrigin { DM, EXTERNAL, PROFILE, HOME_FEED, EXPLORE, STORIES, REELS_TAB, UNKNOWN }

/**
 * The user-facing interpretation shown in Diagnostics, matching the vocabulary of the spec
 * (DM_REEL, REELS_FEED, ...).
 */
enum class InterpretedState { UNKNOWN, HOME, DM, DM_REEL, SHARED_REEL, SINGLE_REEL, REELS_FEED, EXPLORE, PROFILE, STORIES, OTHER }

data class ReelSession(
    val origin: ReelOrigin,
    val startedAtElapsed: Long,
    /** Distinct Reels shown in this session, including the first one. */
    val reelsSeen: Int = 1,
)

/** One accessibility scroll event, reduced to the few numbers we use. */
data class ScrollSample(
    val elapsedMs: Long,
    val fromIndex: Int,
    val toIndex: Int,
    /** Null when the platform/app did not report a delta. */
    val deltaY: Int?,
    val deltaX: Int?,
    /** True when the scrolled view is (or might be) the Reels pager, not e.g. a comments list. */
    val fromReelsPager: Boolean,
)

/**
 * Counts how many *distinct* Reels were shown in the viewer.
 *
 * Two strategies, chosen automatically:
 * - Index mode: RecyclerView-based pagers report item positions; count distinct settled
 *   positions (`fromIndex == toIndex`). Swiping back to an earlier Reel does not count.
 * - Gesture mode: when no indices are available, each burst of scroll events separated by
 *   [gestureGapMs] counts as one swipe. Upward (negative deltaY) bursts are ignored.
 */
class SwipeCounter(private val gestureGapMs: Long = 600L) {
    private val visited = mutableSetOf<Int>()
    private var indexMode = false
    private var lastEventElapsed = Long.MIN_VALUE
    private var gestureCounted = false
    var extraReels: Int = 0
        private set

    fun reset() {
        visited.clear()
        indexMode = false
        lastEventElapsed = Long.MIN_VALUE
        gestureCounted = false
        extraReels = 0
    }

    /** Returns true if the count changed. */
    fun onScroll(s: ScrollSample): Boolean {
        if (!s.fromReelsPager) return false
        val horizontalOnly = s.deltaY != null && s.deltaY == 0 && s.deltaX != null && s.deltaX != 0
        if (horizontalOnly) return false

        val before = extraReels
        if (s.fromIndex >= 0 && s.toIndex >= 0) {
            if (!indexMode) {
                indexMode = true
                visited.add(s.fromIndex) // the Reel the session started on
            }
            if (s.fromIndex == s.toIndex) visited.add(s.fromIndex)
            extraReels = (visited.size - 1).coerceAtLeast(0)
        } else if (!indexMode) {
            val newGesture = s.elapsedMs - lastEventElapsed > gestureGapMs
            lastEventElapsed = s.elapsedMs
            if (newGesture) gestureCounted = false
            val upward = s.deltaY != null && s.deltaY < 0
            if (!gestureCounted && !upward) {
                gestureCounted = true
                extraReels++
            }
        }
        return extraReels != before
    }
}

/**
 * Tracks Reels-viewer sessions and where they came from. Pure logic, driven by the service.
 *
 * Origin is inferred from the last *stable* Instagram screen seen before the viewer
 * appeared. If Instagram was not in the foreground just before (we saw it leave, or saw
 * nothing from it for [externalGapMs]), the viewer was opened from outside: a
 * notification or a link in another app.
 */
class ReelSessionTracker(
    private val externalGapMs: Long = 120_000L,
    private val resumeWindowMs: Long = 20_000L,
) {
    private val swipes = SwipeCounter()
    private var lastStableState: ScreenState? = null
    private var lastInstagramActivityElapsed: Long = Long.MIN_VALUE
    private var leftInstagram = true
    private var endedSession: ReelSession? = null
    private var endedAtElapsed: Long = Long.MIN_VALUE
    private var stateSinceEnd: ScreenState? = null

    var session: ReelSession? = null
        private set

    fun onScreen(state: ScreenState, nowElapsed: Long) {
        if (state == ScreenState.UNKNOWN) return // transient; keep whatever we had
        if (state.isReels) {
            val current = session
            if (current == null) {
                session = startOrResume(state, nowElapsed)
            } else if (state == ScreenState.REELS_TAB && current.origin != ReelOrigin.REELS_TAB) {
                session = current.copy(origin = ReelOrigin.REELS_TAB)
            }
        } else {
            endSession(nowElapsed)
            if (state.isStableNonReels) lastStableState = state
            if (endedSession != null && stateSinceEnd == null) stateSinceEnd = state
        }
        lastInstagramActivityElapsed = nowElapsed
        leftInstagram = false
    }

    fun onScroll(sample: ScrollSample) {
        val current = session ?: return
        if (swipes.onScroll(sample)) session = current.copy(reelsSeen = 1 + swipes.extraReels)
        lastInstagramActivityElapsed = sample.elapsedMs
    }

    /** Instagram is no longer in front (screen off, another app, home). */
    fun onLeftInstagram(nowElapsed: Long) {
        endSession(nowElapsed)
        endedSession = null // leaving Instagram forfeits resuming
        leftInstagram = true
    }

    private fun startOrResume(state: ScreenState, now: Long): ReelSession {
        val ended = endedSession
        val detourWasDm = stateSinceEnd == ScreenState.DM_THREAD || stateSinceEnd == ScreenState.DM_INBOX
        // Returning to the viewer shortly after a detour (e.g. viewer → profile → back) resumes
        // the same session, so hopping out and back in does not grant a fresh allowance.
        if (ended != null && now - endedAtElapsed <= resumeWindowMs && !detourWasDm) {
            endedSession = null
            return ended.copy(origin = if (state == ScreenState.REELS_TAB) ReelOrigin.REELS_TAB else ended.origin)
        }
        endedSession = null
        swipes.reset()
        return ReelSession(originFor(state, now), now)
    }

    private fun originFor(state: ScreenState, now: Long): ReelOrigin {
        if (state == ScreenState.REELS_TAB) return ReelOrigin.REELS_TAB
        val cameFromOutside = leftInstagram ||
            lastInstagramActivityElapsed == Long.MIN_VALUE ||
            now - lastInstagramActivityElapsed > externalGapMs
        if (cameFromOutside) return ReelOrigin.EXTERNAL
        return when (lastStableState) {
            ScreenState.DM_THREAD, ScreenState.DM_INBOX -> ReelOrigin.DM
            ScreenState.PROFILE -> ReelOrigin.PROFILE
            ScreenState.HOME -> ReelOrigin.HOME_FEED
            ScreenState.EXPLORE -> ReelOrigin.EXPLORE
            ScreenState.STORIES -> ReelOrigin.STORIES
            else -> ReelOrigin.UNKNOWN
        }
    }

    private fun endSession(now: Long) {
        val current = session ?: return
        endedSession = current
        endedAtElapsed = now
        stateSinceEnd = null
        session = null
    }
}
