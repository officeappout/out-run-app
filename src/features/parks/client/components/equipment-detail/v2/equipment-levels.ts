/**
 * "תרגילים לפי רמה" for one park machine (pure): the catalog exercises whose
 * execution method uses this gym-equipment id (`equipmentIds`, or the legacy
 * `equipmentId`), lowest level first, with the exercise page's thumbnail.
 * Fewer than MIN_LEVEL_ITEMS → [] and the drawer omits the section — one
 * exercise is not a set of levels / variations.
 */

import { pickText } from '@/lib/i18n/core/i18n-core';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { resolveExerciseThumbnail } from '@/features/content/exercises/client/components/detail-v2/exercise-thumbnail';

export const MIN_LEVEL_ITEMS = 2;
export const MAX_LEVEL_ITEMS = 8;
/** Warm-up / cool-down / recovery rows aren't variations of the machine. */
const SKIPPED_ROLES = new Set(['warmup', 'cooldown', 'recovery']);

export interface EquipmentLevelItem {
  id: string;
  name: string;
  /** 0 = unknown (sorted last, shown without a number). */
  level: number;
  thumb: string;
  /** The program that level belongs to (targetPrograms[0]), when set. */
  programId?: string;
}

function methodsOf(ex: Exercise): ExecutionMethod[] {
  return ((ex as { execution_methods?: ExecutionMethod[] }).execution_methods ?? ex.executionMethods ?? []) as ExecutionMethod[];
}

export function usesEquipment(ex: Exercise, equipmentId: string): boolean {
  return methodsOf(ex).some((m) => m?.equipmentIds?.includes(equipmentId) || m?.equipmentId === equipmentId);
}

/** The exercise's level — same formula as the exercise page's getExerciseLevel. */
export function exerciseLevelOf(ex: Exercise): number {
  const fromTarget = ex.targetPrograms?.[0]?.level;
  if (typeof fromTarget === 'number') return fromTarget;
  return typeof ex.recommendedLevel === 'number' ? ex.recommendedLevel : 0;
}

export function equipmentLevelItems(
  catalog: readonly Exercise[],
  equipmentId: string,
  locale: string,
  location: string = 'park',
): EquipmentLevelItem[] {
  const seen = new Set<string>();
  const items: EquipmentLevelItem[] = [];
  for (const ex of catalog) {
    if (!ex?.id || seen.has(ex.id)) continue;
    if (ex.exerciseRole && SKIPPED_ROLES.has(ex.exerciseRole)) continue;
    if (!usesEquipment(ex, equipmentId)) continue;
    const name = pickText(ex.name as never, locale).trim();
    if (!name) continue;
    seen.add(ex.id);
    const programId = ex.targetPrograms?.[0]?.programId;
    items.push({ id: ex.id, name, level: exerciseLevelOf(ex), thumb: resolveExerciseThumbnail(ex, location), ...(programId ? { programId } : {}) });
  }
  if (items.length < MIN_LEVEL_ITEMS) return [];
  const rank = (l: number) => (l > 0 ? l : Number.MAX_SAFE_INTEGER);
  return items
    .sort((a, b) => rank(a.level) - rank(b.level) || a.name.localeCompare(b.name, locale))
    .slice(0, MAX_LEVEL_ITEMS);
}

// ── "תרגילים ברמה שלך" (camera scan boards, enable_equipment_scan_v1) ──────────────────────────

/** The machine's program: the one most of its exercises belong to (ties: first seen). */
export function mainProgramOf(items: readonly EquipmentLevelItem[]): string | null {
  const counts = new Map<string, number>();
  for (const it of items) if (it.programId) counts.set(it.programId, (counts.get(it.programId) ?? 0) + 1);
  let best: string | null = null;
  for (const [id, n] of Array.from(counts)) if (best === null || n > (counts.get(best) ?? 0)) best = id;
  return best;
}

export type PersonalLevelState = 'completed' | 'current' | 'locked';

export interface PersonalLevelItem extends EquipmentLevelItem {
  state: PersonalLevelState;
}

/**
 * The strip at the user's level: everything up to their level is open, the highest open one is
 * "שלך" (current), above it locked. An unknown level (0) is never locked. null when the user has
 * no level in the machine's program: the drawer then shows the beginner state (easiest first,
 * no marks, the strength-quiz row).
 */
export function personalLevelItems(items: readonly EquipmentLevelItem[], userLevel: number | null): PersonalLevelItem[] | null {
  if (userLevel == null) return null;
  const open = items.filter((i) => i.level > 0 && i.level <= userLevel);
  const currentId = open.length ? open[open.length - 1].id : null;
  return items.map((i) => ({
    ...i,
    state: i.id === currentId ? 'current' : i.level > userLevel ? 'locked' : 'completed',
  }));
}

/** The strength-quiz domain for a machine with no user level: its program when it is one of the
 *  four categories, else from the movement pattern. */
export function quizDomainFor(programId: string | null, movementPattern: string | null | undefined): 'push' | 'pull' | 'legs' | 'core' {
  if (programId === 'push' || programId === 'pull' || programId === 'legs' || programId === 'core') return programId;
  switch (movementPattern) {
    case 'vertical_pull':
    case 'horizontal_pull':
      return 'pull';
    case 'squat':
    case 'hinge':
      return 'legs';
    case 'core':
      return 'core';
    default:
      return 'push';
  }
}
