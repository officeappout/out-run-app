import type { PresenceEntry } from './types';

/**
 * Head-to-head "race bar" maths (me vs the person I picked on the rail):
 * distance gap and pace gap. Positive gapKm = I'm ahead.
 */
export interface RaceView {
  /** Positions on the bar, 0..1, relative to the larger of the two distances. */
  meFrac: number;
  themFrac: number;
  gapKm: number;
  /** Pace gap in sec/km (negative = I'm faster); null when either pace is unknown. */
  paceGapSec: number | null;
  leader: 'me' | 'them' | 'even';
}

/** Within 10 m counts as even. */
const EVEN_KM = 0.01;

export function computeRace(me: Pick<PresenceEntry, 'distanceKm' | 'paceSecPerKm'>, them: Pick<PresenceEntry, 'distanceKm' | 'paceSecPerKm'>): RaceView {
  const a = Math.max(0, me.distanceKm ?? 0);
  const b = Math.max(0, them.distanceKm ?? 0);
  const max = Math.max(a, b, 0.0001);
  const gapKm = a - b;
  const pm = me.paceSecPerKm && me.paceSecPerKm > 0 ? me.paceSecPerKm : null;
  const pt = them.paceSecPerKm && them.paceSecPerKm > 0 ? them.paceSecPerKm : null;
  return {
    meFrac: a / max,
    themFrac: b / max,
    gapKm,
    paceGapSec: pm != null && pt != null ? Math.round(pm - pt) : null,
    leader: Math.abs(gapKm) < EVEN_KM ? 'even' : gapKm > 0 ? 'me' : 'them',
  };
}
