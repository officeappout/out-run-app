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
import type { GymEquipment } from './gym-equipment.types';
import type { ExecutionMethod, LocalizedText } from '@/features/content/exercises/core/exercise.types';

/** Admin-editor limits (also used by the editor's counters). */
export const EQUIPMENT_CUES_MAX = 5;
export const EQUIPMENT_TIPS_MAX = 2;
export const EQUIPMENT_CUE_WARN_CHARS = 60;
export const EQUIPMENT_PREP_NOTE_MAX_CHARS = 40;

type EquipmentText = Pick<GymEquipment, 'cues' | 'tips' | 'prepNote' | 'description'>;

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
    const s = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '';
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
  return typeof p === 'string' ? p.replace(/\s+/g, ' ').trim() : '';
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
  const toLocalized = (s: string) => ({ he: s, en: '' }) as LocalizedText;
  const { cues } = resolveEquipmentCues(equipment);
  // Tips only ride along with cues — resolveExerciseCues ignores highlights-as-tips
  // without specificCues (it would promote them to the cue list instead).
  const tips = cues.length > 0 ? resolveEquipmentTips(equipment) : [];
  const prepNote = resolveEquipmentPrepNote(equipment);
  return {
    ...(cues.length > 0 ? { specificCues: cues.map(toLocalized) } : {}),
    ...(tips.length > 0 ? { highlights: tips.map(toLocalized) } : {}),
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
