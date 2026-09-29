# Anti-bypass design

Principle: **friction, not prison.** The device owner must always be able to turn
ReelGuard off or uninstall it. What ReelGuard should prevent is *casual, automatic*
bypassing: the kind that happens without deciding to.

| Bypass | What happens | Friction / mitigation | Residual risk |
|---|---|---|---|
| Turn off the accessibility service | Android unbinds the service | "Reels protection stopped" notification (if allowed). Home screen turns red: "Protection: OFF". | Owner can do it. By design. |
| Force stop ReelGuard | Service killed | Same notification. On most devices the service stays enabled and restarts the next time the system binds it (often only after a reboot or re-toggle). The home screen shows "starting…". | Protection gap until rebound. Documented. |
| Uninstall | Gone | None. Android and Play policy forbid preventing it, and we wouldn't. | By design. |
| Clear ReelGuard's data | Settings and usage reset | Defaults are protective (Friend mode, protection on, settings lock on). The service stays enabled. | Today's usage counter resets. |
| Turn protection off in-app | `protectionEnabled=false` | Countdown (default 20 s) + typed reason (not stored). Usage is still counted. | By design. |
| Change mode to something looser | New policy | **Settings lock**: countdown before settings open. | Deliberate change is allowed. |
| Temporary override, repeatedly | Pause for N min | Countdown + reason + ≥ 60 min between overrides + 3 per day (configurable). Deadlines use the monotonic clock. | Configurable. |
| Change device time/date | Would reset "today" or end cooldowns | Deadlines use `elapsedRealtime` + boot count. Day key is cross-checked against monotonic time within a boot and never rolls backwards. | Clock change **plus** reboot can move to a new day. Documented. |
| Reboot | Service restarts after unlock | Nothing needed. State is in DataStore. | None known. |
| Recents screen → Instagram on the Reels screen | Instagram window appears | `WINDOW_STATE_CHANGED` → detection → block. | None known. |
| Notification → Reel | Viewer opens with Instagram not in front beforehand | Origin `EXTERNAL`: single Reel allowed, swipes blocked. Can be disallowed in Custom. | One Reel per notification. By design. |
| Link from another app / browser → Instagram app | Same as notification | Same | Same |
| instagram.com in a browser | Not observed | **Not covered by design**. Watching browsers would mean reading URLs from all browsing. Alternatives: Digital Wellbeing site timers in Chrome, Private DNS / router blocklists, browser extensions. | Real gap. Documented in onboarding. |
| Instagram Lite | Detected by package | Blocked entirely (default), because its screens can't be classified. | Can be allowed in settings. |
| Modded/alternative clients | Unknown packages | Add their package name under Settings → Other apps, and they are blocked entirely. | User must add them. |
| Cloned apps / work profile / Dual Messenger | Separate Android user profile | **Untested.** OEM-dependent whether the main-profile service sees them. | Likely a gap. |
| Split screen / freeform | Instagram not focused | Block screen shown. Back is only pressed if Instagram owns the active window, to avoid pressing Back in the other app. | If Instagram stays unfocused, the video may keep playing behind. |
| Picture-in-picture | Instagram does not use PiP for Reels | n/a | n/a |
| Detour trick (viewer → profile → back for a fresh allowance) | Session resumed within 20 s | `ReelSessionTracker` resumes the old session, keeping its count. | Waiting 20 s on a profile resets it. Tedious enough. |
| Swipe up very slowly | Each settled Reel counts (index mode), or each gesture burst (fallback) | Counting is per Reel, not per speed. | None known. |
| Instagram UI update breaks ids | Detection degrades | Tab rename → still blocked after one Reel (swipe backstop). Viewer rename → **fails open**, with a Diagnostics warning after 12 unclassified screens. Rules are replaceable as JSON. | Until rules are updated. |

## Deliberately *not* done

* No device-admin or device-owner mode to prevent uninstall.
* No hiding the app icon, no disguising the service name, no fake system dialogs.
* No escalating punishments or guilt copy. "Never mind" is always one tap away.
* No `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompt (Play-restricted, and not needed on stock
  Android). OEM battery killers are covered in Troubleshooting.
