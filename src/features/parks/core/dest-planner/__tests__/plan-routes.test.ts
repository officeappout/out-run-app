import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Route } from '../../types/route.types';

const generateDynamicRoutes = vi.fn();
const getSmartPathAlternatives = vi.fn();
vi.mock('../../services/route-generator.service', () => ({ generateDynamicRoutes: (...a: unknown[]) => generateDynamicRoutes(...a) }));
vi.mock('../../services/mapbox.service', () => ({ MapboxService: { getSmartPathAlternatives: (...a: unknown[]) => getSmartPathAlternatives(...a) } }));
vi.mock('../../services/generator-elevation.service', () => ({ computeGeneratorDifficulty: async () => ({ difficulty: 'easy', elevationGain: 0, maxGrade: 0 }) }));

import { candidatesForMode, fetchPlannerCandidates, routingModeFor } from '../plan-routes';

const from = { lat: 32.08, lng: 34.78 };
const to = { lat: 32.09, lng: 34.79 };
const walk = (id: string, km: number): Route =>
  ({ id, distance: km, duration: Math.round(km * 12), calories: km * 50, type: 'walking', activityType: 'walking', path: [[34.78, 32.08], [34.79, 32.09]] }) as unknown as Route;

describe('per-mode routing — running = the walking route, only the time differs (owner 23.10)', () => {
  beforeEach(() => { generateDynamicRoutes.mockReset().mockResolvedValue([]); getSmartPathAlternatives.mockReset().mockResolvedValue([]); });

  it('running routes as walking; walking / cycling route as themselves', () => {
    expect(routingModeFor('running')).toBe('walking');
    expect(routingModeFor('walking')).toBe('walking');
    expect(routingModeFor('cycling')).toBe('cycling');
  });

  it.each(['walking', 'cycling'] as const)('%s: the generator gets the mode as its activity, no extra params', async (mode) => {
    await fetchPlannerCandidates({ from, to, mode, parks: [] });
    const opts = generateDynamicRoutes.mock.calls[0][0];
    expect(opts.activity).toBe(mode);
    expect(opts.destination).toEqual(to);
    expect('commuteDirectionsParams' in opts).toBe(false);
  });

  it('running shows the SAME paths/ids as walking, re-timed at running pace', () => {
    const w = { commute: [walk('a', 3)], viaParks: [{ route: walk('v', 2), stop: { parkId: 'p', name: 'p', location: to, afterKm: 1 } }] };
    const r = candidatesForMode(w, 'running');
    expect(r.commute[0].id).toBe('a');
    expect(r.commute[0].path).toBe(w.commute[0].path);
    expect(r.commute[0].duration).toBe(18); // 3 km @ 10 km/h
    expect(r.commute[0].activityType).toBe('running');
    expect(r.viaParks[0].route.duration).toBe(12);
    expect(candidatesForMode(w, 'walking')).toBe(w);
  });
});
