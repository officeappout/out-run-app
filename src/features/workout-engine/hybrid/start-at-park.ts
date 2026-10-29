/**
 * start-at-park: pilot M5 (enable_park_live_v2): a user who is already at the first park starts
 * at the stations, not with the walk leg. Pure; useStartAtPark applies it.
 *
 * Before: the first leg always started as a walk, and automatic arrival needs the leg ARMED
 * (one fix outside the radius first, G3.1 / arrival-detector), so a user standing in the park
 * had to tap "הגעתי" by hand.
 *
 * Rule: on the session's first leg toward station 1, the first accurate fix inside the
 * existing approach radius (APPROACH_RADIUS_M: 56 m walking / 120 m running) opens the station.
 * Only once per session, and never after a fix outside that radius (then the user is walking
 * there and the normal arrival takes over).
 */
import { APPROACH_RADIUS_M, DEFAULT_ARRIVAL } from '../engines/hybrid/arrival-detector';

export interface StartAtParkInput {
  phase: string;
  isFinalLeg: boolean;
  nextStationNumber: number | null;
  aerobicType: 'walking' | 'running';
  /** Distance to the first station (m), null without a fix or coordinates. */
  distanceM: number | null;
  accuracyM: number | null;
  /** A fix outside the radius was already seen this session. */
  leftRadius: boolean;
}

export function startAtParkRadiusM(aerobicType: 'walking' | 'running'): number {
  return APPROACH_RADIUS_M[aerobicType];
}

export function shouldStartAtPark(i: StartAtParkInput): boolean {
  if (i.phase !== 'aerobic' || i.isFinalLeg || i.nextStationNumber !== 1) return false;
  if (i.leftRadius || i.distanceM == null || !Number.isFinite(i.distanceM)) return false;
  if (i.accuracyM != null && i.accuracyM > DEFAULT_ARRIVAL.maxAccuracyM) return false;
  return i.distanceM <= startAtParkRadiusM(i.aerobicType);
}

/** Latches true on the first accurate fix outside the radius. */
export function nextLeftRadius(
  leftRadius: boolean,
  distanceM: number | null,
  accuracyM: number | null,
  aerobicType: 'walking' | 'running',
): boolean {
  if (leftRadius) return true;
  if (distanceM == null || !Number.isFinite(distanceM)) return false;
  if (accuracyM != null && accuracyM > DEFAULT_ARRIVAL.maxAccuracyM) return false;
  return distanceM > startAtParkRadiusM(aerobicType);
}
