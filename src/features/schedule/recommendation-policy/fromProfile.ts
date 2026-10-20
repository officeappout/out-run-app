/**
 * Recommendation policy — signals from what the user already gave (profile + the
 * onboarding answers the caller read). Pure: callers read sessionStorage / stores and
 * pass plain values in.
 */
import { normalizeGoals, resolveAudience, runBandOf, type RunBandInput } from './signals';
import type { PolicySignals, TrackMix } from './types';

type Leveled = { currentLevel?: number; level?: number } | null | undefined;

const NON_STRENGTH = new Set(['running', 'flexibility']);

/** The categories the split level is averaged over (owner 20.10.2026). */
export const SPLIT_LEVEL_DOMAINS = ['push', 'pull', 'legs'] as const;

const levelOf = (v: Leveled): number => {
  const l = v?.currentLevel ?? v?.level ?? 0;
  return typeof l === 'number' && Number.isFinite(l) && l > 0 ? l : 0;
};

/**
 * The level the split is chosen by (owner 20.10.2026): the AVERAGE of push / pull /
 * legs, rounded down — not the max, so someone strong only in pull doesn't get an
 * advanced split. Each category = its track or domain level (the higher of the two);
 * missing categories are left out of the average. No push / pull / legs level at all
 * → the highest other strength level (running / flexibility excluded), as before.
 * null when nothing is assessed yet.
 */
export function strengthLevelOf(progression: { tracks?: Record<string, Leveled> | null; domains?: Record<string, Leveled> | null } | null | undefined): number | null {
  const tracks = progression?.tracks ?? {};
  const domains = progression?.domains ?? {};
  const split = SPLIT_LEVEL_DOMAINS.map((k) => Math.max(levelOf(tracks[k]), levelOf(domains[k]))).filter((l) => l > 0);
  if (split.length) return Math.max(1, Math.floor(split.reduce((s, l) => s + l, 0) / split.length));

  let best = 0;
  for (const obj of [tracks, domains]) {
    for (const [key, v] of Object.entries(obj)) {
      if (NON_STRENGTH.has(key) || v == null) continue;
      best = Math.max(best, levelOf(v));
    }
  }
  return best > 0 ? best : null;
}

/** "["health","skills"]" | "body_focus" | junk → card ids. */
export function parseIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];
  } catch {
    return [raw];
  }
}

export interface GoalSources {
  /** Onboarding store selectedGoalIds / selectedGoal. */
  storeGoalIds?: ReadonlyArray<string | null | undefined>;
  /** sessionStorage onboarding_program_path (raw). */
  programPathRaw?: unknown;
  /** sessionStorage onboarding_muscle_focus (raw). */
  muscleFocusRaw?: unknown;
  /** profile.core.mainGoal — 'healthy_lifestyle' is the sync's default, so it is ignored. */
  mainGoal?: unknown;
  /** profile.selectedGoals (legacy) / onboardingAnswers.allGoals. */
  profileGoalIds?: ReadonlyArray<string | null | undefined>;
}

export function collectGoalIds(s: GoalSources): string[] {
  const ids: string[] = [];
  for (const g of s.storeGoalIds ?? []) if (g) ids.push(g);
  ids.push(...parseIdList(s.programPathRaw));
  ids.push(...parseIdList(s.muscleFocusRaw));
  if (typeof s.mainGoal === 'string' && s.mainGoal !== 'healthy_lifestyle') ids.push(s.mainGoal);
  for (const g of s.profileGoalIds ?? []) if (g) ids.push(g);
  return ids;
}

export interface SignalsInput {
  tracks: TrackMix;
  strengthLevel: number | null;
  run?: RunBandInput | null;
  goalIds: ReadonlyArray<string>;
  personaIds: ReadonlyArray<string>;
  age?: number | null;
  hardSkillCount?: number;
  availableDays?: number | null;
  targetDistance?: string | null;
}

export function buildPolicySignals(i: SignalsInput): PolicySignals {
  return {
    tracks: i.tracks,
    strengthLevel: i.strengthLevel,
    runBand: i.tracks === 'strength' || !i.run ? null : runBandOf(i.run),
    goals: normalizeGoals(i.goalIds),
    audience: resolveAudience(i.personaIds, i.age),
    hardSkillCount: Math.max(0, i.hardSkillCount ?? 0),
    availableDays: i.availableDays ?? null,
    targetDistance: i.targetDistance ?? (typeof i.run?.targetDistance === 'string' ? i.run.targetDistance : null),
  };
}

/** "מוביליטי 10′ ×2 · ליבה 10′ ×2 בערב" → the add-on line (null when none). */
export function addOnsLineHe(addOns: ReadonlyArray<{ labelHe: string }>): string | null {
  return addOns.length ? `+ ${addOns.map((a) => a.labelHe).join(' · ')}` : null;
}
