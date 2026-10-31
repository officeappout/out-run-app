/**
 * amrap_combo / emom_combo blocks (vision stage 2): a run INSIDE every round, as the existing timed
 * engine already runs it (RoundItem 'aerobic_leg', AMRAP / EMOM machines, useRunLegGps, results
 * `aerobicLegs`). PURE: exercises in, protocol config out; the caller puts the exercises on the
 * segment too (timed-spec looks round items up by exerciseId there).
 */

import type { AmrapProtocolConfig, EmomProtocolConfig, RoundItem } from '../../core/types/protocol.types';

export interface ComboMember {
  exerciseId: string;
  targetReps?: number;
  targetHoldSec?: number;
}

/** Run per round: 400 m (owner example); a walk round is 200 m. */
export function comboLegMeters(aerobic: 'walk' | 'run'): number {
  return aerobic === 'run' ? 400 : 200;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
export const COMBO_CAP_MIN = { min: 8, max: 24 } as const;

function memberItem(m: ComboMember): RoundItem {
  return {
    kind: 'exercise',
    exerciseId: m.exerciseId,
    ...(m.targetReps ? { targetReps: m.targetReps } : {}),
    ...(m.targetHoldSec ? { targetHoldSec: m.targetHoldSec } : {}),
  };
}

/** AMRAP: each round = the run, then every member once. Cap 8-24 min. */
export function amrapComboConfig(i: { legMeters: number; members: readonly ComboMember[]; minutes: number }): AmrapProtocolConfig | null {
  if (i.members.length === 0 || !(i.legMeters > 0)) return null;
  return {
    capSec: clamp(i.minutes, COMBO_CAP_MIN.min, COMBO_CAP_MIN.max) * 60,
    roundItems: [{ kind: 'aerobic_leg', distanceM: i.legMeters }, ...i.members.map(memberItem)],
  };
}

/**
 * EMOM: the minutes alternate, a run minute then a member minute (run, A, run, B, ...), so every
 * member gets a run before it. Intervals = the minutes (even, 8-24); 2-minute intervals for the run
 * when the leg is a full 400 m (a minute is too short for most).
 */
export function emomComboConfig(i: { legMeters: number; members: readonly ComboMember[]; minutes: number }): EmomProtocolConfig | null {
  if (i.members.length === 0 || !(i.legMeters > 0)) return null;
  const minutes = clamp(i.minutes, COMBO_CAP_MIN.min, COMBO_CAP_MIN.max);
  const intervalSec = i.legMeters >= 400 ? 120 : 60;
  const totalIntervals = Math.max(2, Math.floor((minutes * 60) / intervalSec / 2) * 2);
  const targets: RoundItem[] = i.members.flatMap((m) => [{ kind: 'aerobic_leg' as const, distanceM: i.legMeters }, memberItem(m)]);
  return { intervalSec, totalIntervals, targets };
}
