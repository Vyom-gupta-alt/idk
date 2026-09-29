# Troubleshooting

## The accessibility switch is greyed out

Android 13+ blocks accessibility for apps installed outside an app store ("restricted
settings"). This is a security feature, not a ReelGuard bug.

1. Try to enable ReelGuard in Settings → Accessibility once (you'll see a "Restricted
   setting" dialog).
2. Settings → Apps → ReelGuard → **⋮** (top right) → **Allow restricted settings** →
   confirm with your PIN.
3. Go back to Settings → Accessibility → ReelGuard Reels protection → turn it on.

The menu item only appears after step 1 on some devices. Android 15+ may use slightly
different wording.

## "Advanced Protection" is on (Android 16+)

Advanced Protection Mode disables accessibility services for apps that are not declared as
accessibility tools. ReelGuard truthfully declares that it isn't one, so it cannot run while
Advanced Protection is on.

## Home screen says "Protection: starting…" or the service keeps stopping

Some manufacturers kill background services aggressively:

* **Samsung:** Settings → Battery → Background usage limits → remove ReelGuard from
  "Sleeping apps". Set App info → Battery to "Unrestricted".
* **Xiaomi / Redmi / POCO (MIUI/HyperOS):** App info → Autostart **on**. Battery saver →
  **No restrictions**. Lock ReelGuard in Recents.
* **Huawei / Honor:** Battery → App launch → ReelGuard → Manage manually → all on.
* **OnePlus / Oppo / Realme:** Battery → Battery optimisation → ReelGuard → Don't optimise.
  Also allow "Auto launch".

More: <https://dontkillmyapp.com>. After changing, toggle the accessibility service off
and on once.

## Reels aren't blocked at all

1. Diagnostics → "Running now" must be **yes**.
2. Open the Reels tab, then check Diagnostics → Recent detections.
   * **Nothing listed:** the service gets no events. Re-toggle it in Accessibility settings.
     Make sure you're using the official app `com.instagram.android`.
   * **`UNKNOWN` / `OTHER`:** Instagram changed its view ids. Use the **View-id inspector**
     (see README "Verify detection") and update the rules JSON. A warning appears
     automatically after 12 unclassified screens.
   * **`REELS_TAB` but `allow`:** check the mode (Time-limit/Cooldown allow browsing) and
     whether an override is active.

## A Reel a friend sent me was blocked

* Diagnostics → the recent entry shows `REEL_VIEWER`. The live section shows the session
  origin. If it says `UNKNOWN` or `HOME_FEED` instead of `DM`, the DM screen ids didn't
  match: inspect them in a chat and update `dm_thread` / `dm_inbox` in the rules.
* In **Strict** mode only the exact Reel is allowed. Use Friend mode for one extra.
* Tap **"This was blocked by mistake"**. It records the case locally so you can share it.

## Scrolling comments on a Reel counts as swiping

The comments list should be ignored because it isn't full-screen and isn't the pager id.
If Instagram shows comments full-screen on your device, add the real pager id (from the
inspector) to `reelsPagerViewIds`. Pager-id matches are trusted, and anything else must
be full-height.

## The block screen appears but the video keeps playing

Back didn't leave the Reels screen (e.g. split screen with another app focused). A second
detection within 6 s uses Home instead. In split screen, Back is intentionally not
pressed, so it doesn't act on the other app. Close the split or leave Instagram.

## Build problems

* `SDK location not found`: create `reelguard/local.properties` with
  `sdk.dir=/path/to/Android/Sdk`, or set `ANDROID_HOME`.
* `Unsupported class file major version`: use JDK 17 or newer (`java -version`).
* Gradle can't download dependencies (HTTP 429/403): Maven Central is rate-limiting. Wait
  and retry, or configure a proxy/mirror in `~/.gradle/init.gradle`.
* `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: a build signed with a different key is installed.
  Uninstall it first. This deletes its data.

## Resetting

Settings → Your data → **Delete all data and reset**, or Android → Apps → ReelGuard →
Storage → Clear storage. The accessibility service stays enabled, with protective defaults.
