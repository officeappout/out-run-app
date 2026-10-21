/**
 * Typed /route request bodies: round trip, multi-point (via legs) and A→B.
 * Pure — no I/O.
 */
import type { LngLat } from '@/lib/route-quality';
import { buildCustomModel } from './custom-model';
import type { GhFootProfile, GhProfile, GhRouteRequest, RouteTags } from './types';

export const GH_DETAILS = ['road_class', 'crossing', 'surface'] as const;

export type OutActivity = 'running' | 'walking' | 'cycling';

export function profileForActivity(activity: OutActivity, opts: { mtb?: boolean; foot?: GhFootProfile } = {}): GhProfile {
  if (activity === 'cycling') return opts.mtb ? 'mtb' : 'bike';
  return opts.foot ?? 'foot';
}

function base(profile: GhProfile, points: LngLat[], tags: RouteTags): GhRouteRequest {
  const cm = buildCustomModel(profile, tags);
  return {
    profile,
    points,
    points_encoded: false,
    instructions: false,
    elevation: true,
    details: [...GH_DETAILS],
    'ch.disable': true,
    ...(cm ? { custom_model: cm } : {}),
  };
}

const lngLat = (p: { lat: number; lng: number }): LngLat => [round6(p.lng), round6(p.lat)];
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const normHeading = (h: number) => ((Math.round(h) % 360) + 360) % 360;

export interface RoundTripParams {
  start: { lat: number; lng: number };
  distanceM: number;
  seed: number;
  /** Initial direction, degrees clockwise from north. */
  heading?: number;
  profile: GhProfile;
  tags: RouteTags;
}

export function buildRoundTripRequest(p: RoundTripParams): GhRouteRequest {
  return {
    ...base(p.profile, [lngLat(p.start)], p.tags),
    algorithm: 'round_trip',
    'round_trip.distance': Math.max(200, Math.round(p.distanceM)),
    'round_trip.seed': Math.trunc(p.seed),
    ...(p.heading != null ? { headings: [normHeading(p.heading)] } : {}),
  };
}

/** start → via… → end; pass_through stops U-turns at the via points. */
export function buildViaRequest(points: Array<{ lat: number; lng: number }>, profile: GhProfile, tags: RouteTags): GhRouteRequest {
  if (points.length < 2) throw new Error('buildViaRequest needs >= 2 points');
  return { ...base(profile, points.map(lngLat), tags), ...(points.length > 2 ? { pass_through: true } : {}) };
}
