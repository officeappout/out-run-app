import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateDynamicRoutes = vi.fn();
const getSmartPathAlternatives = vi.fn();
vi.mock('../../services/route-generator.service', () => ({ generateDynamicRoutes: (...a: unknown[]) => generateDynamicRoutes(...a) }));
vi.mock('../../services/mapbox.service', () => ({ MapboxService: { getSmartPathAlternatives: (...a: unknown[]) => getSmartPathAlternatives(...a) } }));
vi.mock('../../services/generator-elevation.service', () => ({ computeGeneratorDifficulty: async () => ({ difficulty: 'easy', elevationGain: 0, maxGrade: 0 }) }));

import { directionsParamsFor, fetchPlannerCandidates } from '../plan-routes';

const from = { lat: 32.08, lng: 34.78 };
const to = { lat: 32.09, lng: 34.79 };

describe('per-mode routing — each tab asks for its own route', () => {
  beforeEach(() => { generateDynamicRoutes.mockReset().mockResolvedValue([]); getSmartPathAlternatives.mockReset().mockResolvedValue([]); });

  it('running prefers walkways; walking / cycling send no extra params', () => {
    expect(directionsParamsFor('running')).toEqual({ walkway_bias: '1' });
    expect(directionsParamsFor('walking')).toBeUndefined();
    expect(directionsParamsFor('cycling')).toBeUndefined();
  });

  it.each(['walking', 'running', 'cycling'] as const)('%s: the generator gets the mode as its activity + the mode params', async (mode) => {
    await fetchPlannerCandidates({ from, to, mode, parks: [] });
    const opts = generateDynamicRoutes.mock.calls[0][0];
    expect(opts.activity).toBe(mode);
    expect(opts.destination).toEqual(to);
    expect(opts.commuteDirectionsParams).toEqual(directionsParamsFor(mode));
  });
});
