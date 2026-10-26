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
    items.push({ id: ex.id, name, level: exerciseLevelOf(ex), thumb: resolveExerciseThumbnail(ex, location) });
  }
  if (items.length < MIN_LEVEL_ITEMS) return [];
  const rank = (l: number) => (l > 0 ? l : Number.MAX_SAFE_INTEGER);
  return items
    .sort((a, b) => rank(a.level) - rank(b.level) || a.name.localeCompare(b.name, locale))
    .slice(0, MAX_LEVEL_ITEMS);
}
