# Project specification (running)

**Goal:** Instagram communication without infinite Reels scrolling. Legitimate,
transparent, local-only, battery-conscious, hard to bypass casually, easy to remove.

## Fixed decisions

| Topic | Decision |
|---|---|
| Mechanism | Package-filtered AccessibilityService + deterministic rule-based detector |
| Blocking | `GLOBAL_ACTION_BACK` (Home on repeat / whole-app blocks) + own full-screen `BlockActivity` |
| Intent vs feed | Reels-tab signal + origin tracking + per-session swipe allowance (backstop) |
| Storage | One Preferences DataStore, JSON documents: settings, usage (daily aggregates), rules |
| Network | None: no INTERNET permission |
| SDK | min 26, target/compile 36, AGP 8.13.2, Kotlin 2.2.21, Compose BOM 2025.12.00 |
| App id | `com.reelguard.app` (`.debug` suffix for debug builds) |
| Modes | Strict, Friend (default), Time limit, Cooldown, Custom → `PolicyResolver` → `Policy` |
| Anti-bypass | Friction (countdown, reason, cooldown, cap, settings lock), trusted time; never prevent removal |

## Stage status

| Stage | Content | Status |
|---|---|---|
| 0 | Feasibility analysis, Play policy, SDK choice (`FEASIBILITY.md`) | ✅ |
| 1 | Gradle project, manifest, service config, domain model | ✅ |
| 2 | Detection engine, GuardEngine, accessibility service, blocking | ✅ |
| 3 | UI: onboarding (prominent disclosure), home, settings, diagnostics, privacy, override flow | ✅ |
| 4 | Tests: 130 JVM/Robolectric tests passing; instrumented tests compiled | ✅ (instrumented not yet run) |
| 5 | Docs: README, architecture, privacy, anti-bypass, test plan, troubleshooting; CI workflow | ✅ |
| 6 | **On-device verification against current Instagram** (manual plan M1–M20) | ⏳ requires a phone |
| 7 | Localisation (strings are English, inline in Compose) | ⏳ |
| 8 | Optional: Quick Settings tile, home-screen widget, rules import via file/QR | 💡 ideas |

## Known limitations / risks

1. Default Instagram view ids are unverified in this environment (no Instagram build). **Highest risk.**
2. Viewer-id breakage fails open (with a Diagnostics warning).
3. `rootInActiveWindow` is assumed to return the active window's root even when that window
   belongs to a non-monitored package (used only for its package name in the heartbeat). If an
   OEM restricts this, the heartbeat treats the foreground as UNKNOWN and stops counting after 60 s.
4. Cloned apps / work profiles are untested.
5. Browser Instagram is out of scope by design.
6. Clock change combined with a reboot can start a new usage day.

## Potential bugs to watch for during device testing

* Instagram may emit `TYPE_VIEW_SCROLLED` for the video progress bar or captions. If
  reels are counted without swiping, restrict counting to `reelsPagerViewIds` only.
* A DM Reel may open with the bottom bar visible and the Reels tab selected on some layouts.
  That would classify as the feed. If seen, require `dm_thread` history over the tab signal.
* `BlockActivity` launch latency on some OEMs (background-start exemptions differ).
