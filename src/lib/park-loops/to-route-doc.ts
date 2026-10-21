/**
 * New park loop (perimeter / inner) → official_routes doc, pending and
 * unpublished. `parkRef` (NOT visitingParkId, which is reserved for fitness
 * parks — route.types.ts) lets a park screen list "loops here" without a
 * live query. Geometry is OSM-derived → ODbL provenance. Known loops are
 * existing routes and get no new doc. Callers pass the result through
 * buildValidatedDoc before writing.
 */
import type { ParkLoop } from './types';

export const PARK_LOOPS_PIPELINE = 'park-loops';
const PACE_RUN_M_PER_MIN = 160;

export function parkLoopId(loop: ParkLoop): string {
  return `park_${loop.kind}_${loop.park.id.replace(/[^0-9a-zA-Z+]/g, '_').replace(/\+/g, '-')}`.slice(0, 140);
}

export function parkLoopName(loop: ParkLoop): string {
  return loop.kind === 'perimeter' ? `הקפת ${loop.park.name}` : `לולאה ב${loop.park.name}`;
}

export function parkLoopDoc(loop: ParkLoop, ctx: { authorityId: string; city: string; osmSnapshot: string | null; importBatchId: string }): { id: string; data: Record<string, unknown> } {
  if (loop.kind === 'known') throw new Error('known loops are existing routes — no new doc');
  const km = Math.round((loop.lengthM / 1000) * 100) / 100;
  const firstRef = loop.park.id.split('+')[0];
  return {
    id: parkLoopId(loop),
    data: {
      name: parkLoopName(loop),
      description: `לולאה ${loop.kind === 'perimeter' ? 'סביב' : 'בתוך'} ${loop.park.name} — נבנתה משבילי OpenStreetMap`,
      distance: km,
      duration: Math.max(1, Math.round(loop.lengthM / PACE_RUN_M_PER_MIN)),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * 65),
      type: 'running',
      activityType: 'running',
      activityTypes: ['running', 'walking'],
      difficulty: 'easy',
      path: loop.coords.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      features: { hasGym: loop.fitnessStops.length > 0, hasBenches: false, scenic: true, terrain: 'asphalt', environment: 'urban', trafficLoad: 'none', surface: 'road' },
      routeShape: 'loop',
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'park_loop',
      parkLoopKind: loop.kind,
      parkRef: { source: 'osm', id: loop.park.id, name: loop.park.name },
      includesFitnessStop: loop.fitnessStops.length > 0,
      ...(loop.fitnessStops.length ? { parkLoopFitnessStops: loop.fitnessStops.map((f) => ({ osmId: f.id, distanceM: f.distanceM, location: { lng: f.coord[0], lat: f.coord[1] } })) } : {}),
      source: { type: 'official_api', name: 'OSM park loops', externalId: `osm:park/${loop.kind}/${loop.park.id}`, externalLink: `https://www.openstreetmap.org/${firstRef}` },
      provenance: { pipeline: PARK_LOOPS_PIPELINE, osm: { license: 'ODbL-1.0', snapshot: ctx.osmSnapshot, extract: 'geofabrik:israel-and-palestine' } },
      importBatchId: ctx.importBatchId,
    },
  };
}
