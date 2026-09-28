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
  /**
   * Whether this skill's card shows in the "המפות שלי" grid on the
   * /progression hub (progression-hub feature). Independent of the tree
   * route itself being reachable — every allow-listed program's
   * /progression-map/[programId] route already works regardless of this
   * flag (see the route guard's own comment). This flag only controls
   * discoverability from the hub grid; flipping one entry to `true` is the
   * entire "add a skill to the hub" change, no layout code touched.
   */
  visibleInHub: boolean;
}

export const PROGRESSION_MAP_LEAF_PROGRAMS: readonly ProgressionMapLeafProgram[] = [
  { programId: 'mFcuYlNgKXLqWVUFo0zt', nameHe: 'פרונט לבר', visibleInHub: true },
  { programId: 'pCI5NHXpowu2ySucqDn8', nameHe: 'פלאנץ׳', visibleInHub: true },
  { programId: 'cC0BOmm6KIqYAyQynEIo', nameHe: 'מתח יד אחת', visibleInHub: true },
  { programId: 'IOfBZFeorTTDkcz3tOA6', nameHe: 'עמידת ידיים', visibleInHub: false },
  { programId: 'PAxprHuT7HjqrWU4wl0T', nameHe: 'שכיבות סמיכה בעמידת ידיים', visibleInHub: true },
  { programId: 'EtY8YCol0qpF6DzgcTx1', nameHe: 'דגל אנושי', visibleInHub: false },
] as const;

export const PROGRESSION_MAP_LEAF_PROGRAM_IDS: ReadonlySet<string> = new Set(
  PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId),
);

/** The visibleInHub subset, in the same order — the /progression hub's grid source. */
export const PROGRESSION_MAP_HUB_PROGRAMS: readonly ProgressionMapLeafProgram[] =
  PROGRESSION_MAP_LEAF_PROGRAMS.filter((p) => p.visibleInHub);

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

/**
 * Scenic background assets. Config constants only — swap the art by
 * replacing these PNGs under public/images/progression-map/, no logic
 * change needed anywhere that imports them. See SkillTreeBackground.tsx.
 *
 * Three zones, composited top to bottom (round 3 — replaced the round-2
 * single-repeating-tile version, which repeated path-tile.png's OWN sky
 * strip mid-scroll, producing visible turquoise bands cutting across the
 * map):
 *   sky.png      — pinned at the very top only, never repeated.
 *   pathMid.png  — seamless-ish green (grass + side trees, no sky),
 *                  repeated vertically to cover any tree length. Each
 *                  repeat alternates a vertical mirror flip (see
 *                  SkillTreeBackground's MidBand) so the seam is pixel-
 *                  identical regardless of how seamless the source art
 *                  actually is.
 *   pathTile.png — the full park/garden scene (equipment, benches),
 *                  anchored at the BOTTOM only, never repeated — the
 *                  target node's destination.
 *
 * All three images share the same 1536×2752 native aspect ratio.
 */
export const PROGRESSION_MAP_SKY_IMAGE = '/images/progression-map/sky.png';
export const PROGRESSION_MAP_PATH_MID_IMAGE = '/images/progression-map/path-mid.png';
export const PROGRESSION_MAP_PATH_TILE_IMAGE = '/images/progression-map/path-tile.png';
export const PROGRESSION_MAP_BG_NATIVE_ASPECT = 1536 / 2752;
