/**
 * warmup-guide-focus.utils — which follow-along joint-rotation warm-up VIDEO(s) a workout gets. PURE.
 *
 * Owner decision 26.10.2026: the warm-up guide follows the workout's body focus —
 *   upper-body workout → the upper / general joint-rotation video
 *   lower-body workout → the lower-body joint-rotation video
 *   full-body workout  → BOTH, upper/general first, then lower.
 *
 * Workout focus comes from the main exercises' movementGroup (push/pull → upper, squat/hinge/
 * lunge → lower), falling back to their muscleGroups when the movementGroup says nothing
 * (core / flexibility / unknown). A guide's focus comes from its `warmup_upper` /
 * `warmup_lower` tag, else from its muscleGroups (lower-only muscles → lower; anything else is
 * upper / general — the original "חימום פלג גוף עליון" guide carries no tag).
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

export type BodyFocus = 'upper' | 'lower' | 'full';
type GuideFocus = 'upper' | 'lower';

export const WARMUP_UPPER_TAG = 'warmup_upper';
export const WARMUP_LOWER_TAG = 'warmup_lower';
/** The cool-down stretch videos use the same rule with their own tags (cooldown-guide.utils). */
export const COOLDOWN_UPPER_TAG = 'cooldown_upper';
export const COOLDOWN_LOWER_TAG = 'cooldown_lower';

/** Which tags mark a guide as upper / lower. Defaults to the warm-up tags. */
export interface GuideFocusTags { upper: string; lower: string }
const WARMUP_TAGS: GuideFocusTags = { upper: WARMUP_UPPER_TAG, lower: WARMUP_LOWER_TAG };
export const COOLDOWN_GUIDE_TAGS: GuideFocusTags = { upper: COOLDOWN_UPPER_TAG, lower: COOLDOWN_LOWER_TAG };

const UPPER_MGS = new Set(['vertical_pull', 'horizontal_pull', 'vertical_push', 'horizontal_push']);
const LOWER_MGS = new Set(['squat', 'hinge', 'lunge']);
const UPPER_MUSCLES = new Set([
  'chest', 'back', 'middle_back', 'shoulders', 'rear_delt', 'forearms', 'biceps', 'triceps', 'traps', 'serratus',
]);
const LOWER_MUSCLES = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'legs', 'adductors', 'hip_flexors']);

type MaybeMuscled = Pick<Exercise, 'movementGroup'> & {
  muscleGroups?: readonly string[];
  primaryMuscle?: string | null;
  tags?: readonly string[];
};

function musclesOf(ex: MaybeMuscled): string[] {
  return [...(ex.muscleGroups ?? []), ...(ex.primaryMuscle ? [ex.primaryMuscle] : [])];
}

/** Upper / lower / both for one main exercise (empty when it is neither, e.g. pure core). */
function sidesOf(ex: MaybeMuscled): { upper: boolean; lower: boolean } {
  const mg = ex.movementGroup ?? '';
  if (UPPER_MGS.has(mg)) return { upper: true, lower: false };
  if (LOWER_MGS.has(mg)) return { upper: false, lower: true };
  const muscles = musclesOf(ex);
  return {
    upper: muscles.some((m) => UPPER_MUSCLES.has(m)),
    lower: muscles.some((m) => LOWER_MUSCLES.has(m)),
  };
}

/** The workout's body focus from its main exercises, or null when nothing says upper or lower. */
export function resolveWorkoutBodyFocus(mainExercises: readonly MaybeMuscled[]): BodyFocus | null {
  let upper = false;
  let lower = false;
  for (const ex of mainExercises) {
    const s = sidesOf(ex);
    upper ||= s.upper;
    lower ||= s.lower;
  }
  if (upper && lower) return 'full';
  if (lower) return 'lower';
  if (upper) return 'upper';
  return null;
}

/** A guide's own focus: tag first, then muscles; untagged / mixed → upper (general). */
export function warmupGuideFocus(guide: MaybeMuscled, focusTags: GuideFocusTags = WARMUP_TAGS): GuideFocus {
  const tags = guide.tags ?? [];
  if (tags.includes(focusTags.lower)) return 'lower';
  if (tags.includes(focusTags.upper)) return 'upper';
  const muscles = musclesOf(guide);
  const lower = muscles.some((m) => LOWER_MUSCLES.has(m));
  const upper = muscles.some((m) => UPPER_MUSCLES.has(m));
  return lower && !upper ? 'lower' : 'upper';
}

/**
 * Ordered candidate buckets — the caller picks ONE guide from each bucket, in order.
 * No focus, or no guide of the wanted focus → a single bucket of all guides (the pre-26.10
 * behaviour: exactly one guide). Full body → [upper, lower], skipping a side with no guide.
 */
export function planWarmupGuideBuckets<T extends MaybeMuscled>(
  guides: readonly T[],
  focus: BodyFocus | null,
  focusTags: GuideFocusTags = WARMUP_TAGS,
): T[][] {
  if (guides.length === 0) return [];
  const all = [...guides];
  if (focus === null) return [all];
  const upper = all.filter((g) => warmupGuideFocus(g, focusTags) === 'upper');
  const lower = all.filter((g) => warmupGuideFocus(g, focusTags) === 'lower');
  const wanted = focus === 'full' ? [upper, lower] : focus === 'upper' ? [upper] : [lower];
  const buckets = wanted.filter((b) => b.length > 0);
  return buckets.length > 0 ? buckets : [all];
}
