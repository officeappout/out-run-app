/**
 * Route + stops sheet model (enable_feature_info_sheets_v1, board StopsCard v111, owner
 * approved 29.10): the "i" next to the route + stops overview title explains walk → strength
 * station → walk on. PURE. Built from the overview's own legs (buildHybridLegs) and the plan's
 * segments: the walk leg into the first real station, that station (its exercises), and the
 * last walk leg after it. A route with no usable station (none, locked behind the
 * questionnaire, or empty) or no walk into it → no "i". No walk after the station → the demo
 * ends at the station.
 */

import type { AerobicLeg, OverviewLeg } from '@/features/parks/core/components/overview/overview-legs';

/** The slice of a plan segment the model reads. */
export interface StopsSegmentInput {
  kind: 'aerobic' | 'strength';
  content?: { exercises?: readonly unknown[]; needsAssessment?: unknown } | null;
}

export interface StopsInfoModel {
  walkTo: AerobicLeg;
  /** The station's segment index (its exercises live there). */
  stationRef: number;
  stationDurationSec?: number;
  walkBack: AerobicLeg | null;
}

export function buildStopsInfo(legs: readonly OverviewLeg[], segments: readonly StopsSegmentInput[]): StopsInfoModel | null {
  const stationIdx = legs.findIndex((l) => {
    if (l.kind !== 'station') return false;
    const seg = segments[l.ref];
    return !!seg && seg.kind === 'strength' && !seg.content?.needsAssessment && (seg.content?.exercises?.length ?? 0) > 0;
  });
  if (stationIdx < 0) return null;
  const station = legs[stationIdx];
  if (station.kind !== 'station') return null;
  const before = legs.slice(0, stationIdx).filter((l): l is AerobicLeg => l.kind === 'aerobic');
  const after = legs.slice(stationIdx + 1).filter((l): l is AerobicLeg => l.kind === 'aerobic');
  const walkTo = before[before.length - 1];
  if (!walkTo) return null;
  return {
    walkTo,
    stationRef: station.ref,
    stationDurationSec: station.durationSec,
    walkBack: after[after.length - 1] ?? null,
  };
}

export type StopsPhase = 'walk' | 'peek' | 'station' | 'back';

/** The demo loop (~14s, board StopsCard): walk lit → the sheet drops → station → walk back. */
export function stopsPhases(m: StopsInfoModel, reduced: boolean): { phase: StopsPhase; ms: number }[] {
  const phases: { phase: StopsPhase; ms: number }[] = [
    { phase: 'walk', ms: 3600 },
    ...(reduced ? [] : [{ phase: 'peek' as const, ms: 5000 }]),
    { phase: 'station', ms: 3800 },
  ];
  if (m.walkBack) phases.push({ phase: 'back', ms: 1800 });
  return phases;
}
