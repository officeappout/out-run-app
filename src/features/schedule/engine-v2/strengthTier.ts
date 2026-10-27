/**
 * Strength tier (owner 27.10.2026): every strength session is "hard" or "light", set by the
 * engine, never asked. Light = a light program (core, handstand, mobility) or a short session
 * (≤ LIGHT_STRENGTH_MAX_MINUTES), never heavy legs or a hard skill. Hard = everything else
 * (the full program workout). Light sessions combine almost anywhere: next to a run, on the
 * long-run day, the day after a hard session. Hard sessions keep every rule.
 */
import { HEAVY_LEGS, SKILL_CNS } from './programProfiles';
import type { Unit } from './units';

export type StrengthTier = 'hard' | 'light';

/** A strength session this short (minutes) counts as light. */
export const LIGHT_STRENGTH_MAX_MINUTES = 20;
/** Recovery a light session needs from a same-pattern session (hours): the next day is fine. */
export const LIGHT_RECOVERY_HOURS = 24;

export function strengthTier(u: Unit): StrengthTier {
  if (u.load.legs >= HEAVY_LEGS || (u.isSkill && u.load.cns >= SKILL_CNS)) return 'hard';
  if (u.intensity === 'light') return 'light';
  return u.sessionMinutes !== undefined && u.sessionMinutes <= LIGHT_STRENGTH_MAX_MINUTES ? 'light' : 'hard';
}

export const isLightStrength = (u: Unit | null | undefined): boolean => !!u && u.kind === 'strength' && strengthTier(u) === 'light';
