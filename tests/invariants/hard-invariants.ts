/**
 * hard-invariants.ts — the five product-level hard invariants for ANY generated
 * strength workout, whatever the entry point (home trio, builder, AI chat, park,
 * hybrid stop). Pure: takes the workout + what was asked, returns violations.
 *
 *   H1 gear truth        — home/office: every main/warm-up/cool-down method's REQUIRED
 *                          gear is gear the user owns (+ the assumed indoor fixtures
 *                          door/chair/wall/floor/towel). Same rule the engine itself
 *                          enforces since #404 (method-selection.utils.ts indoor gating),
 *                          re-implemented here as an independent oracle.
 *                          park: required gear ⊆ the park's resolved gear.
 *   H2 body-area focus   — strict requiredDomains (builder body-area chips, AI chat
 *                          domains): every MAIN exercise trains a requested area.
 *   H3 minimum count     — main exercises ≥ minMainFor(minutes): ≤10→3, ≤15→4 (the
 *                          #434 short-session rule), ≤25→4, >25→5 (coach sheets
 *                          "כל הגוף": 20 min = 4, 25 = 5, 30 = 6 exercises).
 *   H4 level band        — no main exercise more than +3 above the user's level in
 *                          its domain (`levelDelta`, the engine's own field).
 *   H5 no test items     — no exercise / method whose name marks it as a test or
 *                          a copy ("לבדיקה", "בדיקה", "test", "Copy of", "העתק").
 *
 * Shared by tests/invariants/runner.ts (group H), the hermetic vitest gate
 * (src/features/workout-engine/__tests__/invariants-gate.hermetic.test.ts) and the
 * entry-point bench (scripts/audit/build-entrypoints-bench.ts).
 */
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import {
  normalizeGearId, satisfiesGearRequirement, isGearOptional, ASSUMED_HOME_GEAR,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { collectMethodGear, MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';

export type HardId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5';
export const HARD_LABELS: Record<HardId, string> = {
  H1: 'gear truth', H2: 'body-area focus', H3: 'min main exercises for duration', H4: 'level ≤ user+3', H5: 'no test items',
};

export interface HardContext {
  location: string;
  /** Raw gear ids the user owns at this location (home/office) or the park's gear (park). */
  availableGear: string[];
  /** Strict requested body areas (push/pull/legs/core); undefined = no focus asked. */
  strictDomains?: string[];
  requestedMinutes: number;
  /** Skip H3 (rest/recovery workouts, needs-assessment, machine-only blocks). */
  skipCount?: boolean;
}
export interface Violation { id: HardId; detail: string }

const SURFACES = new Set(['mat', 'yoga_mat', 'wall', 'chair', 'bodyweight', 'none']);
const SKILL_PARENT: Record<string, string> = {
  planche: 'push', handstand_pushup: 'push', handstand: 'push', front_lever: 'pull', back_lever: 'pull',
  one_arm_pullup: 'pull', muscle_up: 'pull', human_flag: 'core',
};
const TEST_NAME = /לבדיקה|בדיקה|טסט|\btest\b|copy of|העתק/i;

const he = (t: unknown): string => (t == null ? '' : typeof t === 'string' ? t : ((t as { he?: string; en?: string }).he ?? (t as { en?: string }).en ?? ''));
export const exName = (e: WorkoutExercise) => he(e.exercise?.name);
export const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

/** push / pull / legs / core (skills folded to their base area), or null. */
export function baseDomainOf(e: WorkoutExercise): string | null {
  const mg = e.exercise?.movementGroup as string | undefined;
  const d = mg ? MG_TO_DOMAIN[mg] : undefined;
  if (!d) return null;
  return SKILL_PARENT[d] ?? d;
}

export function minMainFor(minutes: number): number {
  if (minutes <= 10) return 3;
  if (minutes <= 25) return 4;
  return 5;
}

/** Required (non-optional, non-surface) gear of the exercise's chosen method that `available` doesn't satisfy. */
export function missingGear(e: WorkoutExercise, ctx: HardContext): string[] {
  const m = e.method as Parameters<typeof collectMethodGear>[0] | undefined;
  if (!m) return [];
  const indoor = ctx.location === 'home' || ctx.location === 'office' || ctx.location === 'school';
  const avail = [...ctx.availableGear.map(normalizeGearId), ...(indoor ? Array.from(ASSUMED_HOME_GEAR).map(normalizeGearId) : [])];
  return collectMethodGear(m)
    .filter(id => !SURFACES.has(id) && !SURFACES.has(normalizeGearId(id)) && !isGearOptional(id))
    .filter(id => !satisfiesGearRequirement(normalizeGearId(id), avail));
}

export function checkHardInvariants(w: GeneratedWorkout, ctx: HardContext): Violation[] {
  const out: Violation[] = [];
  const main = w.exercises.filter(isMain);
  // H1 — gear truth (indoor + park; street/gym have no owned-gear contract)
  if (['home', 'office', 'school', 'park'].includes(ctx.location)) {
    for (const e of w.exercises) {
      const miss = missingGear(e, ctx);
      if (miss.length) out.push({ id: 'H1', detail: `${e.exerciseRole ?? 'main'} "${exName(e)}" needs [${miss.join(',')}]` });
    }
  }
  // H2 — body-area focus
  if (ctx.strictDomains?.length) {
    for (const e of main) {
      const d = baseDomainOf(e);
      if (!d || !ctx.strictDomains.includes(d)) out.push({ id: 'H2', detail: `"${exName(e)}" is ${d ?? e.exercise?.movementGroup} not [${ctx.strictDomains.join(',')}]` });
    }
  }
  // H3 — minimum count
  if (!ctx.skipCount && !w.isRecovery) {
    const need = minMainFor(ctx.requestedMinutes);
    if (main.length < need) out.push({ id: 'H3', detail: `${main.length} main < ${need} for ${ctx.requestedMinutes}min` });
  }
  // H4 — level band
  for (const e of main) {
    if (typeof e.levelDelta === 'number' && e.levelDelta > 3) out.push({ id: 'H4', detail: `"${exName(e)}" L${e.programLevel} = user+${e.levelDelta}` });
  }
  // H5 — test items
  for (const e of w.exercises) {
    const names = [exName(e), he(e.method?.methodName)];
    const hit = names.find(n => TEST_NAME.test(n));
    if (hit) out.push({ id: 'H5', detail: `${e.exerciseRole ?? 'main'} "${hit}"` });
  }
  return out;
}
