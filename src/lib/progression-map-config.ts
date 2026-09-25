/**
 * Progression Map — Phase 1 config.
 *
 * The v1 allow-list of leaf programs that get a Skill Tree, and the
 * deterministic rule for picking which tree an exercise's "מפה מלאה" link
 * opens. Lives in src/lib/ (not inside src/features/progression-map/ or
 * src/features/content/exercises/) so both of those domains can import it
 * without a cross-domain violation (CLAUDE.md Law 7).
 *
 * מאסל אפ (עליית כוח, fTLWzjP9gH2VNpamyCZF) is intentionally NOT on this list —
 * it's currently mis-flagged isMaster=true in production; fixing that is a
 * founder-only data change, out of scope for Phase 1.
 */
import type { Exercise } from '@/features/content/exercises';

export interface ProgressionMapLeafProgram {
  programId: string;
  nameHe: string;
}

export const PROGRESSION_MAP_LEAF_PROGRAMS: readonly ProgressionMapLeafProgram[] = [
  { programId: 'mFcuYlNgKXLqWVUFo0zt', nameHe: 'פרונט לבר' },
  { programId: 'pCI5NHXpowu2ySucqDn8', nameHe: 'פלאנץ׳' },
  { programId: 'cC0BOmm6KIqYAyQynEIo', nameHe: 'מתח יד אחת' },
  { programId: 'IOfBZFeorTTDkcz3tOA6', nameHe: 'עמידת ידיים' },
  { programId: 'PAxprHuT7HjqrWU4wl0T', nameHe: 'שכיבות סמיכה בעמידת ידיים' },
  { programId: 'EtY8YCol0qpF6DzgcTx1', nameHe: 'דגל אנושי' },
] as const;

export const PROGRESSION_MAP_LEAF_PROGRAM_IDS: ReadonlySet<string> = new Set(
  PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId),
);

/** Reference/first-build skill, per the brief — front lever. */
export const PROGRESSION_MAP_REFERENCE_PROGRAM_ID = 'mFcuYlNgKXLqWVUFo0zt';

export function isProgressionMapLeafProgram(programId: string): boolean {
  return PROGRESSION_MAP_LEAF_PROGRAM_IDS.has(programId);
}

export function getProgressionMapProgramName(programId: string): string | null {
  return PROGRESSION_MAP_LEAF_PROGRAMS.find((p) => p.programId === programId)?.nameHe ?? null;
}

/**
 * Deterministic rule for "which Phase-1 tree does this exercise's מפה מלאה
 * link open" — an exercise's targetPrograms is an array with no uniqueness
 * constraint, so more than one entry can be on the allow-list at once
 * (confirmed structurally possible, e.g. the handstand/HSPU diagnostic-triad
 * pair). Rule: first targetPrograms entry, in array order, whose programId is
 * on the allow-list. Matches this codebase's existing ambient convention of
 * taking targetPrograms[0]-style "first in array order" elsewhere
 * (exercise-replacement.service.ts's getExerciseLevel, useExerciseMasterData's
 * getExerciseLevel) — just scoped to the 6-program allow-list here.
 *
 * Returns null when no allow-listed program resolves — the common case for
 * most of the exercise library today (only these 6 skills are wired in v1).
 * Callers must leave existing behavior untouched in that case, not hide or
 * change anything for the exercise's other, non-Phase-1 program tags.
 */
export function resolveTreeProgramId(exercise: Pick<Exercise, 'targetPrograms'>): string | null {
  const match = exercise.targetPrograms?.find((tp) => PROGRESSION_MAP_LEAF_PROGRAM_IDS.has(tp.programId));
  return match?.programId ?? null;
}
