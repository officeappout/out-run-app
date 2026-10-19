/**
 * Device capture: flag-off parity (nothing loaded, summarized or sent), the gate for super
 * admins, outcome matching, and the summary adapters' privacy (no names, no exact location).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({ flagOn: false, superAdmin: false, loggerLoaded: 0 }));

vi.mock('@/lib/feature-flag-live', () => ({ readLiveFlag: (k: string) => (k === 'enableGenerationReview' ? st.flagOn : false) }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: {
    getState: () => ({
      profile: {
        id: 'u1',
        core: { isSuperAdmin: st.superAdmin, name: 'דוד', anchorLat: 31.52512, anchorLng: 34.59634, email: 'x@y.z' },
        progression: { tracks: { push: { currentLevel: 6 }, pull: { currentLevel: 4 } } },
        personas: [{ id: 'office_worker', answers: {} }],
        equipment: { home: ['pullUpBar'], office: [], outdoor: [] },
      },
    }),
  },
}));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'tok' } } }));
vi.mock('../capture/logger', async (orig) => {
  st.loggerLoaded++;
  return orig();
});

import { logGeneratedRoutes, logGeneratedWorkout, logHybridShown, logPlannedRun, markGenerationOutcome, noteGenerationSwap, noteWorkoutSaved } from '../capture/hooks';
import { __resetMemoryForTests, matchStarted, remember, seenRecently } from '../capture/memory';
import { profileInput } from '../capture/adapters/profile';
import { routeParts } from '../capture/adapters/route';
import { squareLoop } from '@/lib/generation-review/__tests__/fixtures';

const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ stored: true }), { status: 200 }));
const flush = () => new Promise((r) => setTimeout(r, 30));

const workout = {
  title: 'אימון',
  estimatedDuration: 30,
  exercises: [
    { exercise: { id: 'pushup', movementGroup: 'horizontal_push', name: { he: 'שכיבות' } }, sets: 3, reps: 10, isTimeBased: false, method: {} },
    { exercise: { id: 'row', movementGroup: 'horizontal_pull', name: { he: 'חתירה' } }, sets: 3, reps: 10, isTimeBased: false, method: { gearIds: ['pullUpBar'] } },
  ],
} as never;
const route = { id: 'r1', name: 'רחוב הבית שלי', path: squareLoop(), distance: 4, duration: 30, type: 'running' } as never;

beforeEach(() => {
  st.flagOn = false;
  st.superAdmin = false;
  st.loggerLoaded = 0;
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  __resetMemoryForTests();
});

describe('flag-off parity', () => {
  it('every hook is a no-op: nothing loaded, nothing sent, routes passed through untouched', async () => {
    const routes = [route];
    expect(logGeneratedRoutes(routes as never)).toBe(routes);
    logGeneratedWorkout('home_strength', workout);
    logHybridShown({ plan: { segments: [], totals: {} } } as never);
    logPlannedRun({ blocks: [{ type: 'run', durationSeconds: 600 }] } as never);
    markGenerationOutcome('strength', 'started');
    noteGenerationSwap('strength');
    noteWorkoutSaved('strength');
    await new Promise((r) => setTimeout(r, 300));
    expect(st.loggerLoaded).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('gate open', () => {
  it('flag on → a workout is summarized and posted once (deduped)', async () => {
    st.flagOn = true;
    logGeneratedWorkout('home_strength', workout, { location: 'home' });
    logGeneratedWorkout('home_strength', workout, { location: 'home' });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled(), { timeout: 5000 });
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/generation-review/log');
    const body = JSON.parse(String(init.body));
    expect(body.type).toBe('home_strength');
    expect(body.output.exercises.map((e: { id: string }) => e.id)).toEqual(['pushup', 'row']);
    expect(body.output.exercises[1].gearOk).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('דוד');
    expect(text).not.toContain('x@y.z');
    expect(text).not.toContain('31.525');
  });
  it('super admins are captured with the flag off', async () => {
    st.superAdmin = true;
    logGeneratedWorkout('kelly_workout', workout);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });
  });
});

describe('summaries', () => {
  it('profile snapshot: levels, persona ids, geohash-5 only', () => {
    const p = profileInput();
    expect(p.levels).toEqual({ push: 6, pull: 4 });
    expect(p.personaIds).toEqual(['office_worker']);
    expect(p.areaGeohash5).toHaveLength(5);
  });
  it('a route keeps no name and no exact start', () => {
    const { output, input } = routeParts(route, { activity: 'running', targetKm: 4 });
    expect(JSON.stringify(output)).not.toContain('רחוב');
    expect(input.requestedActivity).toBe('run');
    expect(output.route?.loop).toBe(true);
  });
});

describe('outcome matching', () => {
  const rem = (id: string, ids: string[], routeId: string | null = null, family: 'strength' | 'run' = 'strength') =>
    remember({ draft: { id, type: family === 'strength' ? 'home_strength' : 'route_loop', shownAtMs: Date.now() } as never, family, exerciseIds: new Set(ids), routeId, stored: true });
  it('picks the shown workout with the most exercise overlap', () => {
    rem('g1', ['a', 'b', 'c']);
    rem('g2', ['x', 'y', 'z']);
    expect(matchStarted('strength', { exerciseIds: ['a', 'b', 'c'] })?.draft.id).toBe('g1');
    expect(matchStarted('strength', { exerciseIds: ['q'] })).toBeNull();
  });
  it('routes match by id; an unknown route id matches nothing', () => {
    rem('g3', [], 'r1', 'run');
    expect(matchStarted('run', { routeId: 'r1' })?.draft.id).toBe('g3');
    expect(matchStarted('run', { routeId: 'hybrid-route' })).toBeNull();
  });
  it('dedupe window', () => {
    expect(seenRecently('route_loop', 'abc')).toBe(false);
    expect(seenRecently('route_loop', 'abc')).toBe(true);
  });
});
