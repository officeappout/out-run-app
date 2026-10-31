/**
 * The combo generator's ONE composition request (vision stage 2, enable_combo_generator_v1).
 * PURE. What the user (or the recommendation) asks for: an aerobic part, a strength part, their
 * order, ONE place for the whole workout, the time, and optionally a second part later in the day.
 *
 *   order 'aerobic_first'   walk / run, then the strength part (tabata / core / sets / timed)
 *   order 'strength_first'  the strength part, then walk / run
 *   order 'inside'          the run sits INSIDE every round (amrap_combo / emom_combo)
 *
 * Owner rule (30.10.2026): AMRAP / EMOM with a run inside only from level 8 in BOTH pull and push.
 * Below that (or unassessed) it is never offered: the request is normalized to "run first, then the
 * timed block without the run", and says why.
 */

export type ComboAerobic = 'walk' | 'run' | 'none';
export type ComboStrength = 'sets' | 'tabata' | 'core' | 'amrap' | 'emom' | 'none';
export type ComboOrder = 'aerobic_first' | 'strength_first' | 'inside';
export type ComboPlace = 'home' | 'park';

export interface ComboSecondPart {
  strength: Exclude<ComboStrength, 'none'>;
  /** The time the user picked, "HH:MM". */
  at: string;
}

export interface ComboRequest {
  aerobic: ComboAerobic;
  strength: ComboStrength;
  order: ComboOrder;
  place: ComboPlace;
  /** Total minutes of the (first part of the) workout. */
  timeMin: number;
  secondPart?: ComboSecondPart;
  /** AMRAP variant (owner 31.10): a run outdoors (order 'inside'), strength only, or cardio moves. */
  amrapVariant?: 'run' | 'strength' | 'cardio';
}

export interface ComboLevels {
  push?: number;
  pull?: number;
}

export const AMRAP_RUN_MIN_LEVEL = 8;
export const COMBO_MIN_TIME = 10;
export const COMBO_MAX_TIME = 90;

/** Owner gate: level ≥ 8 in BOTH pull and push (an unassessed domain = not allowed). */
export function amrapWithRunAllowed(levels: ComboLevels): boolean {
  return (levels.push ?? 0) >= AMRAP_RUN_MIN_LEVEL && (levels.pull ?? 0) >= AMRAP_RUN_MIN_LEVEL;
}

export type ComboAdjustment = 'run_inside_needs_level' | 'inside_needs_timed' | 'no_aerobic_for_inside' | 'time_clamped' | 'nothing_asked';

export interface NormalizedCombo {
  request: ComboRequest;
  /** Why the request was changed (empty = taken as asked). */
  adjustments: ComboAdjustment[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeComboRequest(req: ComboRequest, levels: ComboLevels): NormalizedCombo {
  const adjustments: ComboAdjustment[] = [];
  let r: ComboRequest = { ...req };
  if (r.aerobic === 'none' && r.strength === 'none') {
    adjustments.push('nothing_asked');
    r = { ...r, aerobic: 'walk', order: 'aerobic_first' };
  }
  const time = Math.round(Number.isFinite(r.timeMin) ? r.timeMin : COMBO_MIN_TIME);
  const clamped = Math.max(COMBO_MIN_TIME, Math.min(COMBO_MAX_TIME, time));
  if (clamped !== r.timeMin) adjustments.push('time_clamped');
  r.timeMin = clamped;
  if (r.order === 'inside') {
    if (r.aerobic === 'none') {
      adjustments.push('no_aerobic_for_inside');
      r.order = 'strength_first';
    } else if (r.strength !== 'amrap' && r.strength !== 'emom') {
      adjustments.push('inside_needs_timed');
      r.order = 'aerobic_first';
    } else if (!amrapWithRunAllowed(levels)) {
      adjustments.push('run_inside_needs_level');
      r.order = 'aerobic_first';
    }
  }
  if (r.secondPart && !HHMM.test(r.secondPart.at)) r = { ...r, secondPart: undefined };
  return { request: r, adjustments };
}

export interface ComboTimeSplit {
  aerobicMin: number;
  strengthMin: number;
}

/** Fixed short finishers; the rest of the time goes to the other part. */
const FINISHER_MIN: Partial<Record<ComboStrength, number>> = { tabata: 4, core: 8 };

/** Minutes for each part (inside-order: the whole time is one timed block). */
export function comboTimeSplit(r: ComboRequest): ComboTimeSplit {
  if (r.strength === 'none') return { aerobicMin: r.timeMin, strengthMin: 0 };
  if (r.aerobic === 'none' || r.order === 'inside') return { aerobicMin: 0, strengthMin: r.timeMin };
  const fixed = FINISHER_MIN[r.strength];
  const strengthMin = fixed ?? Math.round(r.timeMin * 0.45);
  return { aerobicMin: Math.max(5, r.timeMin - strengthMin), strengthMin };
}
