// AUTO-GENERATED from src/lib/i18n/core/i18n-core.ts by functions/scripts/vendor-copy-geo-discovery.js — do not edit.
/**
 * i18n core — the pure, framework-free half of the translation layer
 * (docs/i18n/PLAN.md §2.1, §2.2, §2.4).
 *
 * IMPORT-FREE ON PURPOSE: this file is mirrored byte for byte into
 * functions/src/shared/i18n-core.ts by functions/scripts/vendor-copy-geo-discovery.js
 * (COMMITTED_MIRRORS), so pushes and Kelly in Cloud Functions pick text with the
 * exact same rules as the app. A root vitest pins the mirror. The ICU engine
 * (intl-messageformat) is passed in as `format`, so this file needs no package.
 *
 * Locales are plain strings here; the app's typed list is src/lib/i18n/locales.ts.
 *
 * Rules:
 *   - Hebrew ('he') is the source. Every chain ends in it.
 *   - UI keys:     locale → 'en' (when locale is not he/en) → 'he' → the key itself.
 *     The message is formatted with the locale it was found in (plural rules).
 *   - Content:     pickText(): locale+gender → locale neutral → en → he+gender → he.
 *   - Gender:      always passed as an ICU `select` value: 'male' | 'female' | 'other'.
 */

export const I18N_SOURCE_LOCALE = 'he';
export const I18N_BRIDGE_LOCALE = 'en';

/** One namespace of one locale: flat dotted keys → ICU message strings. */
export type Catalog = Readonly<Record<string, string>>;

/** ICU values. Strings and numbers for plain t(); rich() also passes tag functions. */
export type MessageValues = Record<string, unknown>;

/** The ICU formatter, injected (app: core/icu.ts; functions: its own adapter). */
export type FormatFn = (message: string, locale: string, values?: MessageValues) => string;

export type Gender = 'male' | 'female' | 'other';

/** Anything a profile may hold (undefined, '', legacy values) → a valid ICU select value. */
export function genderArg(gender: unknown): Gender {
  return gender === 'male' || gender === 'female' ? gender : 'other';
}

/** Locales to try for a UI key, most specific first. */
export function fallbackChain(locale: string): string[] {
  const chain = [locale];
  if (locale !== I18N_SOURCE_LOCALE && locale !== I18N_BRIDGE_LOCALE) chain.push(I18N_BRIDGE_LOCALE);
  if (locale !== I18N_SOURCE_LOCALE) chain.push(I18N_SOURCE_LOCALE);
  return chain;
}

export interface LookupResult {
  message: string;
  /** The locale the message was found in (format with this one). */
  locale: string;
  /** False when the key was missing everywhere and `message` is the key itself. */
  found: boolean;
}

/** Finds a key along the fallback chain. `catalogFor(locale)` may return undefined (not loaded yet). */
export function lookupMessage(
  catalogFor: (locale: string) => Catalog | undefined,
  locale: string,
  key: string,
): LookupResult {
  for (const loc of fallbackChain(locale)) {
    const msg = catalogFor(loc)?.[key];
    if (typeof msg === 'string' && msg !== '') return { message: msg, locale: loc, found: true };
  }
  return { message: key, locale: I18N_SOURCE_LOCALE, found: false };
}

/**
 * Looks a key up and formats it. A missing key returns the key (never throws);
 * a message that fails to format returns the raw message.
 */
export function translate(
  catalogFor: (locale: string) => Catalog | undefined,
  format: FormatFn,
  locale: string,
  key: string,
  values?: MessageValues,
): string {
  const hit = lookupMessage(catalogFor, locale, key);
  if (!hit.found) return hit.message;
  try {
    return format(hit.message, hit.locale, values);
  } catch {
    return hit.message;
  }
}

// ── Locale resolution (PLAN §2.2) ───────────────────────────────────────────

export interface LocaleInputs {
  /** enable_i18n. Off → always the source locale. */
  i18nEnabled: boolean;
  /** Locales the user may get (the source locale is always allowed). */
  allowed: readonly string[];
  /** users/{uid}.core.locale — the source of truth once set. */
  profileLocale?: unknown;
  /** onboardingPrefs 'app_locale' (survives a hard close on iOS). */
  storedLocale?: unknown;
  /** Device languages, most preferred first ('en-US', 'ru', ...). */
  deviceLocales?: readonly string[];
}

/** 'en-US' → 'en', 'RU' → 'ru'. Non-strings → ''. */
export function normalizeLocaleTag(tag: unknown): string {
  if (typeof tag !== 'string') return '';
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/** Profile → stored pref → device → source. Only allowed locales count. */
export function resolveLocale(inputs: LocaleInputs): string {
  if (!inputs.i18nEnabled) return I18N_SOURCE_LOCALE;
  const allowed = new Set([I18N_SOURCE_LOCALE, ...inputs.allowed]);
  const candidates: unknown[] = [inputs.profileLocale, inputs.storedLocale, ...(inputs.deviceLocales ?? [])];
  for (const c of candidates) {
    const loc = normalizeLocaleTag(c);
    if (loc && allowed.has(loc)) return loc;
  }
  return I18N_SOURCE_LOCALE;
}

// ── Content text (Firestore) — PLAN §2.4 ────────────────────────────────────

/** One locale's text: neutral, or per gender ('other' = neutral). */
export type GenderedVariant = { male?: string; female?: string; other?: string };
export type LocalizedEntry = string | GenderedVariant;

/**
 * The one content text shape. A legacy plain string is read as Hebrew, so no
 * migration of existing documents is needed.
 */
export type LocalizedGendered = string | Partial<Record<string, LocalizedEntry>>;

function entryText(entry: LocalizedEntry | undefined, gender: Gender | null): string {
  if (entry === undefined || entry === null) return '';
  if (typeof entry === 'string') return gender === null || gender === 'other' ? entry : '';
  if (gender === null) return entry.other ?? '';
  return entry[gender] ?? '';
}

/**
 * Picks content text: locale+gender → locale neutral → en+gender → en neutral →
 * he+gender → he neutral → ''. A plain-string entry counts as neutral.
 * A gendered entry with no 'other' falls back to its male form for the neutral step
 * (Hebrew content is often written male-default).
 */
export function pickText(value: LocalizedGendered | null | undefined, locale: string, gender?: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const g = genderArg(gender);
  const neutral = (e: LocalizedEntry | undefined) =>
    typeof e === 'string' ? e : e ? (e.other ?? e.male ?? e.female ?? '') : '';
  const order = [locale];
  if (locale !== I18N_BRIDGE_LOCALE && locale !== I18N_SOURCE_LOCALE) order.push(I18N_BRIDGE_LOCALE);
  if (locale !== I18N_SOURCE_LOCALE) order.push(I18N_SOURCE_LOCALE);
  for (const loc of order) {
    const e = value[loc];
    const exact = entryText(e, g);
    if (exact) return exact;
    const n = neutral(e);
    if (n) return n;
  }
  return '';
}

// ── Catalog checks (used by the catalog tests and, later, the panel) ───────

/** Every argument a message uses: `{name}`, `{count, plural, ...}`, `{gender, select, ...}` → ['count', 'gender', 'name'] (nested ones too). */
export function messageArgNames(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === "'") {
      // '' is a literal apostrophe; '{ starts a quoted run (ICU apostrophe mode DOUBLE_OPTIONAL).
      if (message[i + 1] === "'") { i++; continue; }
      if (quoted) { quoted = false; continue; }
      if (message[i + 1] === '{' || message[i + 1] === '}') { quoted = true; continue; }
      continue;
    }
    if (quoted) continue;
    if (ch === '{') {
      if (depth % 2 === 0) {
        const m = /^\s*([A-Za-z_][\w]*)/.exec(message.slice(i + 1));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return Array.from(names).sort();
}
