/**
 * gym-equipment-text.utils — the how-to text on a gym_equipment doc
 * (`cues` / `tips` / `prepNote`, with the legacy `description` as a fallback),
 * read once here so the park drawer, the workout composers and the admin
 * editor agree on what a machine "says".
 *
 * Read order for the "דגשים" list:
 *   1. `cues` — the curated 3–5 short lines (admin editor / content task).
 *   2. `description` — the old CSV import's newline-separated usage steps,
 *      split into lines (same splitter the player uses for exercise cues).
 *   3. nothing — the caller decides (the drawer shows its muscle-based
 *      auto cues; the workout shows no cues, as before).
 *
 * Pure TS (no React, no Firebase) — node-env unit-testable.
 */
import { toCueList } from '@/features/content/exercises/utils/cue-text.utils';
import { hebrewOrEmpty } from '@/features/content/shared/stored-text-fields';
import type { GymEquipment } from './gym-equipment.types';
import type { ExecutionMethod, LocalizedText } from '@/features/content/exercises/core/exercise.types';

/** Admin-editor limits (also used by the editor's counters). */
export const EQUIPMENT_CUES_MAX = 5;
export const EQUIPMENT_TIPS_MAX = 2;
export const EQUIPMENT_CUE_WARN_CHARS = 60;
export const EQUIPMENT_PREP_NOTE_MAX_CHARS = 40;

type EquipmentText = Pick<GymEquipment, 'cues' | 'tips' | 'prepNote' | 'description'> &
  Partial<Pick<GymEquipment, 'cuesLocalized' | 'tipsLocalized'>>;

export type EquipmentCuesSource = 'doc' | 'description' | 'none';

/**
 * The machine's "דגשים": `cues` → else `description` lines → else [] (source 'none').
 */
export function resolveEquipmentCues(
  equipment: Partial<EquipmentText> | null | undefined,
): { cues: string[]; source: EquipmentCuesSource } {
  const docCues = toCueList(equipment?.cues);
  if (docCues.length > 0) return { cues: docCues, source: 'doc' };
  const fromDescription = toCueList(equipment?.description);
  if (fromDescription.length > 0) return { cues: fromDescription, source: 'description' };
  return { cues: [], source: 'none' };
}

/** The drawer's list: doc cues → description lines → the given auto fallback. */
export function resolveEquipmentDrawerCues(
  equipment: Partial<EquipmentText> | null | undefined,
  autoFallback: () => string[],
): { cues: string[]; source: EquipmentCuesSource | 'auto' } {
  const resolved = resolveEquipmentCues(equipment);
  if (resolved.source !== 'none') return resolved;
  return { cues: autoFallback(), source: 'auto' };
}

/** The machine's "טיפים" (0–2 lines). Each tip stays whole — not split on dashes. */
export function resolveEquipmentTips(equipment: Partial<EquipmentText> | null | undefined): string[] {
  const raw = Array.isArray(equipment?.tips) ? equipment!.tips : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = hebrewOrEmpty(t).replace(/\s+/g, ' ').trim(); // tolerant of a raw {he,en} item
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** The setup line shown before the machine block ('' when none). */
export function resolveEquipmentPrepNote(equipment: Partial<EquipmentText> | null | undefined): string {
  const p = equipment?.prepNote;
  return hebrewOrEmpty(p).replace(/\s+/g, ' ').trim();
}

/**
 * The machine's text as ExecutionMethod fields, for a machine turned into a
 * (pseudo-)exercise in a workout. Uses the exact fields the player's cue path
 * reads for real exercises:
 *   specificCues     → "דגשים"  (resolveExerciseCues → plan `highlights`)
 *   highlights       → "טיפים"  (resolveExerciseCues → plan `tips`, only when
 *                                specificCues is non-empty — always true here)
 *   notificationText → plan `prepNote` (rest/prep screen before the station)
 * Empty fields are omitted, so a text-less machine yields `{}`.
 */
export function buildEquipmentMethodText(
  equipment: Partial<EquipmentText> | null | undefined,
): Pick<ExecutionMethod, 'specificCues' | 'highlights' | 'notificationText'> {
  const { cues, source } = resolveEquipmentCues(equipment);
  // English rides along per item only when the doc has it AND the cleaned lists line up one to one.
  const pairWith = (he: string[], loc: LocalizedText[] | undefined) => {
    const en = Array.isArray(loc) && loc.length > 0 ? toCueList(loc, null, 'en') : [];
    return he.map((s, i) => ({ he: s, en: en.length === he.length && en[i] !== s ? en[i] : '' }) as LocalizedText);
  };
  // Tips only ride along with cues — resolveExerciseCues ignores highlights-as-tips
  // without specificCues (it would promote them to the cue list instead).
  const tips = cues.length > 0 ? resolveEquipmentTips(equipment) : [];
  const prepNote = resolveEquipmentPrepNote(equipment);
  return {
    ...(cues.length > 0 ? { specificCues: pairWith(cues, source === 'doc' ? equipment?.cuesLocalized : undefined) } : {}),
    ...(tips.length > 0 ? { highlights: pairWith(tips, equipment?.tipsLocalized) } : {}),
    ...(prepNote ? { notificationText: prepNote } : {}),
  };
}

/**
 * Admin save mapping for the four text fields. Trims every item and drops
 * empty ones (the editor never trims while typing). Caps lists at their max.
 *
 * Cleared-vs-never-set: an emptied field that HAD a value on the loaded doc is
 * written as the explicit clear signal (`[]` for lists, `null` for strings —
 * `.claude/rules/exercise-editor-conventions.md`); one that was never set stays
 * `undefined`, which the service's stripUndefined omits, so untouched docs don't
 * gain empty fields.
 */
export function buildEquipmentTextFields(
  draft: { cues?: string[]; tips?: string[]; prepNote?: string | null; description?: string | null },
  initial?: Partial<EquipmentText> | null,
): {
  cues?: string[];
  tips?: string[];
  prepNote?: string | null;
  description?: string | null;
} {
  const cleanList = (list: string[] | undefined, max: number) =>
    (list ?? []).map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, max);
  const hadList = (v: unknown) => Array.isArray(v) && v.length > 0;
  const hadString = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  const cues = cleanList(draft.cues, EQUIPMENT_CUES_MAX);
  const tips = cleanList(draft.tips, EQUIPMENT_TIPS_MAX);
  const prepNote = (draft.prepNote ?? '').trim();
  // Description keeps its inner newlines (they are the step separators).
  const description = (draft.description ?? '').trim();

  return {
    cues: cues.length > 0 ? cues : hadList(initial?.cues) ? [] : undefined,
    tips: tips.length > 0 ? tips : hadList(initial?.tips) ? [] : undefined,
    prepNote: prepNote ? prepNote : hadString(initial?.prepNote) ? null : undefined,
    description: description ? description : hadString(initial?.description) ? null : undefined,
  };
}

export interface EquipmentEnglishDraft {
  name?: string | null;
  description?: string | null;
  prepNote?: string | null;
  cues?: string[];
  tips?: string[];
  nameEn?: string;
  descriptionEn?: string;
  prepNoteEn?: string;
  /** Parallel to `cues` / `tips` (same index = same item). */
  cuesEn?: string[];
  tipsEn?: string[];
}

/**
 * Admin save mapping for the English side: `<field>Localized` keys for the service's fold-on-write, so a doc becomes
 * {he,en} only once English is entered. A key is emitted only when English exists (or the doc already had a pair, so
 * removing English folds back to plain Hebrew); Hebrew-only saves emit nothing and stay byte-identical.
 * Lists keep the SAME item filter as buildEquipmentTextFields (trim, drop empty, cap) so the pairs line up.
 */
export function buildEquipmentLocalizedFields(
  draft: EquipmentEnglishDraft,
  initial?: Partial<Pick<GymEquipment, 'nameLocalized' | 'descriptionLocalized' | 'prepNoteLocalized' | 'cuesLocalized' | 'tipsLocalized'>> | null,
): {
  nameLocalized?: LocalizedText;
  descriptionLocalized?: LocalizedText;
  prepNoteLocalized?: LocalizedText;
  cuesLocalized?: LocalizedText[];
  tipsLocalized?: LocalizedText[];
} {
  const out: ReturnType<typeof buildEquipmentLocalizedFields> = {};
  const scalar = (he: string | null | undefined, en: string | undefined, had: unknown): LocalizedText | undefined => {
    const heT = (he ?? '').trim();
    const enT = (en ?? '').trim();
    if (!heT) return undefined;
    return enT || had ? ({ he: heT, en: enT } as LocalizedText) : undefined;
  };
  const list = (he: string[] | undefined, en: string[] | undefined, max: number, had: unknown): LocalizedText[] | undefined => {
    const pairs = (he ?? [])
      .map((h, i) => ({ he: typeof h === 'string' ? h.trim() : '', en: (en?.[i] ?? '').trim() }))
      .filter((p) => p.he)
      .slice(0, max);
    if (pairs.length === 0) return undefined;
    return pairs.some((p) => p.en) || (Array.isArray(had) && had.length > 0) ? (pairs as LocalizedText[]) : undefined;
  };
  const n = scalar(draft.name, draft.nameEn, initial?.nameLocalized);
  const d = scalar(draft.description, draft.descriptionEn, initial?.descriptionLocalized);
  const p = scalar(draft.prepNote, draft.prepNoteEn, initial?.prepNoteLocalized);
  const c = list(draft.cues, draft.cuesEn, EQUIPMENT_CUES_MAX, initial?.cuesLocalized);
  const t = list(draft.tips, draft.tipsEn, EQUIPMENT_TIPS_MAX, initial?.tipsLocalized);
  if (n) out.nameLocalized = n;
  if (d) out.descriptionLocalized = d;
  if (p) out.prepNoteLocalized = p;
  if (c) out.cuesLocalized = c;
  if (t) out.tipsLocalized = t;
  return out;
}
