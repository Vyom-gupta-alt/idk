# Architecture

A single Gradle module with clear package boundaries. The logic that matters (policies,
sessions, decisions, time) is **pure Kotlin with no Android imports**, so it is fully
unit-tested on the JVM. Android-specific code is kept thin.

```
                 ┌────────────────────── Android OS ───────────────────────┐
 Instagram UI ──►│ AccessibilityManager (filters: packageNames = Instagram) │
                 └───────────────┬─────────────────────────────────────────┘
                                 │ WINDOW_STATE / CONTENT (throttled) / SCROLLED
                ┌────────────────▼────────────────┐
                │ ReelGuardAccessibilityService   │  accessibility/
                │  • package check (defense 2)    │
                │  • AndroidNodeQuery: view ids   │──► SignalExtractor ─► RuleBasedInstagramStateDetector
                │  • ScrollSample (indices/deltas)│        (detection/, rules = JSON)      │ DetectionResult
                └───────┬───────────────▲─────────┘                                         │
                        │ Sink          │ settings / usage / rules flows                    ▼
                ┌───────▼───────────────┴─────────────────────────────────────────────────────┐
                │ GuardEngine (domain/)                                                       │
                │   ReelSessionTracker ─ origin (DM / external / profile / tab …) + SwipeCounter│
                │   UsageMeter + ContinuousBrowsingTracker ─ time attribution, cooldowns       │
                │   BlockDecisionEngine(Policy from PolicyResolver) ─ Allow / Block(reason)    │
                └───────┬──────────────────────┬──────────────────────┬───────────────────────┘
                        │ block(request)        │ persist(delta)       │ status(live)
                ┌───────▼────────┐    ┌─────────▼────────┐   ┌─────────▼─────────┐
                │ BACK/HOME +    │    │ UsageRepository  │   │ DiagnosticsBus    │
                │ BlockActivity  │    │ (DataStore JSON) │   │ (memory only)     │
                └────────────────┘    └─────────▲────────┘   └─────────▲─────────┘
                                                │                      │
                                      ┌─────────┴──────────────────────┴────┐
                                      │ MainActivity (Compose) + ViewModel  │
                                      └─────────────────────────────────────┘
```

## Packages

| Package | Responsibility | Android? |
|---|---|---|
| `domain` | `UserSettings`, `Policy`/`PolicyResolver`, `TrustedTime`/`Deadline`, `UsageState`/`UsageLogic`/`UsageMeter`, `ReelSessionTracker`/`SwipeCounter`, `BlockDecisionEngine`, `OverrideManager`, `GuardEngine` | No |
| `detection` | `DetectionRules` (+ JSON validation), `NodeView`/`NodeQuery` (content-free), `SignalExtractor`, `InstagramStateDetector` | No |
| `accessibility` | The service, platform node adapters, view-id inspector | Yes |
| `blocking` | `BlockActivity`, stateless `BlockScreen`, `BlockCopyFactory`, `ProtectionNotifier` | Yes |
| `data` | `SettingsRepository`, `UsageRepository`, `RulesRepository` over one Preferences DataStore | Yes (DataStore) |
| `diagnostics` | `DiagnosticsBus`: in-process `StateFlow`s, never persisted | No |
| `permissions` | Accessibility enabled check, restricted-settings hint, installed Instagram version | Yes |
| `ui` | Compose Material 3 screens, theme, shared components (friction gate, usage ring) | Yes |

## Key design decisions

1. **Detector input is signals, not nodes.** `SignalExtractor` asks Instagram only for the
   ~20 view ids named in the rules (`findAccessibilityNodeInfosByViewId`, which searches
   inside Instagram's process). The detector sees only `{present, selected}` sets of logical
   keys. Because of this: (a) the detector is testable with mock trees, (b) rules can be
   swapped at runtime, (c) there is no code path that reads text.
2. **Swipe counting is the backstop.** Origin tracking can be fooled, and Instagram can
   rename the Reels tab id. The swipe allowance still limits feed browsing to at most one
   extra Reel. See FEASIBILITY §3.
3. **Two clocks.** Durations and deadlines use `elapsedRealtime` plus the boot count, so
   wall-clock changes don't affect them. Day rollover is cross-checked against the monotonic
   clock within a boot, and never rolls backwards.
4. **Deltas, not snapshots.** The service persists *increments*
   (`UsageDelta`) through atomic `DataStore.edit` transforms. The UI can grant overrides at
   the same time without the two writers overwriting each other.
5. **Block = Back + our own Activity.** Starting activities from an AccessibilityService is
   an explicit Android background-launch exemption, so no `SYSTEM_ALERT_WINDOW` is needed.
   The block screen runs in its own task, excluded from Recents. If the Reels screen is
   still showing within 6 s of a block, the next block uses Home instead of Back.
6. **No DI framework, no Room, no navigation library.** The app has 3 small documents and 6
   screens. A manual `AppContainer`, DataStore, and a saveable back stack are enough.

## Threading

`onAccessibilityEvent` and all `GuardEngine` calls run on the main thread, so the engine
needs no locks. Tree queries are IPC calls into Instagram's process, bounded to about 20
id lookups and throttled to at most one classification per 300 ms. DataStore writes run
on `AppContainer.appScope` (`Dispatchers.Default`).

## Extending detection

To support a new Instagram screen, add a key to `SignalKeys`, add default ids in
`DetectionRules.DEFAULT`, add a rule branch in `RuleBasedInstagramStateDetector`, and add
a mock tree in `IgScreens` plus a test. Users can already change the ids without an update
through Diagnostics → Advanced.
