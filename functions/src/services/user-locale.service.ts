/**
 * Which language a server-sent text (push, email, Kelly proactive) should be in,
 * for one user — docs/i18n/PLAN.md §2.2 / §2.6.
 *
 * Source of truth: users/{uid}.core.locale (written by the app when the user
 * picks a language). Same flag gate as the app (src/lib/i18n/locale-resolution.ts):
 *   - enable_i18n off            → always 'he' (today's behaviour, byte-identical)
 *   - enable_locale_<xx> off     → that language is not allowed → 'he'
 *   - missing / unknown / not allowed core.locale → 'he'
 * A missing flag reads as false (fail-closed), like everywhere else.
 *
 * Usage (wave 5 — NOT wired into any sender yet):
 *   const allowed = await getI18nAllowedLocales(db);       // once per run
 *   const locale = await getUserLocale(db, uid, allowed);  // per recipient
 *   // or, when the sender already read the user doc:
 *   const locale = userLocaleFromProfile(userDoc.data(), allowed);
 *
 * Never throws: a failed read is logged and gives 'he'.
 */
import { resolveLocale } from '../shared/i18n-core';
import { isLocale, SOURCE_LOCALE, type Locale } from '../shared/locales';

/** The flag fields (system_config/feature_flags) that gate i18n — same keys as the app's FLAG_DEFS. */
export interface I18nFlagFields {
  enable_i18n?: unknown;
  enable_locale_en?: unknown;
  enable_locale_ru?: unknown;
  enable_locale_de?: unknown;
}

/** Locales the flags allow. Hebrew always; nothing else while enable_i18n is off. Only `true` counts. */
export function allowedLocalesFromFlags(flags: I18nFlagFields | null | undefined): Locale[] {
  if (flags?.enable_i18n !== true) return [SOURCE_LOCALE];
  const out: Locale[] = [SOURCE_LOCALE];
  if (flags.enable_locale_en === true) out.push('en');
  if (flags.enable_locale_ru === true) out.push('ru');
  if (flags.enable_locale_de === true) out.push('de');
  return out;
}

/** A user doc's data → its locale among `allowed` (default: Hebrew only). */
export function userLocaleFromProfile(userData: unknown, allowed: readonly Locale[] = [SOURCE_LOCALE]): Locale {
  const core = (userData as { core?: { locale?: unknown } } | null | undefined)?.core;
  const loc = resolveLocale({
    i18nEnabled: allowed.some((l) => l !== SOURCE_LOCALE),
    allowed,
    profileLocale: core?.locale,
  });
  return isLocale(loc) ? loc : SOURCE_LOCALE;
}

/** The slice of the Admin Firestore API this file uses (lets tests pass a fake). */
export interface DocReader {
  doc(path: string): { get(): Promise<{ exists: boolean; data(): unknown }> };
}

type Warn = (message: string, err: unknown) => void;
const defaultWarn: Warn = (message, err) => console.warn(message, err);

/** Reads system_config/feature_flags once → allowed locales. A failed read → Hebrew only. */
export async function getI18nAllowedLocales(db: DocReader, warn: Warn = defaultWarn): Promise<Locale[]> {
  try {
    const snap = await db.doc('system_config/feature_flags').get();
    return allowedLocalesFromFlags(snap.exists ? (snap.data() as I18nFlagFields) : null);
  } catch (err) {
    warn('[user-locale] feature_flags read failed — using he', err);
    return [SOURCE_LOCALE];
  }
}

/** users/{uid}.core.locale among `allowed`, else 'he'. A failed read → 'he'. */
export async function getUserLocale(
  db: DocReader,
  uid: string,
  allowed: readonly Locale[],
  warn: Warn = defaultWarn,
): Promise<Locale> {
  if (!uid || allowed.length <= 1) return SOURCE_LOCALE; // flags off: no read at all
  try {
    const snap = await db.doc(`users/${uid}`).get();
    return userLocaleFromProfile(snap.exists ? snap.data() : null, allowed);
  } catch (err) {
    warn(`[user-locale] users/${uid} read failed — using he`, err);
    return SOURCE_LOCALE;
  }
}
