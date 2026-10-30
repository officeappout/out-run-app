/**
 * Strength workout tutorial (enable_workout_tutorial_v1, pilot S2). Pure decisions; the
 * components in this folder render them with the shared CoachMarks / v2 primitives.
 *   overview → two "entry" bubbles on the warm-up / main section headers, once per user
 *   player   → a short phase card when the warm-up starts and when the main part starts
 *   player   → the equipment sheet at the start of a workout that needs gear ("don't show again")
 *   player   → one bubble on the first reps / time input ever
 * Seen-once flags live in onboardingPrefs, keyed by uid ("skip" counts as seen).
 */

export const COACH_WARMUP = 'wt-warmup';
export const COACH_MAIN = 'wt-main';
export const COACH_INPUT = 'wt-input';

export const overviewTourSeenKey = (uid: string | null | undefined) => `workout_tutorial_overview_seen:${uid || 'anon'}`;
export const inputTourSeenKey = (uid: string | null | undefined) => `workout_tutorial_input_seen:${uid || 'anon'}`;
export const equipmentSheetHiddenKey = (uid: string | null | undefined) => `workout_tutorial_equipment_hidden:${uid || 'anon'}`;

export type WorkoutPhase = 'warmup' | 'main';
type Role = string | null | undefined;

/** The phase card to show when the active exercise's role changes, or null. */
export function phaseCardFor(prev: Role, next: Role): WorkoutPhase | null {
  if (!prev && next === 'warmup') return 'warmup';
  if (prev === 'warmup' && next === 'main') return 'main';
  return null;
}

/** Unique gear ids the workout's main exercises need (warm-up / cool-down gear is assumed). */
export function workoutEquipmentIds(
  segments: ReadonlyArray<{ exercises?: ReadonlyArray<{ equipment?: string[]; exerciseRole?: string }> }>,
): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    for (const ex of seg.exercises ?? []) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      for (const id of ex.equipment ?? []) if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Arm the equipment sheet? Only on a fresh start of the first set, never resumed or embedded. */
export function shouldArmEquipmentSheet(i: {
  enabled: boolean;
  hidden: boolean;
  gearCount: number;
  workoutState: string;
  segmentIndex: number;
  exerciseIndex: number;
  resumed: boolean;
}): boolean {
  return i.enabled && !i.hidden && i.gearCount > 0 && !i.resumed
    && i.workoutState === 'PREPARING' && i.segmentIndex === 0 && i.exerciseIndex === 0;
}
