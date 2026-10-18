/**
 * The REAL workout engine as the eval runner's generate_workout simulator — hermetic, on the
 * frozen content corpus of the workout invariants gate (tests/invariants/fixtures), never
 * live Firestore. Only loadable with the invariants tsconfig, whose `paths` swap the
 * Firestore-reading content services for fixture replays:
 *
 *   node --env-file=.env.local ./node_modules/.bin/tsx --tsconfig tests/invariants/tsconfig.json \
 *     scripts/ai-coach-evals.ts --generator offline [--live]
 *
 * (.env.local is only needed so the client firebase graph initializes; see
 * tests/invariants/README.md.) Use it to catch ENGINE regressions (too few exercises on a
 * short home workout, off-domain exercises); the default stub isolates the model instead.
 */
import { generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import { buildGenerateOptions, compactWorkout } from '@/features/ai-coach/services/workout-tool.pure';
import { buildMockProfile } from '../../tests/invariants/profile-factory';
import type { SimulateWorkout } from '@/lib/ai/review/eval-runner';

export const offlineWorkoutGenerator: SimulateWorkout = async (input, ctx) => {
  const programs = Array.isArray((ctx.sheet as { programs?: unknown } | undefined)?.programs)
    ? ((ctx.sheet as { programs: Array<{ level?: number }> }).programs)
    : [];
  const level = Math.max(1, ...programs.map((p) => (typeof p.level === 'number' ? p.level : 1)));
  const profile = buildMockProfile({ level, persona: '', injuries: [], domainLevels: { push: level, pull: level, legs: level, core: level } });
  const { workout } = await generateHomeWorkout(buildGenerateOptions(input, profile, {}, undefined));
  if (workout.needsAssessment) return { outcome: { ok: false, error: 'needs_assessment', domains: workout.assessmentDomains ?? [] }, record: null };
  if (!workout.exercises?.length) return { outcome: { ok: false, error: 'generation_failed' }, record: null };
  const nameOf = (ex: (typeof workout.exercises)[number]) => getLocalizedText(ex.exercise?.name as never) || '';
  const workoutId = `ai-offline-${input.location}-${input.durationMin}`;
  const result = compactWorkout(workoutId, input.location, workout, nameOf);
  const main = workout.exercises.filter((e) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
  const exercises = main.map((e) => {
    const m = e.method as { location?: string; locationMapping?: string[] } | undefined;
    const mg = (e.exercise as { movementGroup?: string | null }).movementGroup ?? '';
    return {
      name: nameOf(e),
      domain: MG_TO_DOMAIN[mg] ?? null,
      locations: m?.locationMapping?.length ? m.locationMapping : m?.location ? [m.location] : null,
    };
  });
  const reasons = (workout as { decisionRecord?: { reasons?: unknown } }).decisionRecord?.reasons ?? [];
  return { outcome: { ok: true, result }, record: { ...result, exercises, decisionRecord: { reasons } } };
};
