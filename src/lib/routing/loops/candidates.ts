/**
 * The two loop generators of the "mix best-of-6" recipe (experiment
 * 19.10.2026): GraphHopper's own round_trip, and OUT's 3-waypoint triangle
 * routed as GraphHopper legs. Both calibrate the requested size up to 3
 * times until the loop is within ±8% of the target.
 */
import { buildRoundTripRequest, buildViaRequest, type GhProfile, type GraphHopperClient, type RouteTags, type RoutedPath } from '../graphhopper';
import { destination, type LatLng } from './geo';

export type LoopSource = 'round_trip' | 'via_loop';

export interface LoopCandidate {
  source: LoopSource;
  routed: RoutedPath;
  /** GraphHopper calls spent on this candidate. */
  calls: number;
}

export interface CandidateParams {
  client: GraphHopperClient;
  start: LatLng;
  targetKm: number;
  profile: GhProfile;
  tags: RouteTags;
  signal?: AbortSignal;
}

const CALIBRATION_STEPS = 3;
const GOOD_ENOUGH = 0.08;
/** Coast / dead-end starts: "Could not find a valid point" → try another seed once. */
const RESEED_OFFSET = 7919;

/** One routing call; once a loop exists, a failed/aborted refinement keeps it. */
async function tryRoute(p: CandidateParams, body: Parameters<GraphHopperClient['route']>[0], best: RoutedPath | null): Promise<RoutedPath | null | 'stop'> {
  try {
    return await p.client.route(body, p.signal);
  } catch (e) {
    if (best) return 'stop';
    throw e;
  }
}

const closer = (a: RoutedPath | null, b: RoutedPath, targetM: number) =>
  !a || Math.abs(b.distanceM - targetM) < Math.abs(a.distanceM - targetM);

export async function roundTripCandidate(p: CandidateParams, seed: number, heading: number): Promise<LoopCandidate | null> {
  const targetM = p.targetKm * 1000;
  let requestM = targetM, best: RoutedPath | null = null, calls = 0, s = seed, reseeded = false;
  for (let i = 0; i < CALIBRATION_STEPS && !p.signal?.aborted; i++) {
    calls++;
    const r = await tryRoute(p, buildRoundTripRequest({ start: p.start, distanceM: requestM, seed: s, heading, profile: p.profile, tags: p.tags }), best);
    if (r === 'stop') break;
    if (!r) {
      if (best || reseeded) break;
      reseeded = true; s += RESEED_OFFSET; i--; continue;
    }
    if (closer(best, r, targetM)) best = r;
    if (Math.abs(r.distanceM - targetM) / targetM <= GOOD_ENOUGH || r.distanceM <= 0) break;
    requestM = (requestM * targetM) / r.distanceM;
  }
  return best && { source: 'round_trip', routed: best, calls };
}

/** start → P1 → P2 → start, P1/P2 at bearing ±30°; a triangle's perimeter ≈ 3 × radius × street detour 1.25. */
export async function viaLoopCandidate(p: CandidateParams, bearing: number): Promise<LoopCandidate | null> {
  const targetM = p.targetKm * 1000;
  let radiusKm = p.targetKm / (3 * 1.25), best: RoutedPath | null = null, calls = 0;
  for (let i = 0; i < CALIBRATION_STEPS && !p.signal?.aborted; i++) {
    calls++;
    const pts = [p.start, destination(p.start, bearing - 30, radiusKm), destination(p.start, bearing + 30, radiusKm), p.start];
    const r = await tryRoute(p, buildViaRequest(pts, p.profile, p.tags), best);
    if (!r || r === 'stop') break;
    if (closer(best, r, targetM)) best = r;
    if (Math.abs(r.distanceM - targetM) / targetM <= GOOD_ENOUGH || r.distanceM <= 0) break;
    radiusKm = (radiusKm * targetM) / r.distanceM;
  }
  return best && { source: 'via_loop', routed: best, calls };
}
