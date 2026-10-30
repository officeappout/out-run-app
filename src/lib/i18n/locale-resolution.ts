/**
 * Which locale the app shows, and what <html lang dir> becomes (PLAN §2.2).
 * Pure; LocaleSync feeds it the flags, the profile, the stored pref and the device.
 */
import { resolveLocale } from './core/i18n-core';
import { dirOf, isLocale, SOURCE_LOCALE, type LegacyStoreLanguage, type Locale } from './locales';

/** The enable_* flags that gate i18n (FeatureFlags keys). */
export interface LocaleFlags {
  enableI18n: boolean;
  enableLocaleEn: boolean;
  enableLocaleRu: boolean;
  enableLocaleDe: boolean;
}

/** onboardingPrefs key holding the user's chosen locale (axioms §19). */
export const LOCALE_PREF_KEY = 'app_locale';

/** Locales the flags allow. Hebrew always; nothing else while enable_i18n is off. */
export function allowedLocales(flags: LocaleFlags): Locale[] {
  if (!flags.enableI18n) return [SOURCE_LOCALE];
  const out: Locale[] = [SOURCE_LOCALE];
  if (flags.enableLocaleEn) out.push('en');
  if (flags.enableLocaleRu) out.push('ru');
  if (flags.enableLocaleDe) out.push('de');
  return out;
}

/**
 * The flags the language setting and LocaleSync both use. A super admin sees English
 * before enable_locale_en is on (so the owner can test), only while enable_i18n is on.
 */
export function effectiveLocaleFlags(flags: LocaleFlags, isSuperAdmin: boolean): LocaleFlags {
  if (!flags.enableI18n || !isSuperAdmin) return flags;
  return { ...flags, enableLocaleEn: true };
}

export interface LocaleSources {
  profileLocale?: unknown;
  storedLocale?: unknown;
  deviceLocales?: readonly string[];
  /** See isNewUserForLocale. false = never auto-detect from the device. */
  detectDevice?: boolean;
}

/** An account younger than this still counts as new for device-language detection. */
export const NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000;

function toMillis(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return null;
}

/** Onboarding states that mean the account has been around (not just created). */
const SETTLED_STATUSES = new Set(['COMPLETED', 'PENDING_LIFESTYLE', 'MAP_ONLY']);

/**
 * "New user" = may be auto-detected from the device language. The ONE client rule:
 *   - no account profile at all (anonymous first launch)             → new
 *   - createdAt within NEW_USER_WINDOW_MS                            → new
 *   - createdAt older                                                → existing, stays Hebrew
 *   - createdAt missing or a pending serverTimestamp (null/sentinel) → new only while onboarding is not
 *     settled (no status, IN_PROGRESS, ONBOARDING); legacy docs with a settled status stay existing
 * Existing users change language only through the picker (core.locale / stored pref).
 * The server never detects: it reads core.locale only, so new users who start in a
 * non-Hebrew locale get it persisted (LocaleSync) and both sides agree.
 */
export function isNewUserForLocale(
  profile: { createdAt?: unknown; onboardingStatus?: unknown } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!profile) return true;
  const created = toMillis(profile.createdAt);
  if (created !== null) return now - created < NEW_USER_WINDOW_MS;
  return !(typeof profile.onboardingStatus === 'string' && SETTLED_STATUSES.has(profile.onboardingStatus));
}

/**
 * Whether the device language may decide right now. While a signed-in user's profile has not arrived
 * (store not hydrated, or an auth user exists but no profile yet) it may NOT: that user could be an
 * existing Hebrew one. Only a truly anonymous first launch (hydrated, no auth user, no profile) or a
 * profile that isNewUserForLocale may use the device.
 */
export function deviceDetectAllowed(input: {
  profile: { createdAt?: unknown; onboardingStatus?: unknown } | null | undefined;
  hydrated: boolean;
  hasAuthUser: boolean;
  /** Firebase has delivered its first auth state (session restore is async). */
  authResolved?: boolean;
  now?: number;
}): boolean {
  if (!input.profile) return input.hydrated && input.authResolved !== false && !input.hasAuthUser;
  return isNewUserForLocale(input.profile, input.now);
}

/** Profile → stored pref → device (new users only) → 'he', among the allowed locales. Flags off → 'he'. */
export function pickAppLocale(flags: LocaleFlags, sources: LocaleSources): Locale {
  const loc = resolveLocale({ i18nEnabled: flags.enableI18n, allowed: allowedLocales(flags), ...sources });
  return isLocale(loc) ? loc : SOURCE_LOCALE;
}

/**
 * <html lang dir>. While i18n is off, or the locale is Hebrew, this is exactly what
 * the old LanguageProvider set (useAppStore's language/direction, which the
 * challenge pages' he/en toggle still drives) — byte-identical for every user today.
 */
export function decideHtmlLangDir(input: {
  i18nEnabled: boolean;
  locale: Locale;
  legacyLanguage: LegacyStoreLanguage;
  legacyDirection: 'rtl' | 'ltr';
  /**
   * The legacy he/en store may drive <html> only on the screens that still own that toggle (the challenge
   * pages). Everywhere else a Hebrew locale is ALWAYS he/rtl: the legacy store is persisted in localStorage,
   * so a stale 'en'/'ltr' left by English testing or a challenge visit must never flip a Hebrew user.
   */
  legacyToggleScreen?: boolean;
}): { lang: string; dir: 'rtl' | 'ltr' } {
  if (!input.i18nEnabled || input.locale === SOURCE_LOCALE) {
    if (input.locale === SOURCE_LOCALE && !input.legacyToggleScreen) return { lang: 'he', dir: 'rtl' };
    return { lang: input.legacyLanguage, dir: input.legacyDirection };
  }
  return { lang: input.locale, dir: dirOf(input.locale) };
}

/**
 * Device languages the AUTOMATIC resolution may use. English that is allowed only through the super-admin
 * override (enable_locale_en still off) is never picked from the device: the owner's Hebrew app must not
 * flip to an empty English catalog on first run — English needs an explicit pick in Settings.
 */
export function deviceLocalesFor(device: readonly string[], realFlags: Pick<LocaleFlags, 'enableLocaleEn'>): string[] {
  return realFlags.enableLocaleEn ? [...device] : device.filter((l) => !/^en(?:[-_]|$)/i.test(l));
}

/** Device languages (navigator.languages; WKWebView reports the iOS language). */
export function deviceLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  return list.filter((x): x is string => typeof x === 'string');
}
