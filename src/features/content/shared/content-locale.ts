/**
 * Content locale resolution (display only). Pure: no React, no Firebase.
 *
 * Firestore content (exercise names, descriptions, cues, gear) is stored as LocalizedText
 * { he, en }. User-facing code resolves it with the language from here. Flag off (enable_content_locale)
 * or any locale other than 'en' resolves to 'he', which is exactly what getLocalizedText(value) did before.
 */
import { getLocalizedText, type AppLanguage, type LocalizedText } from './localized-text.types';

/** The legacy male/female copy shape (same as exercise.types GenderedText; kept local to stay import-light). */
export interface GenderedCopy {
  male: string;
  female: string;
}

export type ContentText = LocalizedText | GenderedCopy | string | null | undefined;

/** Language to resolve content in. Only 'en' with the flag on leaves Hebrew. */
export function contentLanguage(locale: string | undefined, flagOn: boolean): AppLanguage {
  return flagOn && locale === 'en' ? 'en' : 'he';
}

/** LocalizedText in `lang`; an empty slot falls back to Hebrew (then any other slot). */
export function localizedContent(value: LocalizedText | undefined | null, lang: AppLanguage = 'he'): string {
  return getLocalizedText(value ?? undefined, lang);
}

function isGendered(v: unknown): v is GenderedCopy {
  return !!v && typeof v === 'object' && typeof (v as GenderedCopy).male === 'string' && typeof (v as GenderedCopy).female === 'string';
}

/**
 * Resolve any stored copy shape: plain string (as is), GenderedText (by gender; male when unknown),
 * LocalizedText (by language, Hebrew fallback). Gendered copy has no English slot, so it stays as stored.
 */
export function resolveContentText(value: ContentText, lang: AppLanguage = 'he', gender: 'male' | 'female' | 'other' | null = null): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (isGendered(value)) return (gender === 'female' ? value.female : value.male) || value.male || '';
  return getLocalizedText(value, lang);
}

/** Stored copy that may be a legacy plain Hebrew string or a LocalizedText (programs, levels, level settings). */
export type StoredText = string | LocalizedText;

/** The Hebrew slot of a stored value ('' when empty). Logic that matches on Hebrew names keeps using this. */
export function hebrewOf(value: StoredText | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.he || value.en || '';
}

/**
 * Build the value to store from Hebrew + optional English. Returns the plain Hebrew string when there is no
 * English (so Hebrew-only saves stay byte-identical to before), LocalizedText only once English is entered.
 * An existing `es` slot is carried over so a save never drops another language.
 */
export function buildStoredText(he: string, en?: string | null, prev?: StoredText | null): StoredText {
  const heT = (he ?? '').trim();
  const enT = (en ?? '').trim();
  if (!enT) return heT;
  const es = prev && typeof prev === 'object' ? prev.es : undefined;
  return { he: heT, en: enT, ...(es ? { es } : {}) };
}
