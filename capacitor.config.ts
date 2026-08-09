import type { CapacitorConfig } from '@capacitor/cli';

// NEVER commit ios/App/App/capacitor.config.json or android/app/google-services.json
// to git — they are generated artefacts (produced by cap sync) and may contain debug
// or staging configuration.
const config: CapacitorConfig = {
  appId: 'co.il.appout.outrun',
  appName: 'Out Run',
  webDir: 'capacitor-shell', 
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    url: 'https://outrun.co.il',
    allowNavigation: ['outrun.co.il', '*.outrun.co.il'],
    cleartext: false,
  },

  ios: {
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
    // Capacitor only defaults WKWebView.isInspectable to true in #if DEBUG
    // native builds (CAPInstanceDescriptor.swift) — a Release/TestFlight
    // archive is not Safari-Web-Inspector-attachable unless this is set
    // explicitly. TestFlight-only distribution to internal testers right
    // now, so enabling it is safe; revisit before any public App Store
    // release.
    webContentsDebuggingEnabled: true,
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
      providerIOS: 'deviceCheck',
      providerAndroid: 'playIntegrity',
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