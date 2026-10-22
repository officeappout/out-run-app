import { describe, expect, it } from 'vitest';
import { combineEnrichers, runAuthorityStages, type CandidateRoute, type StageProvider } from '../stages';

const loop = (lng: number): Array<{ lng: number; lat: number }> => {
  const pts: Array<{ lng: number; lat: number }> = [];
  for (let k = 0; k <= 40; k++) { const t = (k / 40) * 2 * Math.PI; pts.push({ lng: lng + 0.006 * Math.cos(t), lat: 32.08 + 0.005 * Math.sin(t) }); }
  return pts;
};
const doc = (name: string, lng: number) => ({ name, distance: 3.5, activityType: 'walking', origin: 'osm_named_way', path: loop(lng), source: { externalId: 'osm:stitched/1-2' } });
const provider = (key: CandidateRoute['stage'], routes: CandidateRoute[]): StageProvider => ({ key, run: async () => ({ routes }) });

describe('combineEnrichers (RC9)', () => {
  it('merges hooks in order (later keys win), skips absent ones, undefined when none', async () => {
    expect(combineEnrichers(undefined, null)).toBeUndefined();
    const e = combineEnrichers(() => ({ shadeShare: 0.2, litCoveragePct: 10 }), undefined, async () => ({ litCoveragePct: 90 }), () => null)!;
    expect(await e({ id: 'x', data: {}, stage: 'named_ways', isNew: true })).toEqual({ shadeShare: 0.2, litCoveragePct: 90 });
  });

  it('runAuthorityStages awaits an async enrich hook and scores the candidate on its measurements', async () => {
    const r: CandidateRoute = { id: 'n1', data: doc('טיילת הירקון', 34.78), stage: 'named_ways', isNew: true };
    const plain = await runAuthorityStages({ id: 'A' }, [provider('named_ways', [r])]);
    const measured = await runAuthorityStages({ id: 'A' }, [provider('named_ways', [r])], new Date(), {
      enrich: async (c) => (c.stage === 'named_ways'
        ? { composition: { sidewalkPct: 0, genuinePct: 95, ordinaryPct: 5, otherPct: 0 }, litCoveragePct: 90, amenitiesHas: { bench: true, drinking_water: true }, osmSafety: { majorRoadPct: 0, unmarkedPerKm: 0 } }
        : null),
    });
    const a = plain.score.scored[0], b = measured.score.scored[0];
    expect(b.input.measuredBy?.composition).toBe('osm_urban_measure');
    expect(b.score.score).toBeGreaterThan(a.score.score);
    expect(b.score.confidence).toBeGreaterThan(a.score.confidence);
  });
});
