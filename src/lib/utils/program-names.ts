/**
 * Static Hebrew display-name maps for programs and running goals.
 *
 * `PROGRAM_NAME_HE` was originally a private const in
 * `src/features/home/hooks/useProgramProgress.ts`. It is now a shared
 * utility so the partner finder filter pills (and any other surface that
 * needs to label a strength program) can render Hebrew names without
 * touching Firestore.
 *
 * `RUNNER_GOAL_HE` is new — it mirrors the `RunnerGoal` union from
 * `src/features/workout-engine/core/types/running.types.ts`:
 *   'couch_to_5k' | 'maintain_fitness' | 'improve_speed_10k'
 *   | 'improve_speed_5k' | 'improve_endurance'
 *
 * Both maps are intentionally string-keyed (not enum-typed) so callers
 * can do `PROGRAM_NAME_HE[templateId] ?? templateId` as a graceful
 * fallback when the CMS introduces a new program before the constant is
 * updated.
 */

export const PROGRAM_NAME_HE: Record<string, string> = {
  full_body: 'כל הגוף', fullbody: 'כל הגוף',
  upper_body: 'פלג גוף עליון', push: 'דחיפה', pushing: 'דחיפה',
  lower_body: 'רגליים', legs: 'רגליים',
  pull: 'משיכה', pulling: 'משיכה', calisthenics: 'קליסטניקס',
  running: 'ריצה', cardio: 'קרדיו',
  pilates: 'פילאטיס', yoga: 'יוגה',
  healthy_lifestyle: 'אורח חיים בריא', pull_up_pro: 'מתח מקצועי',
};

export const RUNNER_GOAL_HE: Record<string, string> = {
  couch_to_5k: 'התחלה מאפס',
  maintain_fitness: 'שמירה על כושר',
  improve_speed_10k: 'שיפור מהירות 10K',
  improve_speed_5k: 'שיפור מהירות 5K',
  improve_endurance: 'שיפור סיבולת',
};
