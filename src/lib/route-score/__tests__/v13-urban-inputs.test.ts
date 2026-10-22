import { describe, expect, it } from 'vitest';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { scoreComfort, scoreSafety, scoreSurface } from '../components';
import { routeScore } from '../score';
import { ROUTE_SCORE_VERSION } from '../weights';
import { rectLoop } from './fixtures';

const corridor = (over: Record<string, any> = {}) => ({
  name: 'טיילת הירקון', origin: 'osm_named_way', distance: 3, activityType: 'walking',
  path: rectLoop(34.8, 32.1, 800, 600).map(([lng, lat]) => ({ lng, lat })),
  source: { externalId: 'osm:stitched/1-2' }, ...over,
});
const MEASURED = {
  composition: { sidewalkPct: 0, genuinePct: 90, ordinaryPct: 10, otherPct: 0 },
  litCoveragePct: 85,
  amenitiesHas: { bench: true, drinking_water: true, toilets: true },
  osmSafety: { majorRoadPct: 0, unmarkedPerKm: 0 },
};

describe('routeScore v1.3 — urban measurements fill the gaps', () => {
  it('version', () => expect(ROUTE_SCORE_VERSION).toBe('v1.3'));

  it('a measured corridor scores on measurements, with full coverage, no certificate', () => {
    const bare = routeScore(routeScoreInputFromDoc('c', corridor()));
    const input = routeScoreInputFromDoc('c', corridor(), MEASURED);
    const s = routeScore(input);
    expect(input.certificate).toBeNull();
    expect(input.compositionIsProxy).toBe(false);
    expect(input.measuredBy).toEqual({ composition: 'osm_urban_measure', lighting: 'osm_urban_measure', amenities: 'osm_urban_measure', safety: 'osm_urban_measure' });
    expect(s.score).toBeGreaterThan(bare.score);
    expect(s.confidence).toBeGreaterThan(bare.confidence);
    expect(s.components.surface.notes).toContain('measured: OSM ways');
  });

  it('a corridor measured ON a busy road loses points — measuring is honest both ways', () => {
    const bare = routeScore(routeScoreInputFromDoc('c', corridor()));
    const s = routeScore(routeScoreInputFromDoc('c', corridor(), {
      composition: { sidewalkPct: 0, genuinePct: 0, ordinaryPct: 0, otherPct: 100 },
      osmSafety: { majorRoadPct: 0.6, unmarkedPerKm: 2 },
    }));
    expect(s.score).toBeLessThan(bare.score);
    expect(scoreSafety(routeScoreInputFromDoc('c', corridor(), { osmSafety: { majorRoadPct: 0.6, unmarkedPerKm: 2 } })).points).toBe(0);
  });

  it('the stored doc always wins over a measurement', () => {
    const doc = corridor({ qualitySignals: {
      composition: { sidewalkPct: 0, genuinePct: 20, ordinaryPct: 80, otherPct: 0 },
      lighting: { status: 'computed', litCoveragePct: 10 },
      amenities: { status: 'computed', has: { bench: false, drinking_water: false } },
    } });
    const input = routeScoreInputFromDoc('c', doc, MEASURED);
    expect(input.composition?.genuinePct).toBe(20);
    expect(input.litCoveragePct).toBe(10);
    expect(input.amenitiesHas).toEqual({ bench: false, drinking_water: false });
    expect(input.measuredBy).toEqual({ safety: 'osm_urban_measure' });
  });

  it('a measured composition replaces the trail-share proxy', () => {
    const doc = corridor({ trail: { stats: { trailPct: 30, litPct: 0, litUnknownPct: 100 } } });
    expect(routeScoreInputFromDoc('c', doc).compositionIsProxy).toBe(true);
    const m = routeScoreInputFromDoc('c', doc, { composition: MEASURED.composition });
    expect(m.compositionIsProxy).toBe(false);
    expect(scoreSurface(m).coverage).toBe(1);
  });

  it('comfort: toilets / fitness station earn the "other" amenity point', () => {
    const none = scoreComfort(routeScoreInputFromDoc('c', corridor(), { amenitiesHas: { bench: false } })).points;
    const wc = scoreComfort(routeScoreInputFromDoc('c', corridor(), { amenitiesHas: { toilets: true } })).points;
    const fit = scoreComfort(routeScoreInputFromDoc('c', corridor(), { amenitiesHas: { fitness_station: true } })).points;
    expect(wc).toBe(fit);
    expect(wc).toBe(none + 1);
  });

  it('comfort: a tree hint counts as shade at half coverage, only without Technion', () => {
    const hint = scoreComfort(routeScoreInputFromDoc('c', corridor(), { shadeHint: 0.35 }));
    expect(hint.notes).toContain('shade: tree hint (dataset)');
    expect(hint.coverage).toBeCloseTo(2 / 15, 5);
    const both = routeScoreInputFromDoc('c', corridor(), { shadeShare: 0.1, shadeHint: 0.35 });
    expect(both.shadeHint).toBeUndefined();
    expect(scoreComfort(both).coverage).toBeCloseTo(4 / 15, 5);
  });
});
