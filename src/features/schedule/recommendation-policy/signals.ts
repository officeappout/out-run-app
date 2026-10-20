/**
 * Recommendation policy — raw onboarding / profile values → normalized signals.
 * Pure. Every id below is one the app already writes (no invented goals):
 *
 *  - persona goal chips (utils/persona-goals.ts): routine, aesthetics, fitness, performance,
 *    skills, community; run chips run_distance, run_pace
 *  - program-path cards (onboarding_program_path): health, body_focus, skills
 *  - muscle focus (onboarding_muscle_focus): core ("בטן וליבה"), glutes, …
 *  - profile.core.mainGoal: healthy_lifestyle, performance_boost, weight_loss, skill_mastery
 *  - profile.selectedGoals (legacy): glutes_abs, skills, mass_building, fat_loss
 *  - personas (types/persona.types.ts): vatikim = seniors, pro_athlete = extreme athletes
 *  - running answers: abilityTier none | 5_15 | 15_30 | 30_45 | 45_plus, goalPath,
 *    paceInputSeconds (improve_time), paceProfile.profileType 1–4
 */
import type { PolicyAudience, PolicyGoal, RunBand } from './types';

/** Raw goal id (any of the vocabularies above) → policy goal. Unknown ids are ignored. */
export const GOAL_ID_MAP: Readonly<Record<string, PolicyGoal>> = {
  // persona goal chips
  routine: 'health',
  fitness: 'health',
  community: 'health',
  aesthetics: 'muscle',
  performance: 'performance',
  skills: 'skills',
  run_distance: 'performance',
  run_pace: 'performance',
  // program-path cards
  health: 'health',
  body_focus: 'muscle',
  // muscle focus
  core: 'core_abs',
  abs: 'core_abs',
  // profile.core.mainGoal
  healthy_lifestyle: 'health',
  performance_boost: 'performance',
  weight_loss: 'fat_loss',
  skill_mastery: 'skills',
  // profile.selectedGoals (legacy)
  glutes_abs: 'core_abs',
  mass_building: 'muscle',
  fat_loss: 'fat_loss',
};

export function normalizeGoals(raw: ReadonlyArray<string | null | undefined>): PolicyGoal[] {
  const out: PolicyGoal[] = [];
  for (const id of raw) {
    const g = id ? GOAL_ID_MAP[id.trim().toLowerCase()] : undefined;
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

export const SENIOR_PERSONAS = ['vatikim'] as const;
export const ATHLETE_PERSONAS = ['pro_athlete'] as const;
export const SENIOR_MIN_AGE = 60;

export function resolveAudience(personaIds: ReadonlyArray<string>, age?: number | null): PolicyAudience {
  if (personaIds.some((p) => (SENIOR_PERSONAS as readonly string[]).includes(p))) return 'senior';
  if (typeof age === 'number' && age >= SENIOR_MIN_AGE) return 'senior';
  if (personaIds.some((p) => (ATHLETE_PERSONAS as readonly string[]).includes(p))) return 'athlete';
  return 'general';
}

/** Under this pace (sec/km) an improve-time runner counts as advanced (= profileType 1, "<6:00/km"). */
export const ADVANCED_PACE_SEC_PER_KM = 360;

const DIST_KM: Readonly<Record<string, number>> = { '2k': 2, '3k': 3, '5k': 5, '10k': 10, half: 21.1, marathon: 42.2 };

export interface RunBandInput {
  abilityTier?: unknown;
  goalPath?: unknown;
  targetDistance?: unknown;
  /** Time for targetDistance (improve_time path). */
  paceInputSeconds?: unknown;
  /** profile.running.paceProfile.profileType when the plan exists. */
  profileType?: unknown;
}

/**
 * Running ability band:
 *  beginner     — can't run yet / 5–15 min (or "start running" with no tier), profileType 3
 *  intermediate — 15+ min continuous, maintain / improve paths, profileType 2 / 4
 *  advanced     — improve-time runner under 6:00/km, profileType 1
 */
export function runBandOf(i: RunBandInput): RunBand {
  if (i.profileType === 1) return 'advanced';
  if (i.profileType === 3) return 'beginner';
  if (i.profileType === 2 || i.profileType === 4) return 'intermediate';
  const tier = i.abilityTier;
  if (tier === 'none' || tier === '5_15') return 'beginner';
  if (i.goalPath === 'improve_time' && typeof i.paceInputSeconds === 'number' && i.paceInputSeconds > 0) {
    const km = DIST_KM[String(i.targetDistance ?? '5k')] ?? 5;
    if (i.paceInputSeconds / km < ADVANCED_PACE_SEC_PER_KM) return 'advanced';
  }
  if (tier == null && (i.goalPath ?? 'start_running') === 'start_running') return 'beginner';
  return 'intermediate';
}

/** Age in whole years from "YYYY-MM-DD" (null when missing / invalid). */
export function ageFromDob(dob: unknown, now: Date): number | null {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}
