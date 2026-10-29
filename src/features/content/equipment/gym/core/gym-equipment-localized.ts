/**
 * English for gym_equipment (park stations) without a data migration: name / description / prepNote and the
 * cues / tips / instructions lists may be stored as plain Hebrew (every doc today) or {he, en}. The service
 * normalizes on read (fields stay Hebrew strings, the pair rides in `<field>Localized`) and folds on write.
 */
import {
  foldLocalizedFieldsForWrite,
  foldLocalizedListsForWrite,
  normalizeStoredListFields,
  normalizeStoredTextFields,
  pickList,
  pickText,
  type LocalizedFieldPair,
  type ListFieldPair,
} from '../../../shared/stored-text-fields';
import type { AppLanguage } from '../../../shared/localized-text.types';

export const GYM_EQUIPMENT_TEXT_FIELDS: LocalizedFieldPair[] = [
  { key: 'name', localizedKey: 'nameLocalized' },
  { key: 'description', localizedKey: 'descriptionLocalized' },
  { key: 'prepNote', localizedKey: 'prepNoteLocalized' },
];
export const GYM_EQUIPMENT_LIST_FIELDS: ListFieldPair[] = [
  { key: 'cues', localizedKey: 'cuesLocalized' },
  { key: 'tips', localizedKey: 'tipsLocalized' },
  { key: 'instructions', localizedKey: 'instructionsLocalized' },
];

export function normalizeGymEquipmentDoc<T extends object>(data: T): T {
  return normalizeStoredListFields(normalizeStoredTextFields(data, GYM_EQUIPMENT_TEXT_FIELDS), GYM_EQUIPMENT_LIST_FIELDS);
}

export function foldGymEquipmentForWrite<T extends object>(data: T): T {
  return foldLocalizedListsForWrite(foldLocalizedFieldsForWrite(data, GYM_EQUIPMENT_TEXT_FIELDS), GYM_EQUIPMENT_LIST_FIELDS);
}

type TextKey = 'name' | 'description' | 'prepNote';
type ListKey = 'cues' | 'tips' | 'instructions';

/** Station text in `lang` (Hebrew while enable_content_locale is off). */
export function pickGymText(eq: object | null | undefined, key: TextKey, lang: AppLanguage = 'he'): string {
  return pickText(eq, key, lang);
}
export function pickGymList(eq: object | null | undefined, key: ListKey, lang: AppLanguage = 'he'): string[] {
  return pickList(eq, key, lang);
}

/**
 * Display view of a normalized station: for 'en' the text fields carry the English (per item, Hebrew where a
 * slot is empty); for 'he' (flag off, every Hebrew user) the SAME object comes back, so Hebrew paths are untouched.
 */
export function localizeGymEquipment<T extends object>(eq: T, lang: AppLanguage): T {
  if (lang !== 'en' || !eq) return eq;
  const e = eq as Record<string, unknown>;
  const out: Record<string, unknown> = { ...e };
  for (const { key } of GYM_EQUIPMENT_TEXT_FIELDS) {
    if (e[`${key}Localized`] != null) out[key] = pickText(e, key, lang);
  }
  for (const { key } of GYM_EQUIPMENT_LIST_FIELDS) {
    if (Array.isArray(e[`${key}Localized`])) out[key] = pickList(e, key, lang);
  }
  return out as T;
}
