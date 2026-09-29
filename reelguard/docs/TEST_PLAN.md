# Test plan

## Automated: JVM (`./gradlew testDebugUnitTest`, 130 tests, no device needed)

| Suite | Covers |
|---|---|
| `PolicyResolverTest` | Every mode resolves to the expected policy. Custom values are clamped. Defaults are protective. Package filtering. |
| `TimeWindowTest`, `DeadlineTest` | Allowed periods (incl. past midnight). Deadlines ignore wall-clock changes within a boot and fall back after a reboot. |
| `UsageLogicTest` | Accumulation, midnight rollover and archiving, **clock set forward doesn't reset today**, real time still rolls over, never rolls backwards, history/report caps, negative deltas. |
| `UsageMeterTest`, `ContinuousBrowsingTrackerTest` | Time attribution per interval, gap capping, continuous-session reset after a 2-min break. |
| `SwipeCounterTest` | Index mode (distinct settled Reels, swipe-back doesn't count), gesture mode (bursts, upward ignored), horizontal and non-pager scrolls ignored. |
| `ReelSessionTrackerTest` | Origins: DM, tab, external (left Instagram / long silence / first screen), profile, home, explore, stories. Tab upgrade. Detour resume. Fresh session via DM. |
| `BlockDecisionEngineTest` | All block reasons. DM reels survive the daily limit. Count-intentional option. Allowed periods. Cooldown scopes. Override. Protection off. Lite/extra clients. Unrelated apps untouched. |
| `OverrideManagerTest` | Grant → active → cooldown → available. Duration cap. Daily cap and reset. Disabled. Clock tampering. Reason rules. |
| `DetectorTest`, `DetectionRulesTest` | **Mock accessibility trees** for home, Reels tab, renamed viewer, DM inbox/thread, DM Reel viewer (hidden tab bar), Stories (not Reels!), Explore, profile, unknown. Invisible nodes. Alternative ids. Custom rules. Content-free reasons. JSON validation and round trip. |
| `GuardEngineTest` | End-to-end scenarios, tree → detector → engine: messaging never blocked, tab blocked with Back, DM Reel + swipes, intentional vs browsing time, event bursts debounce and escalate to Home, time limit, cooldown, override expiry, leaving Instagram stops counting, unknown foreground timeout, notification-opened Reel, Lite, split screen, persistence of block counts, protection off. |
| `PersistenceTest` | Real DataStore on disk: settings and usage survive restart, 50 sequential updates are not lost, clear, invalid rules rejected, corrupt JSON falls back to defaults. |
| `BlockScreenUiTest` *(Robolectric + Compose)* | Buttons and callbacks, whole-app block hides "Go back", report button state, **dark theme**. |
| `FrictionGateUiTest` *(Robolectric)* | Confirm disabled until countdown + reason; **countdown survives configuration change** (state restoration). |
| `OnboardingUiTest` *(Robolectric)* | Full flow with explicit consent. Declining skips the permission step. Mode choice. Completion. |
| `SettingsUiTest` *(Robolectric)* | Mode and limit changes persist to settings. Custom knobs. |

## Automated: instrumented (`./gradlew connectedDebugAndroidTest`, needs device/emulator)

| Test | Covers |
|---|---|
| `ServiceDeclarationTest` | The OS-parsed service info has packageNames = Instagram + Lite, `FLAG_REPORT_VIEW_IDS`, only the three event types, and `isAccessibilityTool=false`. The app has **no INTERNET permission**. |
| `OnboardingInstrumentedTest` | Fresh install shows onboarding. State survives activity recreation (rotation). |
| `BlockActivityInstrumentedTest` | Block screen renders, survives recreation, renders in system dark mode, opens the override flow. |

These compile in CI (`assembleDebugAndroidTest`) but were **not executed** during
development, because no emulator was available.

## Manual: on a real phone with Instagram (required before relying on the app)

Record the Instagram version and results in `DetectionRules.testedInstagramVersions`.

| # | Steps | Expected |
|---|---|---|
| M1 | Enable service, open Diagnostics | Running now: yes |
| M2 | Instagram → home, DMs, a chat, a profile, Stories | Never blocked. Diagnostics shows HOME / DM_INBOX / DM_THREAD / PROFILE / STORIES |
| M3 | Tap Reels tab | Back is pressed, block screen "Reels feed is blocked". Diagnostics: REELS_TAB |
| M4 | In a chat, tap a Reel a friend sent | Plays. Diagnostics: DM_REEL |
| M5 | From M4, swipe up twice (Friend) | 2nd Reel plays, 3rd → "That's the end of what was shared" |
| M6 | Open a Reel from an Instagram notification | Plays (SHARED_REEL). Swipe → blocked |
| M7 | Share a Reel link into WhatsApp, tap it | Same as M6 |
| M8 | Explore → tap a Reel → swipe | Single Reel plays, swipe blocked. Strict: Explore itself blocked |
| M9 | Open comments on an allowed Reel and scroll them | **Not** counted as a swipe |
| M10 | Time limit 5 min: browse the tab | Allowed. Blocked at 5:00. Home ring shows 5 min / 0 remaining |
| M11 | Cooldown 5/10: browse 5 min | Break starts. Messages work. Reels are back after 10 min |
| M12 | Override from block screen | Countdown + reason. Pauses. Next override unavailable for 60 min |
| M13 | Set clock +1 day during a cooldown | Cooldown continues. Usage not reset |
| M14 | Reboot | Protection resumes after unlock, without opening ReelGuard |
| M15 | Disable service in Settings | Notification "Reels protection stopped". Home shows OFF |
| M16 | Split screen Instagram + other app, go to Reels | Block screen appears. Back not pressed in the other app |
| M17 | Rotate, dark mode, large font (200%), TalkBack on block screen | Layout OK, all buttons reachable and announced |
| M18 | Battery: 1 h normal phone use with Instagram idle | ReelGuard not in the top battery consumers |
| M19 | Instagram Lite installed | Blocked with "This Instagram app is blocked" |
| M20 | "Blocked by mistake" → Diagnostics → Share | Text contains only reasons, screen types, versions |

## Performance checks (manual, developer)

* `adb shell dumpsys gfxinfo com.instagram.android` during Reels, with ReelGuard on and off.
  Expect no jank difference.
* Systrace / Perfetto with the `am` and `view` tags: classification should take under 5 ms
  per call on a mid-range device (about 20 in-process id lookups).
