/**
 * Force update — `app_config/app_version` (public read, admin write; already
 * covered by the existing `app_config/{docId}` rule).
 *
 * A native build whose build number is below `minBuild` for its platform is
 * blocked behind a full-screen "update to continue" screen. Because the UI is
 * remote-loaded, this ships from the web — every installed shell picks it up
 * on the next launch/resume, no store release needed to turn it on.
 *
 * Build number = iOS CFBundleVersion (CURRENT_PROJECT_VERSION) / Android
 * versionCode — what `App.getInfo().build` returns.
 */

export type AppPlatform = 'ios' | 'android';

export interface PlatformVersionRule {
  /** Builds below this are blocked. 0 = never block. */
  minBuild: number;
  /** Where the update button sends the user. */
  storeUrl: string;
}

export interface AppVersionConfig {
  /** Master switch — off means nobody is ever blocked. */
  enabled: boolean;
  ios: PlatformVersionRule;
  android: PlatformVersionRule;
  title: string;
  message: string;
  buttonLabel: string;
}

export const APP_VERSION_DOC = { collection: 'app_config', id: 'app_version' } as const;
