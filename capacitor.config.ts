import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// NEVER commit ios/App/App/capacitor.config.json or android/app/google-services.json
// to git — they are generated artefacts (produced by cap sync) and may contain debug
// or staging configuration.
// The domain the shell loads. Same switch as src/lib/config/domain.ts; read at
// `cap sync` time, so a domain move needs a new store build. allowNavigation
// lists BOTH the current and the planned domain so a build keeps working
// across the outrun.co.il → appout.co.il move (in either direction).
const APP_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || 'outrun.co.il').trim().toLowerCase();
const KNOWN_APP_DOMAINS = ['outrun.co.il', 'appout.co.il'];

const config: CapacitorConfig = {
  appId: 'il.co.oversight.out',
  appName: 'OUT',
  webDir: 'capacitor-shell', 
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    url: `https://${APP_DOMAIN}`,
    allowNavigation: [APP_DOMAIN, ...KNOWN_APP_DOMAINS.filter((d) => d !== APP_DOMAIN)].flatMap((d) => [d, `*.${d}`]),
    cleartext: false,
  },

  ios: {
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
    // Capacitor only defaults WKWebView.isInspectable to true in #if DEBUG
    // native builds. Off for App Store builds; set
    // CAP_WEB_DEBUG=1 at `cap sync` time for an inspectable TestFlight build.
    webContentsDebuggingEnabled: process.env.CAP_WEB_DEBUG === '1',
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
      // Same value as before ('body'); the enum is needed now that the app
      // imports @capacitor/keyboard (its typings augment PluginsConfig).
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;