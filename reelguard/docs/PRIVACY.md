# Privacy

**Summary:** ReelGuard only processes Instagram's screen *structure*, never its content.
It stores daily totals on the device, and has no ability to send data anywhere.

## Enforcement, layer by layer

| Layer | Mechanism | Where |
|---|---|---|
| OS package filter | `android:packageNames` in the service config (plus `setServiceInfo` for user-added apps). Android does not deliver events from other apps. | `res/xml/accessibility_service_config.xml`, `ReelGuardAccessibilityService.applyPackageFilter` |
| In-code package check | Events whose package isn't monitored are dropped first. | `ReelGuardAccessibilityService.onAccessibilityEvent` |
| No text access | Detection goes through `NodeView`, which has **no text or content-description property**. The service never calls `getText()`, `getContentDescription()` or `event.getText()`. | `detection/InstagramStateDetector.kt`, `accessibility/AndroidNodes.kt` |
| No network | The manifest has no `INTERNET` permission, so the app physically cannot open sockets. An instrumented test asserts this. | `AndroidManifest.xml`, `ServiceDeclarationTest` |
| No backup | `allowBackup=false` and data-extraction rules exclude everything. | Manifest, `res/xml/data_extraction_rules.xml` |
| No third-party SDKs | Only AndroidX, Compose, and kotlinx. No ads, analytics, or crash reporting. | `gradle/libs.versions.toml` |

## Data inventory

| Data | Where | Retention | Leaves device? |
|---|---|---|---|
| Settings (`UserSettings` JSON) | DataStore | Until changed or deleted | No |
| Daily totals: browsing ms, shared-Reel ms, blocks, overrides used | DataStore | Today + 14 days | No |
| Cooldown / override deadlines | DataStore | Until expired or overwritten | No |
| "Blocked by mistake" reports (reason, screen type, origin type, count, rules version, time) | DataStore | Max 20, deletable | Only if *you* tap Share and pick an app |
| Custom detection rules | DataStore | Until reset | No |
| Live detection status, last 40 detections | Memory | Process lifetime | No |
| View-id inspector output (ids only) | Memory | While the Diagnostics page is open and the toggle is on | No |
| Override reason text | Compose state | While the screen is open | No (never stored) |

**Not collected:** message contents, captions, comments, usernames, images or video,
screenshots, keystrokes, passwords, contacts, location, advertising ID, other apps' usage.

## Honest caveats

* Android's accessibility API hands the service `AccessibilityNodeInfo` / `AccessibilityEvent`
  objects, and those *can* contain text. ReelGuard's code never reads those fields. You can
  verify this: search the source for `text`, `contentDescription` and `getText`.
* While a Reels session is timed, the heartbeat reads the **package name** of the active
  window (for example `com.whatsapp`) to notice that you left Instagram. It reads nothing
  else from that window, and does not store the package name.
* View-id names (like `clips_tab`) describe Instagram's UI, not you. The inspector shows
  them for rule maintenance. It is off by default and memory-only.

## Deleting data

* ReelGuard → Settings → **Delete all data and reset**. This removes settings, usage,
  reports and custom rules.
* Or Android → Apps → ReelGuard → Storage → **Clear storage**.
* Uninstalling removes everything.

## Google Play Data safety (if published)

"No data collected" and "No data shared". Data processed only on-device and never transmitted
does not count as "collected" under Play's definitions.
