import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

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
    // Keyboard resize: 'none' (19.10.2026, was 'body'). On iOS 'body' set
    // document.body.style.height only AFTER the keyboard finished animating
    // (+0.2 s) and reset it on hide — a visible layout jump — while never
    // moving position:fixed sheets/composers (they're laid out against the
    // viewport, not <body>), so the keyboard still covered what you typed.
    // The web layer now owns this: src/lib/keyboard/keyboardInsetController.ts
    // publishes --kb-inset from keyboardWillShow/WillHide and the CSS
    // utilities (.kb-fit / .kb-sheet / <main> padding) lift the UI in step
    // with the keyboard. The controller also calls Keyboard.setResizeMode
    // ('none') at runtime, so builds made before this change behave the same;
    // this line takes effect natively after `npx cap sync` + a new build.
    // Android: the WebView itself resizes (adjustResize), unaffected.
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
    },
  },
};

export default config;