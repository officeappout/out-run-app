/**
 * "אימון משלים" (#541) is built where the user trains (enable_home_v2) — generator QA
 * #591 V6: no location → the service's 'park' default → bench / dips / bar at home.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const trioCalls: Record<string, unknown>[] = [];
vi.mock('../../../services/home-workout.service', () => ({
  generateHomeWorkoutTrio: vi.fn(async (opts: Record<string, unknown>) => {
    trioCalls.push(opts);
    const workout = { exercises: [], title: 't' };
    return { options: [{ result: { workout } }, { result: { workout } }, { result: { workout } }] };
  }),
}));
vi.mock('../../../services/workout-context-resolver', () => ({
  resolveWorkoutContext: vi.fn(async (_p: unknown, requested: string) =>
    requested === 'park' ? { location: 'park', availableGear: ['pullup_bar', 'dip_station'], source: 'gps-park' } : { location: requested, availableGear: [], source: 'non-park' }),
}));

import { buildPartialCompletionWorkout } from '../partial-completion.generator';
import { requestedLocationOf } from '../partial-completion-place';
import { setSplitDayFocusActive } from '../../../services/split-decision/day-focus.switch';

const profile = (lifestyle: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ id: 'u', lifestyle, ...extra }) as never;

describe('requestedLocationOf — same chain as the home trio', () => {
  it('session choice → lifestyle preference → onboarding location → home', () => {
    expect(requestedLocationOf(profile({ locationPreference: 'park' }), 'office')).toBe('office');
    expect(requestedLocationOf(profile({ locationPreference: 'park' }), null)).toBe('park');
    expect(requestedLocationOf(profile({}, { firstWorkoutLocation: 'street' }), null)).toBe('street');
    expect(requestedLocationOf(profile(), null)).toBe('home');
  });
});

describe('buildPartialCompletionWorkout location', () => {
  beforeEach(() => { trioCalls.length = 0; });
  afterEach(() => setSplitDayFocusActive(false));

  it('flag off → unchanged call (no location)', async () => {
    await buildPartialCompletionWorkout(profile(), 'push');
    expect(trioCalls[0]).not.toHaveProperty('location');
    expect(trioCalls[0]).not.toHaveProperty('parkEquipmentIds');
  });

  it('enable_home_v2, a home user → location home (profile gear), no park gear', async () => {
    setSplitDayFocusActive(true);
    await buildPartialCompletionWorkout(profile(), 'pull');
    expect(trioCalls[0]).toMatchObject({ location: 'home', requiredDomains: ['pull'], strictDomains: true });
    expect(trioCalls[0]).not.toHaveProperty('parkEquipmentIds');
  });

  it('enable_home_v2, a park user → the resolved park and its real gear', async () => {
    setSplitDayFocusActive(true);
    await buildPartialCompletionWorkout(profile({ locationPreference: 'park' }), 'pull');
    expect(trioCalls[0]).toMatchObject({ location: 'park', parkEquipmentIds: ['pullup_bar', 'dip_station'] });
  });
});
