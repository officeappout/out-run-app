/**
 * Force update — pure logic (no Firebase / Capacitor imports, unit-tested).
 */
import { APP_STORE_URLS } from '@/lib/config/app-urls';
import type { AppPlatform, AppVersionConfig, PlatformVersionRule } from './app-version.types';

export const DEFAULT_APP_VERSION_CONFIG: AppVersionConfig = {
  enabled: false,
  ios: { minBuild: 0, storeUrl: APP_STORE_URLS.ios },
  android: { minBuild: 0, storeUrl: APP_STORE_URLS.android },
  title: 'יצאה גרסה חדשה של OUT',
  message: 'כדי להמשיך להשתמש באפליקציה, צריך לעדכן לגרסה האחרונה. זה לוקח רק רגע.',
  buttonLabel: 'לעדכון בחנות',
};

function toBuild(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toText(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function toRule(raw: unknown, fallback: PlatformVersionRule): PlatformVersionRule {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const url = toText(r.storeUrl, fallback.storeUrl);
  return {
    minBuild: toBuild(r.minBuild),
    storeUrl: /^https:\/\//.test(url) ? url : fallback.storeUrl,
  };
}

/** Firestore doc data (anything) → a safe, complete config. Missing/garbage → defaults (never blocks). */
export function parseAppVersionConfig(raw: unknown): AppVersionConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_APP_VERSION_CONFIG;
  const d = raw as Record<string, unknown>;
  const def = DEFAULT_APP_VERSION_CONFIG;
  return {
    enabled: d.enabled === true,
    ios: toRule(d.ios, def.ios),
    android: toRule(d.android, def.android),
    title: toText(d.title, def.title),
    message: toText(d.message, def.message),
    buttonLabel: toText(d.buttonLabel, def.buttonLabel),
  };
}

/**
 * Should this install be blocked? Fails OPEN: an unknown platform or an
 * unreadable build number never blocks (a bad config must not lock everyone out).
 */
export function needsForceUpdate(
  platform: string | null | undefined,
  build: unknown,
  config: AppVersionConfig,
): boolean {
  if (!config.enabled) return false;
  if (platform !== 'ios' && platform !== 'android') return false;
  const current = toBuild(build);
  if (current === 0) return false;
  const rule = config[platform as AppPlatform];
  return rule.minBuild > 0 && current < rule.minBuild;
}
