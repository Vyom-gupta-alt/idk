package com.reelguard.app.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat
import com.reelguard.app.blocking.BlockActivity
import com.reelguard.app.blocking.ProtectionNotifier
import com.reelguard.app.container
import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.detection.RuleBasedInstagramStateDetector
import com.reelguard.app.detection.SignalExtractor
import com.reelguard.app.diagnostics.DiagnosticsBus
import com.reelguard.app.domain.AppKind
import com.reelguard.app.domain.BlockAction
import com.reelguard.app.domain.BlockRequest
import com.reelguard.app.domain.Foreground
import com.reelguard.app.domain.GuardEngine
import com.reelguard.app.domain.InstagramPackages
import com.reelguard.app.domain.LiveStatus
import com.reelguard.app.domain.ScrollSample
import com.reelguard.app.domain.UsageDelta
import com.reelguard.app.domain.UsageLogic
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.domain.appKindOf
import com.reelguard.app.domain.monitoredPackages
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The only component that observes Instagram.
 *
 * PRIVACY & SCOPE (enforced in three places):
 *  1. `res/xml/accessibility_service_config.xml` sets `packageNames`, so Android itself only
 *     delivers events from Instagram packages. [applyPackageFilter] keeps that list in sync
 *     with the user's settings through `setServiceInfo()`.
 *  2. [onAccessibilityEvent] drops any event whose package is not monitored (defense in depth).
 *  3. Classification reads only view ids, selection state and visibility, through the
 *     content-free [com.reelguard.app.detection.NodeView]. Event text, node text and content
 *     descriptions are never read. Nothing is written to disk except aggregated minutes and
 *     block counts, and nothing ever leaves the device (the app has no INTERNET permission).
 *
 * BATTERY: event-driven. Content-change events are throttled. The only timer is a 5 s
 * heartbeat that runs *only while Reels time is being counted*.
 */
class ReelGuardAccessibilityService : AccessibilityService(), GuardEngine.Sink {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val handler = Handler(Looper.getMainLooper())
    private val detector = RuleBasedInstagramStateDetector()

    private var engine: GuardEngine? = null
    private var settings = UserSettings()
    private var monitored: Set<String> = InstagramPackages.DEFAULT.toSet()
    private var rules = DetectionRules.DEFAULT
    private var extractor = SignalExtractor(rules)

    private var classifyScheduled = false
    private var heartbeatScheduled = false
    private var receiverRegistered = false

    private val classifyRunnable = Runnable {
        classifyScheduled = false
        classifyInstagram()
    }

    private val heartbeatRunnable = Runnable {
        heartbeatScheduled = false
        val e = engine ?: return@Runnable
        e.onHeartbeat(currentForeground())
        scheduleHeartbeatIfNeeded()
    }

    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) {
                engine?.onLeftInstagram()
                handler.removeCallbacks(heartbeatRunnable)
                heartbeatScheduled = false
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        val c = applicationContext.container
        val e = GuardEngine(c.clock, this)
        engine = e

        scope.launch {
            c.settings.settings.collect { s ->
                settings = s
                e.settings = s
                applyPackageFilter(s)
            }
        }
        scope.launch { c.usage.usage.collect { e.storedUsage = it } }
        scope.launch {
            c.rules.rules.collect {
                rules = it
                extractor = SignalExtractor(it)
            }
        }

        ContextCompat.registerReceiver(
            this, screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        receiverRegistered = true
        DiagnosticsBus.setServiceConnected(true)
        ProtectionNotifier.cancel(this)
    }

    /** Narrows OS-level event delivery to exactly the monitored packages. */
    private fun applyPackageFilter(s: UserSettings) {
        val packages = s.monitoredPackages()
        monitored = packages.toSet()
        val info = serviceInfo ?: return
        if (info.packageNames?.toSet() == monitored) return
        info.packageNames = packages.toTypedArray()
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val pkg = event.packageName?.toString() ?: return
        if (pkg !in monitored) return // defense in depth: the OS already filters by package
        val e = engine ?: return

        when (val kind = settings.appKindOf(pkg)) {
            AppKind.INSTAGRAM -> when (event.eventType) {
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                    handler.removeCallbacks(classifyRunnable)
                    classifyScheduled = false
                    classifyInstagram()
                }
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> scheduleClassify()
                AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                    e.onScroll(scrollSampleOf(event))
                    scheduleClassify()
                    scheduleHeartbeatIfNeeded()
                }
            }
            AppKind.INSTAGRAM_LITE, AppKind.EXTRA_CLIENT -> {
                if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                    e.onAlternativeClient(kind, isActiveWindow(pkg))
                }
            }
            AppKind.UNRELATED -> return
        }
    }

    /** Throttle: at most one classification per [CLASSIFY_THROTTLE_MS] for content changes. */
    private fun scheduleClassify() {
        if (classifyScheduled) return
        classifyScheduled = true
        handler.postDelayed(classifyRunnable, CLASSIFY_THROTTLE_MS)
    }

    private fun classifyInstagram() {
        val e = engine ?: return
        val root = rootInActiveWindow ?: return
        // In split screen the active window may belong to another app; skip until Instagram is active.
        if (root.packageName?.toString() != InstagramPackages.INSTAGRAM) return
        val signals = extractor.extract(AndroidNodeQuery(root))
        val result = detector.detect(signals, SystemClock.elapsedRealtime())
        e.onDetection(result, instagramIsActiveWindow = true)
        if (DiagnosticsBus.inspectorEnabled.value) DiagnosticsBus.publishInspectorIds(ViewIdInspector.collect(root))
        scheduleHeartbeatIfNeeded()
    }

    private fun scrollSampleOf(event: AccessibilityEvent): ScrollSample {
        val (dx, dy) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            event.scrollDeltaX.takeIf { it != UNDEFINED } to event.scrollDeltaY.takeIf { it != UNDEFINED }
        } else {
            null to null
        }
        return ScrollSample(
            elapsedMs = SystemClock.elapsedRealtime(),
            fromIndex = event.fromIndex,
            toIndex = event.toIndex,
            deltaY = dy,
            deltaX = dx,
            fromReelsPager = isReelsPager(event),
        )
    }

    /**
     * Is this scroll the Reels pager (count it) or something inside the viewer like the
     * comments sheet (ignore it)? A known pager id, or a full-screen-height scroller, counts.
     * The size check keeps swipe counting working if Instagram renames the pager.
     */
    private fun isReelsPager(event: AccessibilityEvent): Boolean {
        val source = event.source ?: return true
        val id = source.viewIdResourceName
        if (id != null && id in rules.reelsPagerViewIds) return true
        val bounds = Rect().also(source::getBoundsInScreen)
        val screenHeight = resources.displayMetrics.heightPixels
        return screenHeight > 0 && bounds.height() >= screenHeight * FULLSCREEN_FRACTION
    }

    private fun isActiveWindow(pkg: String): Boolean = rootInActiveWindow?.packageName?.toString() == pkg

    /** Reads only the package name of the active window, and only during a timed session. */
    private fun currentForeground(): Foreground {
        val pkg = rootInActiveWindow?.packageName?.toString() ?: return Foreground.UNKNOWN
        return if (pkg in monitored) Foreground.MONITORED else Foreground.OTHER
    }

    private fun scheduleHeartbeatIfNeeded() {
        val e = engine ?: return
        if (e.needsHeartbeat() && !heartbeatScheduled) {
            heartbeatScheduled = true
            handler.postDelayed(heartbeatRunnable, HEARTBEAT_MS)
        }
    }

    // ---- GuardEngine.Sink --------------------------------------------------------------

    override fun persist(delta: UsageDelta) {
        val c = applicationContext.container
        c.appScope.launch {
            c.usage.update { UsageLogic.apply(it, delta, c.clock.now(), c.clock.zone()) }
        }
    }

    override fun block(request: BlockRequest) {
        when (request.action) {
            BlockAction.BACK -> performGlobalAction(GLOBAL_ACTION_BACK)
            BlockAction.HOME -> performGlobalAction(GLOBAL_ACTION_HOME)
            BlockAction.NONE -> Unit
        }
        // Give Instagram a moment to process Back before our screen covers it.
        val delay = if (request.action == BlockAction.BACK) 150L else 0L
        handler.postDelayed({ BlockActivity.launch(this, request) }, delay)
    }

    override fun status(status: LiveStatus) {
        DiagnosticsBus.publish(status, System.currentTimeMillis())
    }

    // ---- Lifecycle ---------------------------------------------------------------------

    override fun onInterrupt() = Unit

    override fun onUnbind(intent: Intent?): Boolean {
        engine?.onLeftInstagram()
        if (settings.protectionEnabled) ProtectionNotifier.showStopped(this)
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (receiverRegistered) {
            unregisterReceiver(screenOffReceiver)
            receiverRegistered = false
        }
        engine?.flush()
        engine = null
        scope.cancel()
        DiagnosticsBus.setServiceConnected(false)
        super.onDestroy()
    }

    private companion object {
        const val CLASSIFY_THROTTLE_MS = 300L
        const val HEARTBEAT_MS = 5_000L
        const val FULLSCREEN_FRACTION = 0.7f
        /** AccessibilityRecord reports -1 when a scroll delta was not provided. */
        const val UNDEFINED = -1
    }
}
