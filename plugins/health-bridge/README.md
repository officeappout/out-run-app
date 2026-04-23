# health-bridge (Capacitor 6 plugin)

Out Run's bridge to Apple HealthKit (iOS) and Android Health Connect.

The TypeScript surface lives in `src/definitions.ts`; native implementations
in `ios/Plugin/HealthBridgePlugin.swift` and
`android/src/main/java/co/il/appout/healthbridge/HealthBridgePlugin.kt`.

This plugin is consumed by the host app via `file:./plugins/health-bridge`
in the root `package.json`. After running `npm install` once at the repo
root, `npx cap sync` will copy the iOS/Android sources into the platform
projects.

## Native Manifest Templates

When you add the native platforms with `npx cap add ios` / `npx cap add android`,
Capacitor generates `ios/App/App/Info.plist` and `android/app/src/main/AndroidManifest.xml`.
You must apply the additions below **before** archiving the app, otherwise
Apple/Google will reject the upload (or the OS will silently deny permissions).

### iOS — `ios/App/App/Info.plist`

```xml
<key>NSHealthShareUsageDescription</key>
<string>Out Run reads your steps, active calories and exercise minutes to update your daily Activity Rings and award Global XP for the Lemur rank.</string>

<key>NSHealthUpdateUsageDescription</key>
<string>Out Run does not write to Apple Health.</string>

<!-- Background delivery for HKObserverQuery -->
<key>UIBackgroundModes</key>
<array>
    <string>processing</string>
    <string>fetch</string>
</array>

<!-- Allow loading the production hostname over HTTPS only -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

You must also enable two Capabilities in Xcode (Signing & Capabilities tab):

1. **HealthKit** — required for HKHealthStore.
2. **Background Modes → Background fetch + Background processing** —
   required for `enableBackgroundDelivery`.

### Android — `android/app/src/main/AndroidManifest.xml`

Add inside the top-level `<manifest>`:

```xml
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED" />
<uses-permission android:name="android.permission.health.READ_EXERCISE" />

<queries>
    <package android:name="com.google.android.apps.healthdata" />
</queries>
```

Add inside `<application>` (Health Connect privacy policy intent — required
by Google Play review):

```xml
<activity-alias
    android:name="ViewPermissionUsageActivity"
    android:exported="true"
    android:targetActivity=".MainActivity"
    android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
    <intent-filter>
        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
        <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
    </intent-filter>
</activity-alias>
```

Bump `android/variables.gradle`:

```gradle
ext {
    minSdkVersion = 26     // Health Connect requires API 26+
    compileSdkVersion = 34
    targetSdkVersion = 34
}
```
