import type { CapacitorConfig } from '@capacitor/cli';

// APP_CHECK_DEBUG controls the App Check provider for BOTH platforms.
//
// Development usage:
//   APP_CHECK_DEBUG=true npm run cap:sync          → debug provider on both iOS + Android
//   npm run cap:sync                               → production providers (deviceCheck / playIntegrity)
//
// NEVER commit ios/App/App/capacitor.config.json or android/app/google-services.json
// after a debug sync — always run the production sync to restore before committing.
//
// The flag resolves to `false` in every CI / release pipeline that does not
// explicitly export APP_CHECK_DEBUG=true, so production builds are always safe.
const appCheckDebug = process.env.APP_CHECK_DEBUG === 'true';

// STAGING_URL overrides the production server URL for staging test builds.
// Usage: npm run cap:sync:ios:staging  (sets STAGING_URL=https://staging.outrun.co.il)
// Must be absent (or empty) in all production / CI builds — never commit a sync
// artefact generated with STAGING_URL set.
const serverUrl = process.env.STAGING_URL ?? 'https://outrun.co.il';

const config: CapacitorConfig = {
  appId: 'co.il.appout.outrun',
  appName: 'Out Run',
  webDir: 'capacitor-shell',
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    url: serverUrl,
    allowNavigation: ['outrun.co.il', '*.outrun.co.il'],
    cleartext: false,
  },

  ios: {
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
  },

  android: {
    backgroundColor: '#FFFFFF',
    allowMixedContent: false,
  },

  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['apple.com', 'google.com'],
    },
    FirebaseAppCheck: {
      providerIOS: appCheckDebug ? 'debug' : 'deviceCheck',
      providerAndroid: appCheckDebug ? 'debug' : 'playIntegrity',
      isTokenAutoRefreshEnabled: true,
    },
    // Push notifications (Sprint 3, Phase 4).
    // `presentationOptions` controls how iOS shows incoming pushes
    // when the app is in the FOREGROUND. Without this, iOS swallows
    // the banner silently. Android ignores this block.
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Keyboard resize: 'body' shrinks the WebView body when the software
    // keyboard opens, preventing it from overlapping fixed-position CTAs
    // (chat inputs, onboarding Continue buttons, auth submit, etc.).
    // 'body' is the safest cross-platform choice; the alternative 'native'
    // may cause flicker on older Android WebViews.
    Keyboard: {
      resize: 'body' as const,
      resizeOnFullScreen: true,
    },
  },
};

export default config;