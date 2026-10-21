import { describe, expect, it } from 'vitest';
import { scoreAuthorityRoutes } from '../score-authority';
import { parkHaMesilaDoc, rectLoop } from './fixtures';

describe('scoreAuthorityRoutes', () => {
  it('scores, selects and builds one route_scores doc per route', () => {
    const weak = { name: 'רחוב', distance: 0.4, path: rectLoop(34.9, 32.2, 50, 50), qualitySignals: { composition: { genuinePct: 0, sidewalkPct: 80, ordinaryPct: 0, otherPct: 20 } } };
    const run = scoreAuthorityRoutes({ id: 'tlv', type: 'city', population: 470_000 }, [
      { id: 'mesila', data: parkHaMesilaDoc() },
      { id: 'weak', data: weak },
    ], new Date(0));
    expect(run.quota.sizeClass).toBe('large');
    expect(run.docs.map((d) => [d.routeId, d.selection])).toEqual([['mesila', 'selected'], ['weak', 'rejected']]);
    expect(run.bands.green).toBe(1);
  });
  it('feeds duplicate-name counts into the certificate', () => {
    const d = parkHaMesilaDoc();
    const run = scoreAuthorityRoutes({ id: 'tlv' }, [{ id: 'a', data: d }, { id: 'b', data: { ...d } }]);
    expect(run.scored.every((s) => s.input.certificate === 'edit')).toBe(true);
  });
});
