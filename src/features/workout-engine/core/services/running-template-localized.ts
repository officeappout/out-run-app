/**
 * English for runWorkoutTemplates / runProgramTemplates without a data migration. Stored text (name, description,
 * blocks[].label / restLabel, volumeCaps[].description) is a plain Hebrew string today or {he, en}. The admin service
 * is the ONLY reader of these collections, so normalizing here keeps every engine on Hebrew strings: the Matchmaker's
 * name matching, the walking-block detection (label includes 'הליכ'), cleanBlockLabel regexes and the persisted
 * `workoutName` all keep seeing Hebrew. The pairs ride in `<field>Localized` for display layers that want English.
 */
import {
  foldLocalizedFieldsForWrite,
  normalizeStoredTextFields,
  type LocalizedFieldPair,
} from '@/features/content/shared/stored-text-fields';

const WORKOUT_FIELDS: LocalizedFieldPair[] = [
  { key: 'name', localizedKey: 'nameLocalized' },
  { key: 'description', localizedKey: 'descriptionLocalized' },
];
const BLOCK_FIELDS: LocalizedFieldPair[] = [
  { key: 'label', localizedKey: 'labelLocalized' },
  { key: 'restLabel', localizedKey: 'restLabelLocalized' },
];
const PROGRAM_FIELDS: LocalizedFieldPair[] = [{ key: 'name', localizedKey: 'nameLocalized' }];
const CAP_FIELDS: LocalizedFieldPair[] = [{ key: 'description', localizedKey: 'descriptionLocalized' }];

type Rec = Record<string, unknown>;

function mapList(list: unknown, fn: (x: Rec) => Rec): unknown {
  return Array.isArray(list) ? list.map((x) => (x && typeof x === 'object' ? fn(x as Rec) : x)) : list;
}

export function normalizeRunWorkoutTemplateDoc<T extends object>(data: T): T {
  const out = normalizeStoredTextFields(data, WORKOUT_FIELDS) as Rec;
  if ('blocks' in out) out.blocks = mapList(out.blocks, (b) => normalizeStoredTextFields(b, BLOCK_FIELDS) as Rec);
  return out as T;
}

export function foldRunWorkoutTemplateForWrite<T extends object>(data: T): T {
  const out = foldLocalizedFieldsForWrite(data, WORKOUT_FIELDS) as Rec;
  if ('blocks' in out) out.blocks = mapList(out.blocks, (b) => foldLocalizedFieldsForWrite(b, BLOCK_FIELDS) as Rec);
  return out as T;
}

export function normalizeRunProgramTemplateDoc<T extends object>(data: T): T {
  const out = normalizeStoredTextFields(data, PROGRAM_FIELDS) as Rec;
  if ('volumeCaps' in out) out.volumeCaps = mapList(out.volumeCaps, (c) => normalizeStoredTextFields(c, CAP_FIELDS) as Rec);
  return out as T;
}

export function foldRunProgramTemplateForWrite<T extends object>(data: T): T {
  const out = foldLocalizedFieldsForWrite(data, PROGRAM_FIELDS) as Rec;
  if ('volumeCaps' in out) out.volumeCaps = mapList(out.volumeCaps, (c) => foldLocalizedFieldsForWrite(c, CAP_FIELDS) as Rec);
  return out as T;
}
