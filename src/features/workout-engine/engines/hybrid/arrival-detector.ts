/**
 * arrival-detector — "did the runner reach the park?" from GPS fixes (pure).
 *
 * A geofence with hysteresis:
 *   • enter radius: a fix this close counts as inside;
 *   • exit radius (larger): once inside, a fix only counts as outside beyond
 *     it — so jitter at the edge never resets the dwell count;
 *   • dwell: N consecutive inside fixes → arrived (one wild fix is not enough);
 *   • accuracy gate: fixes worse than maxAccuracyM never change in/out;
 *   • arming (same rule as hybrid-walk-state, G3.1): automatic arrival needs
 *     one fix OUTSIDE the exit radius on this leg first, so a park at the start
 *     point does not "arrive" on the first fix. The manual "הגעתי" always works.
 * Arrived is latched for the leg; a new leg starts from `initArrival()`.
 */
import { haversineMeters } from '@/features/parks/core/services/geoUtils';

export interface ArrivalConfig {
  enterRadiusM: number;
  exitRadiusM: number;
  minInsideFixes: number;
  maxAccuracyM: number;
  /** "Get ready" window (approach cue), from the hybrid orchestrator's 40-second rule. */
  approachRadiusM: number;
}

/** Same numbers as hybrid-orchestrator's APPROACH_THRESHOLD_METERS (≈40 s at a typical speed). */
export const APPROACH_RADIUS_M: Record<'walking' | 'running', number> = { walking: 56, running: 120 };

export const DEFAULT_ARRIVAL: Omit<ArrivalConfig, 'approachRadiusM'> = Object.freeze({
  enterRadiusM: 40,
  exitRadiusM: 65,
  minInsideFixes: 2,
  maxAccuracyM: 50,
});

export function arrivalConfigFor(kind: 'walking' | 'running', over: Partial<ArrivalConfig> = {}): ArrivalConfig {
  return { ...DEFAULT_ARRIVAL, approachRadiusM: APPROACH_RADIUS_M[kind], ...over };
}

export interface ArrivalState {
  armed: boolean;
  inside: boolean;
  insideCount: number;
  approaching: boolean;
  arrived: boolean;
  /** Last measured distance to the station (m), for "650 מ׳ לפארק". */
  distanceM: number | null;
  accuracyM: number | null;
}

export function initArrival(): ArrivalState {
  return { armed: false, inside: false, insideCount: 0, approaching: false, arrived: false, distanceM: null, accuracyM: null };
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM?: number | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function distanceToM(fix: GeoFix, target: GeoPoint): number {
  return haversineMeters(fix.lat, fix.lng, target.lat, target.lng);
}

/** Fold one distance reading into the detector. */
export function stepArrival(
  state: ArrivalState,
  distanceM: number,
  accuracyM: number | null | undefined,
  cfg: ArrivalConfig,
): ArrivalState {
  if (state.arrived) return { ...state, distanceM, accuracyM: accuracyM ?? null };
  if (!Number.isFinite(distanceM) || distanceM < 0) return state;
  const base = { ...state, distanceM, accuracyM: accuracyM ?? null, approaching: distanceM <= cfg.approachRadiusM };
  if (accuracyM != null && accuracyM > cfg.maxAccuracyM) return base; // too vague to decide anything
  const inside = state.inside ? distanceM <= cfg.exitRadiusM : distanceM <= cfg.enterRadiusM;
  const armed = state.armed || distanceM > cfg.exitRadiusM;
  const insideCount = inside && armed ? state.insideCount + 1 : 0;
  return { ...base, inside, armed, insideCount, arrived: insideCount >= Math.max(1, cfg.minInsideFixes) };
}
