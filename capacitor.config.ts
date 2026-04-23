import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.il.appout.outrun',
  appName: 'Out Run',
  webDir: 'capacitor-shell', 
  bundledWebRuntime: false,

  server: {
    androidScheme: 'https',
    // הכרחנו את הכתובת להיות האתר שלך כדי שזה יעבוד באייפון
    url: 'https://out-run-app.vercel.app', 
    allowNavigation: ['*.vercel.app'],
    cleartext: false,
  },

  ios: {
    contentInset: 'always',
    backgroundColor: '#FFFFFF',
  },

  android: {
    backgroundColor: '#FFFFFF',
    allowMixedContent: false,
  },

  plugins: {
    FirebaseAppCheck: {
      providerIOS: 'deviceCheck',
      providerAndroid: 'playIntegrity',
      isTokenAutoRefreshEnabled: true,
    },
  },
};

export default config;