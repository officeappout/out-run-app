/**
 * Stored copy that may be a plain Hebrew string (every doc today) or {he, en}. Cloud Functions mirror of the
 * app's src/features/content/shared/stored-text-fields (functions cannot import from src/). Pure, no Firebase.
 */
export interface StoredLocalized {
  he?: unknown;
  en?: unknown;
}

function isLocalized(v: unknown): v is StoredLocalized {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'he' in (v as object);
}

/** The Hebrew string of a stored value ('' for anything else): never an object, never "[object Object]". */
export function hebrewTextOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isLocalized(v)) {
    const he = typeof v.he === 'string' ? v.he : '';
    const en = typeof v.en === 'string' ? v.en : '';
    return he || en;
  }
  return '';
}

/** The English slot of a stored {he, en} ('' when the value is plain or has no English). */
export function englishTextOf(v: unknown): string {
  return isLocalized(v) && typeof v.en === 'string' ? v.en.trim() : '';
}
