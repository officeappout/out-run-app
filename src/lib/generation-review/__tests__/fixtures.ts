/**
 * Fixtures from the owner's field reports (19.10.2026) — the first regression set.
 * Coordinates are synthetic (a square around a point in Sderot), not anyone's location.
 */
import type { LngLat } from '@/lib/route-quality/types';
import { summarizeRouteLine, summarizeStations } from '../capture/route-summary';
import type { ExerciseSummary, GenerationInput, GenerationOutput, GenerationType } from '../types';

const O: LngLat = [34.596, 31.525];
const DLNG = 0.0105; // ~1 km at this latitude
const DLAT = 0.009; // ~1 km

/** A ~4 km square loop, sampled every ~100 m. */
export function squareLoop(): LngLat[] {
  const corners: LngLat[] = [O, [O[0] + DLNG, O[1]], [O[0] + DLNG, O[1] + DLAT], [O[0], O[1] + DLAT], O];
  const out: LngLat[] = [];
  for (let c = 1; c < corners.length; c++) {
    const [a, b] = [corners[c - 1], corners[c]];
    for (let i = 0; i < 10; i++) out.push([a[0] + ((b[0] - a[0]) * i) / 10, a[1] + ((b[1] - a[1]) * i) / 10]);
  }
  out.push(O);
  return out;
}

export const ex = (id: string, pattern: string | null, extra: Partial<ExerciseSummary> = {}): ExerciseSummary => ({
  id,
  pattern,
  sets: 3,
  ...extra,
});

export interface Fixture {
  name: string;
  type: GenerationType;
  input: GenerationInput;
  output: GenerationOutput;
}

const loop = squareLoop();
/** A park 300 m outside the loop's east side, and one right on its north side. */
const FAR_PARK = { parkId: 'park_far', lat: O[1] + DLAT / 2, lng: O[0] + DLNG + 0.0032, equipment: ['pullUpBar', 'parallelBars'] };
const ON_PARK = { parkId: 'park_on', lat: O[1] + DLAT, lng: O[0] + DLNG / 2, equipment: ['pullUpBar', 'parallelBars'] };

const balancedBlock = [ex('pushup', 'horizontal_push'), ex('row', 'horizontal_pull'), ex('squat', 'squat'), ex('plank', 'core_anti_extension')];

/** 1. "walk+strength" loop that doesn't pass through the park it shows. */
export const walkStrengthMissesPark: Fixture = {
  name: 'walk+strength loop misses its park',
  type: 'hybrid_smart_walk',
  input: { requestedActivity: 'walk', targetMinutes: 45 },
  output: {
    planLabel: 'הליכה + כוח',
    planActivity: 'walk',
    totalMinutes: 47,
    exercises: [],
    legs: [
      { activity: 'walk', distanceM: 1500, minutes: 18 },
      { activity: 'strength', distanceM: null, minutes: 12, parkId: 'park_far', exercises: balancedBlock },
      { activity: 'walk', distanceM: 1500, minutes: 17 },
    ],
    stations: summarizeStations([FAR_PARK], loop),
    route: summarizeRouteLine({ path: loop, loop: true, targetKm: 4, source: 'mapbox_v1' }),
  },
};

/** 2. route+stops overview with no strength stop. */
export const routeStopsNoStrength: Fixture = {
  name: 'route+stops with no strength stop',
  type: 'hybrid_route_stops',
  input: { requestedActivity: 'walk' },
  output: {
    planLabel: 'מסלול + עצירות',
    planActivity: 'walk',
    totalMinutes: 50,
    exercises: [],
    legs: [{ activity: 'walk', distanceM: 4000, minutes: 50 }],
    stations: [],
    route: summarizeRouteLine({ path: loop, loop: true, targetKm: 4, source: 'official' }),
  },
};

/** 3. walk+strength whose strength block is push only. */
export const walkStrengthPushOnly: Fixture = {
  name: 'walk+strength block with only push exercises',
  type: 'hybrid_smart_walk',
  input: { requestedActivity: 'walk', targetMinutes: 40 },
  output: {
    planLabel: 'הליכה + כוח',
    planActivity: 'walk',
    totalMinutes: 40,
    exercises: [],
    legs: [
      { activity: 'walk', distanceM: 1200, minutes: 14 },
      {
        activity: 'strength', distanceM: null, minutes: 12, parkId: 'park_on',
        exercises: [ex('pushup', 'horizontal_push'), ex('dips', 'vertical_push'), ex('pike_pushup', 'vertical_push'), ex('plank', 'core_anti_extension')],
      },
      { activity: 'walk', distanceM: 1200, minutes: 14 },
    ],
    stations: summarizeStations([ON_PARK], loop),
    route: summarizeRouteLine({ path: loop, loop: true, targetKm: 4, source: 'mapbox_v1' }),
  },
};

/** 4. cycling + strength stations → a "ריצה + כוח" plan with 0-minute legs. */
export const cyclingBecomesRun: Fixture = {
  name: 'cycling+strength produced a run plan with 0-minute legs',
  type: 'hybrid_free_aerobic',
  input: { requestedActivity: 'cycle', targetMinutes: 60 },
  output: {
    planLabel: 'ריצה + כוח',
    planActivity: 'run',
    totalMinutes: 24,
    exercises: [],
    legs: [
      { activity: 'run', distanceM: 0, minutes: 0 },
      { activity: 'strength', distanceM: null, minutes: 12, parkId: 'park_on', exercises: balancedBlock },
      { activity: 'run', distanceM: 0, minutes: 0 },
      { activity: 'strength', distanceM: null, minutes: 12, parkId: 'park_on', exercises: balancedBlock },
    ],
    stations: summarizeStations([ON_PARK], null),
    route: null,
  },
};

/** 5. a generated loop with a spur + retrace and unmarked major-road crossings. */
export function spurLoopPath(): LngLat[] {
  const base = squareLoop();
  // At the NE corner (index 20), walk 300 m further north and back the same way.
  const corner = base[20];
  const spur: LngLat[] = [];
  for (let i = 1; i <= 3; i++) spur.push([corner[0], corner[1] + 0.0009 * i]);
  for (let i = 2; i >= 0; i--) spur.push([corner[0], corner[1] + 0.0009 * i]);
  return [...base.slice(0, 21), ...spur, ...base.slice(21)];
}

export const spurLoop: Fixture = {
  name: 'loop with a spur and unmarked crossings',
  type: 'route_loop',
  input: { requestedActivity: 'run', targetKm: 4 },
  output: {
    planActivity: 'run',
    totalMinutes: 27,
    exercises: [],
    legs: [],
    stations: [],
    route: summarizeRouteLine({ path: spurLoopPath(), loop: true, targetKm: 4, source: 'graphhopper', unmarkedCrossings: 4 }),
  },
};

/** A clean walk+strength session — no rule may fire. */
export const cleanWalkStrength: Fixture = {
  name: 'clean walk+strength',
  type: 'hybrid_smart_walk',
  input: { requestedActivity: 'walk', targetMinutes: 45, levels: { push: 5, pull: 5, legs: 5 } },
  output: {
    planLabel: 'הליכה + כוח',
    planActivity: 'walk',
    totalMinutes: 46,
    exercises: [],
    legs: [
      { activity: 'walk', distanceM: 2000, minutes: 17 },
      {
        activity: 'strength', distanceM: null, minutes: 12, parkId: 'park_on',
        exercises: balancedBlock.map((e) => ({ ...e, level: 5, equipment: e.id === 'row' ? ['pullUpBar'] : ['none'], hasMedia: true })),
      },
      { activity: 'walk', distanceM: 2000, minutes: 17 },
    ],
    stations: summarizeStations([ON_PARK], loop),
    route: summarizeRouteLine({ path: loop, loop: true, targetKm: 4, source: 'mapbox_v1' }),
  },
};

export const OWNER_FIXTURES = [walkStrengthMissesPark, routeStopsNoStrength, walkStrengthPushOnly, cyclingBecomesRun, spurLoop];
