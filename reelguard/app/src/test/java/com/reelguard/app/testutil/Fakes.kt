package com.reelguard.app.testutil

import com.reelguard.app.detection.NodeQuery
import com.reelguard.app.detection.NodeView
import com.reelguard.app.domain.Clock
import com.reelguard.app.domain.TimeStamp
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/** Controllable clock: wall and monotonic time move together unless the test "changes the clock". */
class FakeClock(
    start: LocalDateTime = LocalDateTime.of(2026, 9, 29, 12, 0),
    private val zone: ZoneId = ZoneOffset.UTC,
) : Clock {
    var wallMs: Long = start.atZone(zone).toInstant().toEpochMilli()
    var elapsedMs: Long = 1_000_000L
    var bootCount: Int = 7

    override fun now() = TimeStamp(wallMs, elapsedMs, bootCount)
    override fun zone(): ZoneId = zone

    fun advance(ms: Long) {
        wallMs += ms
        elapsedMs += ms
    }

    fun advanceMinutes(min: Int) = advance(min * 60_000L)

    /** The user changes the wall clock; monotonic time is unaffected. */
    fun setWallClock(ms: Long) {
        wallMs = ms
    }

    fun reboot(downtimeMs: Long = 60_000) {
        wallMs += downtimeMs
        elapsedMs = 5_000
        bootCount++
    }
}

/**
 * A mock accessibility tree. Lets the detector be tested against realistic Instagram
 * screen structures without a device or Instagram installed.
 */
data class FakeNode(
    override val viewId: String? = null,
    override val isSelected: Boolean = false,
    override val isVisibleToUser: Boolean = true,
    val children: List<FakeNode> = emptyList(),
) : NodeView, NodeQuery {
    override fun findByViewId(viewId: String): List<NodeView> {
        val out = mutableListOf<NodeView>()
        fun walk(n: FakeNode) {
            if (n.viewId == viewId) out += n
            n.children.forEach(::walk)
        }
        walk(this)
        return out
    }
}

private const val P = "com.instagram.android:id/"

fun id(name: String) = "$P$name"

/** Builders for typical Instagram screens (based on the default rules' ids). */
object IgScreens {
    fun bottomBar(selected: String?, visible: Boolean = true) = FakeNode(
        viewId = id("tab_bar"),
        isVisibleToUser = visible,
        children = listOf("feed_tab", "search_tab", "clips_tab", "direct_tab", "profile_tab").map {
            FakeNode(viewId = id(it), isSelected = it == selected, isVisibleToUser = visible)
        },
    )

    fun home() = FakeNode(children = listOf(FakeNode(viewId = id("main_feed")), bottomBar("feed_tab")))

    fun reelsTab() = FakeNode(
        children = listOf(FakeNode(viewId = id("clips_viewer_view_pager")), bottomBar("clips_tab")),
    )

    /** Reels tab where Instagram renamed the viewer: only the tab tells us. */
    fun reelsTabRenamedViewer() = FakeNode(
        children = listOf(FakeNode(viewId = id("clips_v2_pager")), bottomBar("clips_tab")),
    )

    fun dmInbox() = FakeNode(
        children = listOf(FakeNode(viewId = id("inbox_refreshable_thread_list_recyclerview")), bottomBar("direct_tab")),
    )

    fun dmThread() = FakeNode(
        children = listOf(
            FakeNode(viewId = id("direct_thread_message_list")),
            FakeNode(viewId = id("row_thread_composer_edittext")),
        ),
    )

    /** Reel opened from a DM: full-screen viewer, bottom bar present in the tree but hidden. */
    fun dmReelViewer() = FakeNode(
        children = listOf(FakeNode(viewId = id("clips_viewer_view_pager")), bottomBar("direct_tab", visible = false)),
    )

    fun storyViewer() = FakeNode(children = listOf(FakeNode(viewId = id("reel_viewer_root"))))

    fun explore() = FakeNode(children = listOf(FakeNode(viewId = id("explore_grid")), bottomBar("search_tab")))

    fun profile() = FakeNode(children = listOf(FakeNode(viewId = id("row_profile_header")), bottomBar("profile_tab")))

    fun unknownScreen() = FakeNode(children = listOf(FakeNode(viewId = id("some_new_thing"))))
}
