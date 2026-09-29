# Stage 0: Technical feasibility analysis

Goal: let the device owner use Instagram for messaging (including watching a Reel a
friend sent) while making the Reels *feed* hard to scroll mindlessly. The app uses
only public Android APIs, needs no root, does not modify Instagram, and does not
intercept network traffic.

Terms used below:
**possible**: public API, works reliably.
**heuristic**: works, but depends on Instagram's UI, which Instagram can change without notice.
**not possible**: no legitimate API exists.

---

## 1. Candidate Android mechanisms

| Mechanism | What it can do | Verdict |
|---|---|---|
| **Public Instagram API** | The Graph API is for business content publishing. It has no way to control the Instagram app's UI. | Not possible. Not used. |
| **AccessibilityService** | Receives UI events (window changes, scrolls, clicks) and can query the view hierarchy (view ids, content descriptions, selection state) of apps it is configured for. It can call `performGlobalAction(BACK/HOME)` and start activities. | **Possible. This is the core mechanism.** It is the only public API that can see *which screen inside* Instagram is showing. |
| **UsageStatsManager** | Tells you *which app* is in the foreground and for how long. It knows nothing about screens inside the app. It needs the special "Usage access" permission. | Possible, but cannot tell the Reels feed apart from DMs, so it is useless for the core goal. **Not used** (one less sensitive permission). |
| **Foreground-app detection** | Any method (UsageStats, accessibility window events) gives package-level granularity only. | Covered by the AccessibilityService, filtered to Instagram packages. |
| **NotificationListenerService** | Reads *all* notifications from *all* apps, which is very invasive. It still cannot tell whether a tap on a notification opened a Reel. | **Not used.** The privacy cost is far larger than the benefit. See §4 for the alternative. |
| **Overlay (`SYSTEM_ALERT_WINDOW`)** | Draws over other apps. | Not needed. An AccessibilityService may start activities from the background (it is an explicit exemption in Android's background-activity-launch rules), so the block screen is an ordinary full-screen `Activity`. That is simpler, fully accessible to TalkBack, and needs no extra permission. |
| **Digital Wellbeing app timers** | The system feature can limit *all* of Instagram per day. There is no API for third-party apps to set timers or to limit *part* of an app. | Not possible to integrate. Documented as a complementary tool (and for browsers, see §5). |
| **Intents / deep links** | We could open Instagram's DM inbox (`instagram://direct-inbox`) after a block. | Possible, but undocumented and may break. **Not used as a primary mechanism.** A plain `BACK` action is more robust. |
| **Local storage** | Jetpack DataStore. | Possible. Used. Room is not needed because all data is tiny and aggregated. |
| **Hidden APIs / root / APK patching / VPN interception** | Forbidden by the requirements, and in most cases by Play policy. | Not used. |

**Conclusion:** A **package-filtered AccessibilityService with a deterministic,
rule-based screen detector** is the only legitimate approach that can tell
Instagram screens apart. Everything else is support around it.

---

## 2. What the AccessibilityService can realistically observe inside Instagram

Instagram is a mostly native Android app. Many of its views expose
`viewIdResourceName` values (e.g. `com.instagram.android:id/clips_tab`).
Some internal naming matters:

* Internally, Instagram calls **Reels "clips"** (`clips_tab`, `clips_viewer_*`).
* Internally, **"reel" usually means Stories** (`reel_viewer_*`). A naive detector
  that looks for "reel" would block Stories. The rules in this project avoid that.

What we can see **reliably** (possible), as long as Instagram keeps the ids:

1. **Bottom navigation state.** The Reels tab button is a separate view. When
   the tab is active it reports `isSelected = true`. This is the strongest
   signal for "the user opened the Reels feed".
2. **The full-screen Reels viewer.** The vertical pager that hosts Reels has
   its own ids.
3. **DM thread / DM inbox screens.** The message composer and the inbox list
   have their own ids.
4. **Vertical scroll events** (`TYPE_VIEW_SCROLLED`) inside the viewer. These
   usually carry a `fromIndex`/`toIndex` position (RecyclerView-based pagers
   report item positions), or at least a burst of scroll events per swipe.

What we **cannot** see (not possible):

* We cannot tell *which* Reel is playing, who posted it, or whether it is "the
  one your friend sent", unless we read on-screen text such as usernames and
  captions. That is private content, and **we deliberately never read it.**
* We cannot see the source of an Instagram launch (a notification tap, a link in
  another app, or the launcher). Android does not expose the caller.

### ⚠️ Stability warning

View ids are not a public contract. Instagram updates weekly and runs A/B
tests. **Any id-based rule can break without notice.** The design therefore:

* keeps every id in **one rules file** (`DetectionRules`). It can be replaced at
  runtime from the Diagnostics screen as JSON, with no app update needed;
* uses **several alternative ids per signal** and content-description fallbacks;
* **degrades safely** (see §3): when origin detection fails, the swipe counter
  still stops feed browsing after the allowance;
* ships a **Diagnostics screen** with a developer "view-id inspector" so the
  device owner can find the new ids after an Instagram update.

The default ids in this repository are best-known values. They were **not
verified against a live Instagram build in this development environment**
(no device with Instagram was available). Verify them on your device with
Diagnostics → Inspector before relying on the app. See `TROUBLESHOOTING.md`.

---

## 3. The core problem: an "intentional Reel" versus the "Reels feed"

**Perfect distinction is impossible.** When you tap a Reel in a DM, Instagram
opens *the same full-screen Reels viewer* that the Reels tab uses. In current
versions you can swipe up from a DM Reel into an endless recommended feed.
Nothing in the UI structure says "this Reel came from a friend".

**The closest practical design has three layers:**

1. **Block the Reels tab directly.** If the Reels tab is selected in the bottom
   bar, the user entered the feed on purpose, so block it. High confidence.
2. **Origin tracking.** When the Reels viewer appears, look at the *last
   Instagram screen seen before it*:
   * DM thread or DM inbox → `FROM_DM` (intentional).
   * Instagram was not in the foreground a moment ago → `FROM_EXTERNAL` (a
     notification or a link from another app. Usually a friend's link.)
   * Profile, Home feed, Stories, Explore → "other single Reel".
   * Reels tab → the feed.
3. **Swipe allowance: the robust fallback.** Each viewer session counts how
   many distinct Reels were shown (vertical page changes). An intentional
   origin gets `1 + allowance` Reels (default: the Reel you opened plus 1 extra,
   for when a friend sent two). **Swiping past that means you are browsing.**
   Browsing is blocked unless your mode grants browsing time (Time-limit /
   Cooldown).

Why this degrades well: if Instagram renames the Reels-tab id, the tab is
not detected. Origin is then the previous screen (Home), so you get *one*
Reel and are blocked on the first swipe. If the viewer id itself breaks,
detection fails open (nothing is blocked). That is why the Diagnostics
screen shows a warning when the last several Instagram screens were all
`OTHER`.

### Case (C): indirect scrolling from Explore, profiles, or search

This case is handled by the same swipe allowance: a Reel opened from Explore or
a profile is a single Reel. Swiping onward counts as browsing. Explore itself
(the grid) can optionally be blocked, because it is the second largest
endless-content surface.

---

## 4. Mode feasibility

| Mode | Feasible? | Notes |
|---|---|---|
| Strict | Yes (heuristic) | Tab blocked. Viewer sessions from DMs get exactly 1 Reel. All other viewer sessions are blocked. Explore grid blocked. |
| Friend | Yes (heuristic) | Tab blocked. DM or external Reels get 1 + 1. Single Reels from profiles and Explore are allowed, but no swiping. |
| Time-limit | Yes | Browsing (not intentional viewing) is timed with the monotonic clock while the viewer or tab is on screen. When the limit is reached, browsing is blocked. |
| Cooldown | Yes | Continuous browsing longer than X minutes starts a cooldown of Y minutes. A break of 2 minutes or more resets the "continuous" counter. |
| Custom | Yes | Every knob is exposed. |
| "Whether notifications can open Instagram" | **Partially.** We cannot see notification taps without reading every notification on the device. | Implemented as **"Allow Reels opened from outside Instagram"** (notifications and links from other apps). Detected by the fact that Instagram was not in the foreground right before the viewer appeared. |

---

## 5. Anti-bypass feasibility

The device owner must always be able to remove the app. Each bypass gets
friction, not prevention. See `ANTI_BYPASS.md` for the full table. In short:

* **Disable the service, force stop, uninstall, clear data:** cannot and must not
  be prevented (Play policy also forbids preventing uninstall). Friction: a
  notification when the service is unbound, and a red status on the home screen.
  Protective defaults, so clearing data resets to Friend mode, not "off".
* **Recents, split screen, other apps, notifications:** all of them eventually
  show an Instagram window, which produces events, so detection applies
  regardless of how Instagram was opened.
* **Changing the device time:** cooldown and override deadlines use
  `SystemClock.elapsedRealtime()` plus the boot count, so wall-clock changes do
  not affect them. Day rollover is cross-checked against the monotonic clock
  within the same boot. Limitation: a clock change combined with a reboot
  cannot be detected.
* **Instagram Lite / other clients:** Lite's UI is rendered by a custom engine
  and exposes almost no view ids, so detection inside it is **not reliable**.
  The option offered instead is to "block Instagram Lite entirely". Extra
  package names (mods, forks) can be added. Filtering is updated with
  `setServiceInfo()`.
* **Browser (instagram.com):** we do **not** monitor browsers. Reading URL bars
  of every browser is exactly the cross-app surveillance this app avoids. The
  suggested alternative is Digital Wellbeing's per-site limits in Chrome, or a
  DNS / browser-level blocklist.
* **Cloned apps / work profile / Samsung Dual Messenger:** these run in a
  different Android user profile. Whether a service in the main profile gets
  their events depends on the OEM and version. **Untested. Assume not covered.**
* **Picture-in-picture:** Instagram does not use PiP for Reels. Not applicable.

---

## 6. Battery

* No foreground service, no polling loop, no wake locks, no alarms, no network.
* The system binds the AccessibilityService and delivers events **only from
  Instagram packages**: the XML `packageNames` filter is enforced by the OS.
* Event types: `TYPE_WINDOW_STATE_CHANGED`, `TYPE_WINDOW_CONTENT_CHANGED`,
  `TYPE_VIEW_SCROLLED`. Content-change events are debounced (300 ms), because
  Instagram produces many of them.
* Screen classification uses `findAccessibilityNodeInfosByViewId` for about 20
  known ids. The search runs inside Instagram's process, which is cheaper than
  walking the whole tree.
* **The only timer:** while a Reels session is being timed, a 5-second
  heartbeat updates usage and checks that Instagram is still in front. It
  stops as soon as the session ends. A screen-off broadcast ends sessions
  immediately.

---

## 7. Reliability

| Situation | Behavior |
|---|---|
| Reboot | Accessibility services are re-bound by the system after the user unlocks the device. No `BOOT_COMPLETED` receiver is needed. |
| App update | The service is re-bound automatically. |
| Instagram update | Ids may change. Use the Diagnostics warning, the inspector, and replacing the rules JSON. |
| Android update | Only public APIs are used. |
| Service killed (OEM battery killers) | The notification plus the red home-screen status tell you. `TROUBLESHOOTING.md` covers per-OEM settings. We do **not** request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (Play-restricted and unnecessary on stock Android). |
| Permission revoked | Same as service killed. |
| Split screen / multi-window | Events arrive from the Instagram window. `BACK` is performed only if Instagram owns the active window. Otherwise only the block screen is shown. |
| Orientation, dark mode, screen sizes | Compose UI with `rememberSaveable`. Detection does not use coordinates. |
| Android 13+ sideloaded APK | **"Restricted settings"**: Android blocks enabling accessibility for sideloaded apps until you allow it in App info → ⋮ → *Allow restricted settings*. Onboarding explains this. |
| Android 16 Advanced Protection | Blocks accessibility services from apps not declared as accessibility tools. We are **not** one (honest declaration), so the app cannot work while Advanced Protection is on. |

---

## 8. SDK levels

* **compileSdk 36 / targetSdk 36 (Android 16).** Google Play requires new
  apps and updates to target Android 16 (API 36) from 31 August 2026. API 37
  exists, but the stable Android Gradle Plugin 8.x line used here is validated
  up to API 36.
* **minSdk 26 (Android 8.0).** This gives `java.time`, notification channels,
  and adaptive icons. It covers well over 95% of active devices. Everything the
  service uses (`TYPE_VIEW_SCROLLED` indices, `performGlobalAction`,
  `setServiceInfo`, `Settings.Global.BOOT_COUNT`) exists at API 24 or lower.

---

## 9. Google Play policy (checked against the Play Console Help "Use of the AccessibilityService API", Sept 2026)

* Apps that are not accessibility tools **may** use the API, but must:
  * show a **prominent in-app disclosure** during normal use (not only in the
    privacy policy). It must say what data is accessed and why, and require an
    **affirmative action** (tap) before sending the user to Settings. This is
    implemented in onboarding step "Privacy & permission", with an "I agree"
    button;
  * complete the **Play Console declaration**, including a **video** of the
    disclosure-and-consent flow;
  * **not** set `isAccessibilityTool="true"`. We set it to `false`.
* Prohibited: using the API to autonomously initiate or plan actions (the
  "agentic" rule). Our behavior is static and rule-based (fixed rules, then
  BACK), which the policy explicitly permits for non-accessibility apps.
* Other policies we comply with by design: no preventing uninstall (Device &
  Network Abuse), no changing system settings, no deceptive UI (the block
  screen is clearly branded ReelGuard, not Instagram or Android system UI), and
  no data collection (Data safety: *No data collected, no data shared*).
* **Practical risk:** Google reviews accessibility declarations manually.
  Digital-wellbeing blockers of this kind do exist on Play, but approval is not
  guaranteed. Sideloading the APK (this project's primary target) has no such
  review.
