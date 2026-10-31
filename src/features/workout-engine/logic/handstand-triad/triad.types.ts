/**
 * Handstand Triad — shared types. Pure.
 *
 * A handstand skill is split into three components that progress separately:
 * strength (S), balance (B) and shoulder mobility (M), each on the 1–15 scale
 * of the handstand program (free handstand enters around 11, 12–15 = endurance,
 * line, presses).
 *
 * - An exercise carries DEMAND scores: how much S / B / M it requires
 *   (`TargetProgramRef.strengthScore/balanceScore/mobilityScore`).
 * - A user carries LEVELS: how much S / B / M they can do.
 * The session is built from the gap between the two.
 */

export const TRIAD_AXES = ['strength', 'balance', 'mobility'] as const;
export type TriadAxis = (typeof TRIAD_AXES)[number];

/** 1–15 per axis. Used for both exercise demand and user level. */
export type TriadValues = Record<TriadAxis, number>;

export const TRIAD_MIN = 1;
export const TRIAD_MAX = 15;

/** Block kinds of the handstand session skeleton (from the 42 legacy workouts). */
export type TriadBlockKind = 'warmup' | 'mobility' | 'balance' | 'strength' | 'line' | 'cooldown';

export interface TriadBlock {
  kind: TriadBlockKind;
  /** Axis the block trains and selects by; absent for the fixed warmup/cooldown. */
  axis?: TriadAxis;
  /** Exercises to pick for this block. */
  slots: number;
  /** Sets per exercise. */
  sets: number;
  /** Why the block got extra / maintenance volume (for the "why" line and QA). */
  emphasis?: 'weakest' | 'strongest';
}

/** 'session' = standalone handstand workout; 'block' = short insert inside another workout. */
export type TriadPlanMode = 'session' | 'block';
