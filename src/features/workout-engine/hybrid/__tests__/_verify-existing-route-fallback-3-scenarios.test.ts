/**
 * DIAGNOSTIC — David's item 1 (22.09.2026): proves the ACTUAL, MODIFIED
 * composeRouteStopsWorkout (start-hybrid-session.ts, this branch) picks
 * 'existing_route' when a published route is within ROUTE_STOPS_MAX_START_M
 * (800m), and falls back to 'generated_loop' — unchanged from before this
 * change — otherwise. Three scenarios, real (modified) code, mocked I/O only.
 *
 * NOT run against live Firestore — self-contained fixtures, so this can run
 * in CI / regression suite without network. (Field-test verification against
 * real Sderot data was already done separately via
 * scripts/_verify-resolveroutestops-on-sderot-official-route.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/features/activity/store/useActivityStore', () => ({
  useActivityStore: { getState: () => ({ today: {}, currentStreak: 0 }) },
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: {
    getState: () => ({
      profile: {
        core: { weight: 70 },
        running: { paceProfile: { basePace: 390, profileType: 2 } },
        progression: { activePrograms: [] },
      },
    }),
  },
}));
vi.mock('@/features/user/identity/services/access-control.service', () => ({
  hasAssessedStrengthDomain: () => true,
}));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({
  getAllExercises: vi.fn(async () => []),
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getAllGymEquipment: vi.fn(async () => []),
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({
  fetchRealParks: vi.fn(async () => []),
}));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: { getState: () => ({ getRemainingBudget: () => 999 }) },
}));
vi.mock('../weekly-load.service', () => ({
  getWeeklyLoadSnapshot: vi.fn(async () => ({ gaps: { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] } })),
}));
vi.mock('../hybrid-context.util', () => ({
  resolveHybridUserLevels: vi.fn(async () => ({
    userProgramLevels: new Map(),
    baseUserLevel: 5,
    resolveUserLevelForExercise: () => 5,
  })),
}));
vi.mock('../hybrid-warmup', () => ({ warmHybridCaches: vi.fn(async () => undefined) }));
vi.mock('../plan-from-point', () => ({
  planFromPoint: (args: { canonical: { path: [number, number][] }; stops: unknown[] }) => ({
    traversal: args.canonical.path,
    stops: (args.stops as Array<Record<string, unknown>>).map((s, i) => ({ stop: s, traversalIndex: i })),
  }),
  detectTopology: () => 'loop' as const,
}));
vi.mock('../../services/program-hierarchy.utils', () => ({ resolveChildDomainsForParent: () => [] }));
vi.mock('../../logic/ContextualEngine', () => ({ filterExercisesContextually: () => ({ exercises: [] }) }));
vi.mock('../../services/split-decision/SplitDecisionService', () => ({ getWorkoutContext: () => ({}) }));

const FIELD_FALLBACK_PLAN = {
  segments: [{ kind: 'strength', activityType: 'core', estCalories: 20 }],
  totals: { aerobicMin: 15, strengthMin: 5, distanceKm: 1.2, estCalories: 80, stations: 1 },
  meta: { emphasisResolved: 'balanced', whoGapNote: null, usedFieldFallback: true, insufficientHomeContent: false, log: [] },
};
vi.mock('../compose-hybrid-session.service', () => ({
  composeHybridSession: vi.fn(() => FIELD_FALLBACK_PLAN),
}));

// The two backbone sources under test — controlled per scenario below.
const getCachedOfficialRoutesMock = vi.fn();
vi.mock('@/features/parks/core/services/inventory.service', () => ({
  getCachedOfficialRoutes: (...args: unknown[]) => getCachedOfficialRoutesMock(...args),
}));
const GENERATED_LOOP_PATH: [number, number][] = [
  [99.0, 1.0], [99.001, 1.0], [99.001, 1.001], [99.0, 1.0],
]; // deliberately far from the fixture route's coordinates — unmistakable if this is what fires
vi.mock('@/features/parks/core/services/route-generator.service', () => ({
  generateDynamicRoutes: vi.fn(async () => [{ path: GENERATED_LOOP_PATH, id: 'gen-test-loop', distance: 1.2 }]),
}));

// A small fixture "published route" — real Firestore storage shape ({lng,lat} objects).
const FIXTURE_ROUTE_PATH_OBJECTS = [
  { lng: 34.6, lat: 31.53 },
  { lng: 34.601, lat: 31.531 },
  { lng: 34.602, lat: 31.53 },
  { lng: 34.6, lat: 31.53 },
];
const FIXTURE_ROUTE = { id: 'fixture-sderot-route', name: 'Fixture Walking Route', path: FIXTURE_ROUTE_PATH_OBJECTS };

function isGeneratedLoopPath(path: [number, number][]): boolean {
  return path.length > 0 && path[0][0] === GENERATED_LOOP_PATH[0][0] && path[0][1] === GENERATED_LOOP_PATH[0][1];
}
function isFixtureRoutePath(path: [number, number][]): boolean {
  return path.length > 0 && Math.abs(path[0][0] - FIXTURE_ROUTE_PATH_OBJECTS[0].lng) < 1e-9;
}

describe('composeRouteStopsWorkout — existing_route-then-fallback (real modified code, mocked I/O)', () => {
  beforeEach(() => {
    getCachedOfficialRoutesMock.mockReset();
  });

  it('Scenario 1 — Sderot, user AT the published route: picks existing_route, not generated_loop', async () => {
    getCachedOfficialRoutesMock.mockResolvedValue([FIXTURE_ROUTE]);
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const { HYBRID_PRESETS, presetToIntent } = await import('../hybrid-slots');
    const intent = presetToIntent({ ...HYBRID_PRESETS.route_stops, aerobicKind: 'walking' }, 30);

    const result = await composeHybridPlan(intent, {
      userPosition: { lat: FIXTURE_ROUTE_PATH_OBJECTS[0].lat, lng: FIXTURE_ROUTE_PATH_OBJECTS[0].lng }, // AT the route
      startRun: () => {},
    });

    expect(result).not.toBeNull();
    console.log('[VERIFY scenario 1] routePath[0]:', result!.routePath[0]);
    expect(isFixtureRoutePath(result!.routePath)).toBe(true);
    expect(isGeneratedLoopPath(result!.routePath)).toBe(false);
  });

  it('Scenario 2 — Sderot, user 3km from the published route: falls back to generated_loop', async () => {
    getCachedOfficialRoutesMock.mockResolvedValue([FIXTURE_ROUTE]);
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const { HYBRID_PRESETS, presetToIntent } = await import('../hybrid-slots');
    const intent = presetToIntent({ ...HYBRID_PRESETS.route_stops, aerobicKind: 'walking' }, 30);

    const farLat = FIXTURE_ROUTE_PATH_OBJECTS[0].lat + 3000 / 111_000; // ~3km north
    const result = await composeHybridPlan(intent, {
      userPosition: { lat: farLat, lng: FIXTURE_ROUTE_PATH_OBJECTS[0].lng },
      startRun: () => {},
    });

    expect(result).not.toBeNull();
    console.log('[VERIFY scenario 2] routePath[0]:', result!.routePath[0]);
    expect(isGeneratedLoopPath(result!.routePath)).toBe(true);
    expect(isFixtureRoutePath(result!.routePath)).toBe(false);
  });

  it('Scenario 3 — Ashkelon-like city, 0 published routes: falls back to generated_loop, no throw', async () => {
    getCachedOfficialRoutesMock.mockResolvedValue([]); // 0 routes, exactly like Ashkelon
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const { HYBRID_PRESETS, presetToIntent } = await import('../hybrid-slots');
    const intent = presetToIntent({ ...HYBRID_PRESETS.route_stops, aerobicKind: 'walking' }, 30);

    const result = await composeHybridPlan(intent, {
      userPosition: { lat: 31.6, lng: 34.57 },
      startRun: () => {},
    });

    expect(result).not.toBeNull();
    console.log('[VERIFY scenario 3] routePath[0]:', result!.routePath[0]);
    expect(isGeneratedLoopPath(result!.routePath)).toBe(true);
  });
});
