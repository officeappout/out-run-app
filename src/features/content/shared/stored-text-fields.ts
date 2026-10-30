/**
 * Back-compat English for Firestore content that the app reads as PLAIN Hebrew strings
 * (park stations, run templates, smart/push messages, brands, tags). Same idea as
 * programs/core/localized-fields: a stored field may be a string (every doc today) or a
 * LocalizedText {he, en}. Reads normalize so the field the code always read keeps a Hebrew
 * string and the pair moves to `<field>Localized` ONLY when the doc holds one; display resolves
 * through pickText / pickList; writes fold English back in only when it was entered.
 * Pure TS: safe for client, server routes and Cloud Functions (functions/src keeps a mirror).
 */
import { buildStoredText, hebrewOf, resolveContentText, type StoredText } from './content-locale';
import type { AppLanguage, LocalizedText } from './localized-text.types';

export type { LocalizedFieldPair } from '../programs/core/localized-fields';
export { normalizeStoredTextFields, foldLocalizedFieldsForWrite } from '../programs/core/localized-fields';

export function isStoredLocalized(v: unknown): v is LocalizedText {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'he' in (v as object);
}

/** Hebrew string of any stored value. Non-text values (undefined, null, numbers) come back unchanged so callers keep their own empty handling. */
export function hebrewText<T>(v: T): T extends StoredText ? string : T {
  return (isStoredLocalized(v) ? hebrewOf(v) : v) as never;
}

/** Hebrew string or '' for any stored value (string | LocalizedText | anything else). */
export function hebrewOrEmpty(v: unknown): string {
  if (typeof v === 'string') return v;
  return isStoredLocalized(v) ? hebrewOf(v) : '';
}

/**
 * What to store when a Hebrew-only edit of a field hits a stored value. Returns:
 *  - `undefined`: nothing to write (the stored {he, en} pair already has this Hebrew),
 *  - the new Hebrew as a plain string when the Hebrew changed (the old English would be stale),
 *  - the incoming value as is: stored was plain, or the edit already carries a pair.
 * Mirrors the client updatePark guard; used by the server-side park update.
 */
export function mergeHebrewEdit(stored: unknown, incoming: unknown): unknown {
  if (typeof incoming !== 'string' || !isStoredLocalized(stored)) return incoming;
  if (hebrewOrEmpty(stored) === incoming) return undefined;
  return incoming;
}

export interface ListFieldPair {
  key: string;
  localizedKey: string;
}

/** List read side: `key` becomes string[] (Hebrew); when any item is a LocalizedText `localizedKey` carries the pairs. Plain string lists pass through untouched. */
export function normalizeStoredListFields<T extends object>(data: T, fields: ListFieldPair[]): T {
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const { key, localizedKey } of fields) {
    const v = out[key];
    if (!Array.isArray(v) || !v.some(isStoredLocalized)) continue;
    out[localizedKey] = v.map((x) => (isStoredLocalized(x) ? x : { he: typeof x === 'string' ? x : '', en: '' }));
    out[key] = v.map((x) => (isStoredLocalized(x) ? hebrewOf(x) : x));
  }
  return out as T;
}

/**
 * List write side: folds `<field>Localized` into `<field>` item by item. English entered on an item -> that item is a
 * LocalizedText; no English anywhere -> the plain string list, exactly as given.
 */
export function foldLocalizedListsForWrite<T extends object>(data: T, fields: ListFieldPair[]): T {
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const { key, localizedKey } of fields) {
    if (!(localizedKey in out)) continue;
    const loc = out[localizedKey] as (LocalizedText | undefined)[] | undefined | null;
    delete out[localizedKey];
    const list = out[key];
    if (!Array.isArray(list) || !Array.isArray(loc) || !loc.some((l) => (l?.en ?? '').trim())) continue;
    out[key] = list.map((he, i) => buildStoredText(hebrewOrEmpty(he), loc[i]?.en, loc[i]));
  }
  return out as T;
}

/** Display text of `key` in `lang` (Hebrew when flag off / no English). */
export function pickText(item: object | null | undefined, key: string, lang: AppLanguage = 'he'): string {
  if (!item) return '';
  const rec = item as Record<string, unknown>;
  const loc = rec[`${key}Localized`];
  const base = (isStoredLocalized(loc) ? loc : rec[key]) as StoredText | undefined;
  return resolveContentText(base ?? '', lang);
}

/** Display list of `key` in `lang`: each item resolved from `<key>Localized[i]` when present, else the Hebrew item. */
export function pickList(item: object | null | undefined, key: string, lang: AppLanguage = 'he'): string[] {
  if (!item) return [];
  const rec = item as Record<string, unknown>;
  const base = Array.isArray(rec[key]) ? (rec[key] as unknown[]) : [];
  const loc = Array.isArray(rec[`${key}Localized`]) ? (rec[`${key}Localized`] as unknown[]) : [];
  return base.map((he, i) => {
    const l = loc[i];
    return resolveContentText((isStoredLocalized(l) ? l : (he as StoredText)) ?? '', lang);
  });
}
