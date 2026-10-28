/**
 * English support for programs / levels / level settings WITHOUT a data migration.
 *
 * Firestore may hold a plain Hebrew string (every doc today) or a LocalizedText {he, en} per text field.
 * Reads normalize it so existing code keeps seeing a Hebrew string in the field it always read
 * (`name`, `description`, `levelDescription`, ...) and gets the full LocalizedText in a sibling
 * `<field>Localized` only when the doc actually holds one. Display code resolves with
 * `resolveContentText(x.nameLocalized ?? x.name, useContentLanguage())`.
 * Writes go the other way: `name` + `nameLocalized.en` -> LocalizedText in `name` only if English was entered.
 */
import { buildStoredText, hebrewOf, resolveContentText, type StoredText } from '../../shared/content-locale';
import type { AppLanguage, LocalizedText } from '../../shared/localized-text.types';

export interface LocalizedFieldPair {
  /** Stored field (string in the app model, string | LocalizedText in Firestore). */
  key: string;
  /** App-model sibling carrying the LocalizedText when the doc has one. */
  localizedKey: string;
}

export const PROGRAM_TEXT_FIELDS: LocalizedFieldPair[] = [
  { key: 'name', localizedKey: 'nameLocalized' },
  { key: 'description', localizedKey: 'descriptionLocalized' },
];
export const LEVEL_TEXT_FIELDS: LocalizedFieldPair[] = PROGRAM_TEXT_FIELDS;
export const LEVEL_SETTINGS_TEXT_FIELDS: LocalizedFieldPair[] = [
  { key: 'levelDescription', localizedKey: 'levelDescriptionLocalized' },
  { key: 'assessmentBoldTitle', localizedKey: 'assessmentBoldTitleLocalized' },
];

function isLocalizedObject(v: unknown): v is LocalizedText {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'he' in (v as object);
}

/** Read side: Hebrew string stays in `key`, a stored LocalizedText moves to `localizedKey`. Plain strings pass through untouched. */
export function normalizeStoredTextFields<T extends object>(data: T, fields: LocalizedFieldPair[]): T {
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const { key, localizedKey } of fields) {
    const v = out[key];
    if (isLocalizedObject(v)) {
      out[localizedKey] = v;
      out[key] = hebrewOf(v);
    }
  }
  return out as T;
}

/**
 * Write side: folds `<field>Localized` into `<field>`. English entered -> LocalizedText; blank/absent English
 * -> the plain Hebrew string (clearing English when it was removed). Docs/payloads with no `<field>Localized`
 * key are left exactly as given, so Hebrew-only saves are byte-identical.
 */
export function foldLocalizedFieldsForWrite<T extends object>(data: T, fields: LocalizedFieldPair[]): T {
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const { key, localizedKey } of fields) {
    if (!(localizedKey in out)) continue;
    const loc = out[localizedKey] as LocalizedText | undefined | null;
    delete out[localizedKey];
    const en = (loc?.en ?? '').trim();
    const heRaw = key in out ? (out[key] as StoredText | undefined) : loc?.he;
    if (heRaw === undefined) continue;
    // No English: keep the Hebrew value exactly as given (a Hebrew-only save is unchanged, not even re-trimmed).
    out[key] = en ? buildStoredText(hebrewOf(heRaw), en, loc) : typeof heRaw === 'string' ? heRaw : hebrewOf(heRaw);
  }
  return out as T;
}

type TextKey = 'name' | 'description' | 'levelDescription' | 'assessmentBoldTitle';

/**
 * Display text of a program / level / level-settings field in `lang`. Flag off or 'he' -> the Hebrew string the
 * field always held (byte-identical); 'en' -> the English slot when the doc has one, else Hebrew.
 */
export function pickProgramText(
  item: Partial<Record<TextKey | `${TextKey}Localized`, unknown>> | null | undefined,
  key: TextKey,
  lang: AppLanguage = 'he',
): string {
  if (!item) return '';
  const loc = item[`${key}Localized`] as LocalizedText | undefined;
  const base = (loc ?? item[key]) as StoredText | undefined;
  return resolveContentText(base ?? '', lang);
}
