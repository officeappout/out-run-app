# Native Phase — Build & QA Runbook (Phases 3-5, Apr 2026)

This is the operator manual for taking the Out Run app from web-only to
TestFlight + Google Play Internal Track. It assumes Phases 0-2 are
already deployed (server-side ingest callable, security rules, outbox,
Activity Rings widget).

> **Audience:** David. Cerser has already written all the code below.
> Your job is to run the commands on a Mac with Xcode + Android Studio
> installed, and to upload the resulting binaries.

---

## 0. One-time prerequisites (Mac)

```bash
# Xcode 15+ from the App Store
xcode-select --install

# Ruby + CocoaPods (Capacitor iOS build needs CocoaPods)
sudo gem install cocoapods

# Android Studio 2024.1+ from https://developer.android.com/studio
#   • Open SDK Manager → install Android SDK 34, Build-Tools 34.0.0
#   • Accept the SDK licenses:
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses

# Install Health Connect on the test device (Play Store):
#   https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata
```

---

## 1. Install JS dependencies

From the repo root:

```bash
npm install
```

This will pick up the new entries in `package.json`:

- `@capacitor/core@^6.2.0`
- `@capacitor/cli@^6.2.0` (devDependency)
- `@capacitor/ios@^6.2.0`
- `@capacitor/android@^6.2.0`
- `@capacitor/app@^6.0.2`
- `@capacitor/preferences@^6.0.3`
- `@capacitor-firebase/authentication@^6.3.0`
- `@capacitor-firebase/app-check@^6.3.0`
- `health-bridge@file:./plugins/health-bridge` — the local plugin we wrote

---

## 2. Add the iOS platform

```bash
npx cap add ios
```

Open the project in Xcode:

```bash
npm run cap:ios     # alias for npx cap open ios
```

In Xcode:

1. **Signing & Capabilities → All Targets → "App"**
   - Set your Team.
   - Set Bundle Identifier to `co.il.appout.outrun` (matches `capacitor.config.ts`).
2. **+ Capability → HealthKit** (required for HKHealthStore).
3. **+ Capability → Background Modes** → check "Background fetch" and "Background processing".
4. Open `ios/App/App/Info.plist` and apply the snippets in
   `plugins/health-bridge/README.md` (Health usage descriptions, etc.).
5. **Firebase iOS SDK setup:**
   - Download `GoogleService-Info.plist` from Firebase Console → Project Settings → iOS app.
   - Drag it into Xcode under the `App` target.
   - In Xcode terminal:
     ```bash
     cd ios/App
     pod install
     ```
6. Set deployment target to iOS 14.0 (Project → App → Deployment Info).

Build & run on a real device (HealthKit does not work in the simulator):

```bash
# Or just hit ⌘R in Xcode after selecting your iPhone.
```

---

## 3. Add the Android platform

```bash
npx cap add android
```

Open in Android Studio:

```bash
npm run cap:android     # alias for npx cap open android
```

In Android Studio:

1. Open `android/app/src/main/AndroidManifest.xml` and apply the snippets
   from `plugins/health-bridge/README.md`.
2. Open `android/variables.gradle` and bump:
   ```gradle
   minSdkVersion    = 26
   compileSdkVersion = 34
   targetSdkVersion = 34
   ```
3. **Firebase Android SDK setup:**
   - Download `google-services.json` from Firebase Console → Project Settings → Android app.
   - Place it at `android/app/google-services.json`.
   - In `android/build.gradle`, ensure the Google Services plugin
     classpath is present:
     ```gradle
     dependencies {
       classpath 'com.google.gms:google-services:4.4.2'
     }
     ```
   - In `android/app/build.gradle`, add at the very bottom:
     ```gradle
     apply plugin: 'com.google.gms.google-services'
     ```
4. Sync Gradle (Android Studio → File → Sync Project with Gradle Files).
5. Build & run on a real device with Health Connect installed.

---

## 4. Sync after every code change

The Next.js app is loaded over HTTPS from `https://app.appout.co.il`
(see `capacitor.config.ts`), so most code changes do **not** require
recompiling the native shell — they just need to ship to Vercel.

Native shell needs a rebuild only when:

- You edit `capacitor.config.ts`.
- You edit anything under `plugins/health-bridge/`.
- You edit `Info.plist` or `AndroidManifest.xml`.

After such changes:

```bash
npx cap sync                # copies plugin sources into ios/ + android/
npm run cap:ios             # → re-archive in Xcode
npm run cap:android         # → rebuild APK in Android Studio
```

---

## 5. Local development against your dev server

If you want the native shell to load `http://192.168.1.x:3000` instead
of production:

```bash
# In one terminal:
npm run dev

# In another (read your laptop's LAN IP from System Settings):
CAP_SERVER_URL=http://192.168.1.42:3000 npx cap sync
npm run cap:ios     # iPhone must be on the same Wi-Fi network
```

Don't ship a production build with `CAP_SERVER_URL` pointing at your
laptop. The capacitor config falls back to `https://app.appout.co.il`
when the env var is unset.

---

## 6. Device QA Checklist

Before pushing to TestFlight / Internal Track, verify on a real device:

### iOS / iPhone with Apple Watch

- [ ] App launches, lands on home screen, Activity Rings widget shows
      Firestore data.
- [ ] Settings → Profile → "Connect Health" → iOS prompts for
      HealthKit access. Grant all 3 categories.
- [ ] Walk 50 steps with the phone in your pocket. Within 30s the
      Activity Rings widget shows the steps **animated** without
      needing a manual refresh ("Live Sync" pill flashes).
- [ ] Background the app, walk 200 more steps, foreground the app.
      Steps are added to the rings within ~5 seconds.
- [ ] In Firebase Console → Firestore → `dailyActivity/<uid>_<date>`,
      verify `passiveSteps`, `passiveCalories`, `categories.cardio.minutes`
      have all incremented.
- [ ] Verify `users/<uid>.globalXP` increased by `floor(steps/100) +
      activeMinutes*2` (capped at +200/day).
- [ ] Verify `users/<uid>.coins` did NOT change.
- [ ] Run a manual GPS workout. XP **and coins** both increase, on top
      of the passive XP.
- [ ] Toggle airplane mode, walk, then re-enable Wi-Fi. The OfflineBanner
      shows "Syncing N items"; the count drains to 0.

### Android / Pixel with Health Connect

- [ ] Same as above, but with Health Connect prompts.
- [ ] Verify the periodic worker fires: `adb shell dumpsys jobscheduler
      | grep outrun-healthbridge-poll` should list the unique work.
- [ ] Verify the WebView loads `https://app.appout.co.il` (Chrome
      DevTools → `chrome://inspect` → inspect WebView).

### App Check verification (both platforms)

- [ ] In Firebase Console → App Check → Apps, confirm both iOS and
      Android apps appear with "Verified" tokens within 5 minutes of
      device launch.
- [ ] Try invoking `awardWorkoutXP` from a non-attested HTTP client
      (e.g. `curl`) — should return `failed-precondition`.

### Security rules sanity

- [ ] In Firestore Rules Playground, attempt to write
      `dailyActivity/.../passiveSteps = 99999999` as the owner uid.
      Should be denied by `noPassiveActivityFieldsChanged()`.

---

## 7. Shipping to TestFlight / Internal Track

### iOS

1. In Xcode: Product → Archive.
2. In the Organizer window: Distribute App → App Store Connect → Upload.
3. Wait for App Store Connect to finish processing (~10 min).
4. App Store Connect → TestFlight → add internal testers → submit
   for external review if needed.

### Android

1. In Android Studio: Build → Generate Signed Bundle (`.aab`).
2. Use your existing upload key (or generate one and store in 1Password).
3. Google Play Console → Internal testing → Create new release →
   upload the `.aab`.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Activity Rings stay at 0 even after walking | HealthKit/Health Connect permission not granted | Settings → Privacy → Health → Out Run → enable all |
| `ingestHealthSamples` returns `failed-precondition` | App Check token rejected | Confirm DeviceCheck/Play Integrity providers configured in Firebase Console |
| Native shell loads white screen | `server.url` unreachable | Check `capacitor.config.ts`, redeploy Vercel, or set `CAP_SERVER_URL` for dev |
| Background sync never fires (Android) | Battery optimisation killing WorkManager | On the test device: Settings → Apps → Out Run → Battery → Unrestricted |
| `pod install` fails | CocoaPods stale repo | `pod repo update && pod install` |
| `npx cap add ios` fails with "no webDir" | Missing `capacitor-shell/index.html` | Already committed; run `git status` to confirm |

---

## 9. Where things live (quick reference)

| Concern | File |
|---------|------|
| Capacitor config | `capacitor.config.ts` |
| Native bootstrap | `src/lib/native/init.ts` |
| Native App Check | `src/lib/firebase.ts` (CustomProvider branch) |
| HealthBridge plugin (TS) | `plugins/health-bridge/src/` |
| HealthBridge plugin (Swift) | `plugins/health-bridge/ios/Plugin/HealthBridgePlugin.swift` |
| HealthBridge plugin (Kotlin) | `plugins/health-bridge/android/.../HealthBridgePlugin.kt` |
| Web orchestration | `src/lib/healthBridge/init.ts` |
| Live UI overlay | `src/features/activity/hooks/useLiveDailyActivity.ts` |
| Home widget | `src/features/home/components/widgets/ActivityRingsWidget.tsx` |
| Outbox (IndexedDB) | `src/lib/outbox/outbox-db.ts` |
| Outbox flusher | `src/lib/outbox/OutboxFlusher.ts` |
| Server ingest callable | `functions/src/ingestHealthSamples.ts` |
| Passive XP rules | `functions/src/services/passive-xp.ts` |
| Progression service | `functions/src/services/progression.service.ts` |
| Firestore rules | `firestore.rules` |
