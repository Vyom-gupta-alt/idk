# ReelGuard

**Instagram for talking to friends, without the endless Reels scrolling.**

ReelGuard is an Android app that blocks or limits Instagram's Reels feed. It still lets you
message people and watch the Reels your friends send you. It runs entirely on your phone:
no account, no server, no analytics, and no `INTERNET` permission at all.

> ⚠️ ReelGuard recognises Instagram's screens through internal element ids that Instagram
> can change in any update. The built-in ids are best-known values and **have not yet been
> verified against a live Instagram build**. After installing, follow
> [Verify detection on your phone](#verify-detection-on-your-phone).

## What it does

| You do this | ReelGuard (Friend mode, the default) |
|---|---|
| Open Instagram, read and send messages | Nothing. Never interferes. |
| Tap a Reel a friend sent in a DM | Plays. You may swipe to one more. |
| Keep swiping from that Reel into recommendations | Steps in: presses Back and shows its block screen |
| Tap the **Reels** tab | Steps in |
| Open a Reel from a notification or from a link in another app | Plays as a single Reel |
| Open a single Reel from a profile, Stories or the home feed | Plays. Swiping on is blocked. |
| Use Instagram Lite | Blocked (its screens can't be told apart) |

Modes: **Strict**, **Friend**, **Time limit** (5–30 min of feed per day), **Cooldown** (a break
after X continuous minutes), and **Custom** (every knob). A temporary override exists, with
deliberate friction: a countdown, an optional reason (never stored), a cooldown between
overrides, and a daily cap.

How detection works, and why it can't be perfect: [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md).

## Project layout

```
reelguard/
├── app/src/main/java/com/reelguard/app/
│   ├── domain/          Pure Kotlin: policies, usage, sessions, decisions, overrides, GuardEngine
│   ├── detection/       Rules (JSON-replaceable) + deterministic InstagramStateDetector
│   ├── accessibility/   The AccessibilityService and content-free node adapters
│   ├── blocking/        Block screen activity, copy, "protection stopped" notification
│   ├── data/            DataStore repositories (settings, usage, rules)
│   ├── diagnostics/     In-memory diagnostics bus (never persisted)
│   ├── permissions/     Accessibility status, restricted-settings hint, installed-app info
│   └── ui/              Compose screens: onboarding, home, settings, diagnostics, privacy
├── app/src/test/        130 JVM tests (domain, detector on mock trees, engine scenarios,
│                        DataStore persistence, Robolectric Compose UI tests)
├── app/src/androidTest/ Instrumented tests (service declaration, onboarding, block screen)
└── docs/                Feasibility, architecture, privacy, anti-bypass, test plan, troubleshooting
```

## Build

Requirements: **JDK 17 or newer** and the **Android SDK** with platform 36. Android Studio
(Narwhal or newer) installs both. Or use the command line:

```bash
cd reelguard
# If not using Android Studio, point Gradle at your SDK:
echo "sdk.dir=$HOME/Android/Sdk" > local.properties

./gradlew testDebugUnitTest      # all JVM + Robolectric tests
./gradlew lintDebug              # Android lint
./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
```

The debug build installs as **ReelGuard** with the application id `com.reelguard.app.debug`,
so it can sit next to a release build.

### Get an APK without building locally

Each push that touches `reelguard/` runs the GitHub Actions workflow
`.github/workflows/reelguard-android.yml`. It runs the tests and lint, then uploads
`reelguard-debug-apk` as a build artifact. You can download it from the workflow run page.

### Signed release APK / AAB

1. Create a keystore once (keep it safe and never commit it):
   ```bash
   keytool -genkeypair -v -keystore reelguard-release.jks -alias reelguard \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Create `reelguard/keystore.properties` (git-ignored):
   ```properties
   storeFile=../reelguard-release.jks
   storePassword=…
   keyAlias=reelguard
   keyPassword=…
   ```
3. Build:
   ```bash
   ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
   ./gradlew bundleRelease     # → app/build/outputs/bundle/release/app-release.aab (Play Store)
   ```
   Without `keystore.properties` you get `app-release-unsigned.apk`, which Android will not
   install. Use the debug APK for personal use, or sign the release.

## Install on your phone

1. Copy the APK to the phone and open it, or run `adb install app-debug.apk`. Allow
   "install unknown apps" for the app you open it with, if asked.
2. Open ReelGuard and follow the setup. On **Android 13+**, sideloaded apps can't turn on
   accessibility until you allow it: **Settings → Apps → ReelGuard → ⋮ → Allow restricted
   settings**. The setup screen has a button for this. See
   [Troubleshooting](docs/TROUBLESHOOTING.md#the-accessibility-switch-is-greyed-out).
3. Turn on **Settings → Accessibility → ReelGuard Reels protection**.

## Verify detection on your phone

1. ReelGuard → **Diagnostics**. Check "Running now: yes".
2. Open Instagram, go to the Reels tab, then come back. "Recent detections" should show
   `REELS_TAB` with `block:reels_feed`.
3. If you see `UNKNOWN`/`OTHER` instead, Instagram's ids differ from the defaults:
   - Turn on **View-id inspector**, then open Instagram in split screen next to ReelGuard
     (or switch back and forth).
   - Find the ids for the Reels tab and viewer (Instagram calls Reels `clips_*`).
   - Paste corrected rules under **Advanced: detection rules (JSON)** and save.
   - Please send the working ids upstream so the defaults can be updated, and add your
     Instagram version to `testedInstagramVersions`.

## What runs in the background

Only the accessibility service, which Android binds while it's enabled. There is no
foreground service, no polling loop, no alarms, no network and no wake locks. It reacts to
Instagram's own UI events. Its single timer, a 5-second heartbeat, runs only while Reels
time is being counted, and stops when you leave Reels or the screen turns off.

## Privacy

See [`docs/PRIVACY.md`](docs/PRIVACY.md). In short: the service only receives events from
Instagram (enforced by Android). It reads element ids and selection state, never text. It
stores daily totals only, and has no way to send anything anywhere.

## Documentation

- [Feasibility analysis](docs/FEASIBILITY.md): what's possible, what isn't, Play policy, SDK choices
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy](docs/PRIVACY.md)
- [Anti-bypass design](docs/ANTI_BYPASS.md)
- [Test plan](docs/TEST_PLAN.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Project specification & status](docs/PROJECT_SPEC.md)
