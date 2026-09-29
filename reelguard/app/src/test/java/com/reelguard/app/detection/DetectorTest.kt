package com.reelguard.app.detection

import com.reelguard.app.domain.ScreenState
import com.reelguard.app.testutil.FakeNode
import com.reelguard.app.testutil.IgScreens
import com.reelguard.app.testutil.id
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectorTest {
    private val extractor = SignalExtractor(DetectionRules.DEFAULT)
    private val detector = RuleBasedInstagramStateDetector()

    private fun detect(tree: FakeNode) = detector.detect(extractor.extract(tree), 0L)

    @Test fun homeFeed() = assertEquals(ScreenState.HOME, detect(IgScreens.home()).state)

    @Test fun reelsTabWithViewerIsHighConfidenceFeed() {
        val r = detect(IgScreens.reelsTab())
        assertEquals(ScreenState.REELS_TAB, r.state)
        assertEquals(Confidence.HIGH, r.confidence)
    }

    @Test fun reelsTabStillDetectedWhenViewerIdRenamed() {
        val r = detect(IgScreens.reelsTabRenamedViewer())
        assertEquals(ScreenState.REELS_TAB, r.state)
        assertEquals(Confidence.MEDIUM, r.confidence)
    }

    @Test fun dmReelViewerIsViewerNotFeed_hiddenTabBarIgnored() {
        assertEquals(ScreenState.REEL_VIEWER, detect(IgScreens.dmReelViewer()).state)
    }

    @Test fun dmScreens() {
        assertEquals(ScreenState.DM_INBOX, detect(IgScreens.dmInbox()).state)
        assertEquals(ScreenState.DM_THREAD, detect(IgScreens.dmThread()).state)
    }

    @Test fun storiesAreNotReels() {
        // Instagram calls Stories "reel" internally; they must not be treated as Reels.
        assertEquals(ScreenState.STORIES, detect(IgScreens.storyViewer()).state)
    }

    @Test fun exploreAndProfile() {
        assertEquals(ScreenState.EXPLORE, detect(IgScreens.explore()).state)
        assertEquals(ScreenState.PROFILE, detect(IgScreens.profile()).state)
    }

    @Test fun unknownScreenIsUnknownLowConfidence() {
        val r = detect(IgScreens.unknownScreen())
        assertEquals(ScreenState.UNKNOWN, r.state)
        assertEquals(Confidence.LOW, r.confidence)
    }

    @Test fun invisibleNodesDoNotCount() {
        val tree = FakeNode(children = listOf(FakeNode(viewId = id("clips_viewer_view_pager"), isVisibleToUser = false)))
        assertEquals(ScreenState.UNKNOWN, detect(tree).state)
    }

    @Test fun alternativeViewIdsInOneSignalAllWork() {
        for (alt in listOf("clips_viewer_container", "root_clips_layout", "clips_video_container")) {
            val tree = FakeNode(children = listOf(FakeNode(viewId = id(alt))))
            assertEquals(alt, ScreenState.REEL_VIEWER, detect(tree).state)
        }
    }

    @Test fun customRulesChangeDetectionWithoutCodeChanges() {
        val custom = DetectionRules.DEFAULT.copy(
            version = 2,
            signals = DetectionRules.DEFAULT.signals.map {
                if (it.key == SignalKeys.REELS_VIEWER) it.copy(viewIds = listOf(id("clips_v2_pager"))) else it
            },
        )
        val r = RuleBasedInstagramStateDetector().detect(SignalExtractor(custom).extract(IgScreens.reelsTabRenamedViewer()), 0)
        assertEquals(ScreenState.REELS_TAB, r.state)
        assertEquals(Confidence.HIGH, r.confidence)
    }

    @Test fun reasonsAreContentFreeIdentifiers() {
        listOf(IgScreens.home(), IgScreens.reelsTab(), IgScreens.dmThread(), IgScreens.unknownScreen()).forEach {
            assertTrue(Regex("^[a-z_+]+$").matches(detect(it).reason))
        }
    }
}

class DetectionRulesTest {
    @Test fun defaultRulesAreValid() = assertEquals(emptyList<String>(), DetectionRules.DEFAULT.validate())

    @Test fun jsonRoundTrip() {
        val parsed = DetectionRules.parse(DetectionRules.DEFAULT.toJson()).getOrThrow()
        assertEquals(DetectionRules.DEFAULT, parsed)
    }

    @Test fun rejectsMalformedJson() = assertTrue(DetectionRules.parse("{ not json").isFailure)

    @Test fun rejectsUnknownKeysDuplicatesAndBadIds() {
        val bad = """
            {"version":1,"signals":[
              {"key":"reels_viewer","viewIds":["com.instagram.android:id/ok"]},
              {"key":"reels_viewer","viewIds":["not an id"]},
              {"key":"mystery","viewIds":[]}
            ]}
        """.trimIndent()
        val error = DetectionRules.parse(bad).exceptionOrNull()!!.message!!
        assertTrue(error, error.contains("duplicate signal key"))
        assertTrue(error, error.contains("malformed view id"))
        assertTrue(error, error.contains("unknown signal key"))
    }

    @Test fun requiresReelsViewerSignal() {
        val json = """{"version":1,"signals":[{"key":"reels_tab","viewIds":["com.instagram.android:id/clips_tab"]}]}"""
        assertTrue(DetectionRules.parse(json).isFailure)
    }

    @Test fun ignoresUnknownJsonFieldsForForwardCompatibility() {
        val json = """{"version":3,"futureField":true,"signals":[{"key":"reels_viewer","viewIds":["a.b:id/c"]}]}"""
        assertEquals(3, DetectionRules.parse(json).getOrThrow().version)
    }
}
