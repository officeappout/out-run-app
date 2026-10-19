/**
 * Run workout "kind" — the 4 visual families the v2 preview / week list use
 * (easy · intervals · tempo · long), resolved from the template category
 * with a fallback from the blocks. Pure, no React.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { WorkoutCategory } from '../../../../core/types/running.types';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';

export type RunKind = 'easy' | 'interval' | 'tempo' | 'long';

/** Same buckets NextRunWorkoutCard uses (by effort shape, not by name). */
export const CATEGORY_TO_KIND: Record<WorkoutCategory, RunKind> = {
  easy_run: 'easy',
  strides: 'easy',
  fartlek_easy: 'easy',
  short_intervals: 'interval',
  long_intervals: 'interval',
  fartlek_structured: 'interval',
  hill_short: 'interval',
  hill_sprints: 'interval',
  tempo: 'tempo',
  hill_long: 'tempo',
  long_run: 'long',
};

/**
 * Colours follow the approved flows palette (runcanvas NOTES "One palette on
 * every board": fast reps #e5484d, tempo #f97316, easy #84cc16) — the same
 * one the v2 live player paints its bars with (V2_BLOCK_COLORS), so the
 * preview and the player never disagree. `text` is the darker shade for
 * labels on white; `tint` the 13% fill behind the icon.
 */
export const RUN_KIND_STYLE: Record<RunKind, { color: string; text: string; tint: string; label: string }> = {
  easy: { color: '#84cc16', text: '#65a30d', tint: '#84cc1622', label: 'ריצה קלה' },
  interval: { color: '#e5484d', text: '#c0392b', tint: '#e5484d1f', label: 'אינטרוולים' },
  tempo: { color: '#f97316', text: '#c2410c', tint: '#f9731622', label: 'טמפו' },
  long: { color: '#a3d96b', text: '#65a30d', tint: '#a3d96b2e', label: 'ריצה ארוכה' },
};

export function isWorkoutCategory(raw: unknown): raw is WorkoutCategory {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_TO_KIND, raw);
}

/**
 * The category the drawer shows: the materialized workout's own first
 * (calm return rewrites it to easy_run), then the template's (the beginner
 * walk/run path drops it). Unknown strings → null.
 */
export function resolveRunCategory(
  workoutCategory: string | null | undefined,
  templateCategory?: string | null,
): WorkoutCategory | null {
  if (isWorkoutCategory(workoutCategory)) return workoutCategory;
  if (isWorkoutCategory(templateCategory)) return templateCategory;
  return null;
}

const FAST_ZONES = new Set(['interval_short', 'interval_long', 'sprint', 'fartlek_fast']);
const TEMPO_ZONES = new Set(['tempo', 'fartlek_medium']);

/** Kind from the category, else from the blocks (fast reps → intervals, tempo zone → tempo, ≥ 60′ or long zone → long). */
export function inferRunKind(category: WorkoutCategory | null | undefined, blocks: readonly RunBlock[] = []): RunKind {
  if (category) return CATEGORY_TO_KIND[category];
  const core = blocks.filter((b) => !b._isDynamicWrapper && !b._isSynthesizedRest && b.type !== 'warmup' && b.type !== 'cooldown');
  if (core.some((b) => b.type === 'interval' || (b.zoneType && FAST_ZONES.has(b.zoneType)))) return 'interval';
  if (core.some((b) => b.zoneType && TEMPO_ZONES.has(b.zoneType))) return 'tempo';
  const seconds = blocks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);
  if (core.some((b) => b.zoneType === 'long_run') || seconds >= 60 * 60) return 'long';
  return 'easy';
}

/** "אינטרוולים קצרים" from the category, else the kind's generic label. */
export function runTypeLabel(category: WorkoutCategory | null | undefined, kind: RunKind): string {
  return (category && RUNNING_WORKOUT_CATEGORY_LABELS_HE[category]) || RUN_KIND_STYLE[kind].label;
}
