import type { CapacitorConfig } from '@capacitor/cli';

// Set APP_CHECK_DEBUG=true when running `npm run cap:sync:ios:dev` to enable
// the Firebase App Check debug provider for iOS development builds.
// NEVER commit ios/App/App/capacitor.config.json after running the dev sync —
// run `npm run cap:sync:ios` (without the flag) to restore production config before committing.
const appCheckDebug = process.env.APP_CHECK_DEBUG === 'true';

const config: CapacitorConfig = {
  appId: 'co.il.appout.outrun',
  appName: 'Out Run',
  webDir: 'capacitor-shell', 
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    url: 'https://out-run-app.vercel.app',
    allowNavigation: ['*.vercel.app'],
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
      skipNativeAuth: true,
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