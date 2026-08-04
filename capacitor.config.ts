import type { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

// NEVER commit ios/App/App/capacitor.config.json or android/app/google-services.json
// to git — they are generated artefacts (produced by cap sync) and may contain debug
// or staging configuration.

// Domain values — kept in sync BY HAND with src/lib/config/domain-config.ts's
// defaults (this file can't safely import that TS module: the Capacitor CLI's
// own TS loader isn't guaranteed to resolve the project's tsconfig path
// aliases the way Next.js does). Same env var names though, so setting
// NEXT_PUBLIC_ROOT_DOMAIN/NEXT_PUBLIC_APP_URL once affects both.
// NOTE: this is baked in at `cap sync`/native build time, not read at
// runtime — one place to edit BEFORE a build, not a dynamic flip.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'outrun.co.il';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || `https://${ROOT_DOMAIN}`;

const config: CapacitorConfig = {
  appId: 'co.il.appout.outrun',
  appName: 'Out Run',
  webDir: 'capacitor-shell',
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    url: APP_URL,
    allowNavigation: [ROOT_DOMAIN, `*.${ROOT_DOMAIN}`],
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