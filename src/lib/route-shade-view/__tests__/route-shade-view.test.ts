import { describe, expect, it } from 'vitest';
import {
  hourlyShadeView, isStoredRouteId, litAtNightPct, parseRouteShadeRequest, routeShadeRowView,
  shadeInfoFromScoreDoc, shadeTagPct, ROUTE_SHADE_MAX_IDS,
} from '..';

// 06…19 local → index 0…13. 12:00 = index 6, 16:00 = index 10.
const july = [null, 0.1, 0.2, 0.3, 0.35, 0.4, 0.22, 0.25, 0.3, 0.33, 0.47, 0.5, 0.6, null];
// 2026-07-21 10:30 Israel (UTC+3) = 07:30 UTC → hour 10 → index 4 → 35%.
const at10 = new Date('2026-07-21T07:30:00Z');

describe('shadeTagPct — the card tag', () => {
  it('rounds a measured shadedPct', () => {
    expect(shadeTagPct({ shadedPct: 42.4 })).toBe(42);
    expect(shadeTagPct({ shadedPct: 99.6 })).toBe(100);
  });
  it('no tag when not measured, missing, or a measured 0% (never "0%")', () => {
    expect(shadeTagPct(null)).toBeNull();
    expect(shadeTagPct(undefined)).toBeNull();
    expect(shadeTagPct({ shadedPct: null })).toBeNull();
    expect(shadeTagPct({ shadedPct: 0 })).toBeNull();
    expect(shadeTagPct({ shadedPct: 0.4 })).toBeNull();
    expect(shadeTagPct({ shadedPct: Number.NaN })).toBeNull();
  });
});

describe('hourlyShadeView — עכשיו · בצהריים · אחה״צ', () => {
  it('now = the current Israel hour, noon = 12:00, afternoon = 16:00', () => {
    expect(hourlyShadeView({ shadedPct: 40, julyByHour: july }, at10)).toEqual({ now: 35, noon: 22, afternoon: 47 });
  });
  it('"now" is dropped at night / when the sun is down, the rest stays', () => {
    const night = new Date('2026-07-21T20:00:00Z'); // 23:00 local
    expect(hourlyShadeView({ shadedPct: 40, julyByHour: july }, night)).toEqual({ now: null, noon: 22, afternoon: 47 });
    const at19 = new Date('2026-07-21T16:10:00Z'); // 19:10 local → index 13 = null (sun down)
    expect(hourlyShadeView({ shadedPct: 40, julyByHour: july }, at19)?.now).toBeNull();
  });
  it('winter clock (UTC+2) maps to the right hour', () => {
    const jan = new Date('2026-01-10T10:00:00Z'); // 12:00 local
    expect(hourlyShadeView({ shadedPct: null, julyByHour: july }, jan)?.now).toBe(22);
  });
  it('null without hourly data or with a malformed profile', () => {
    expect(hourlyShadeView({ shadedPct: 40 }, at10)).toBeNull();
    expect(hourlyShadeView({ shadedPct: 40, julyByHour: [0.1, 0.2] }, at10)).toBeNull();
    expect(hourlyShadeView({ shadedPct: 40, julyByHour: Array(14).fill(null) }, at10)).toBeNull();
  });
});

describe('litAtNightPct', () => {
  it('only a computed lighting measurement ≥ 1%', () => {
    expect(litAtNightPct({ lighting: { status: 'computed', litCoveragePct: 63.6 } })).toBe(64);
    expect(litAtNightPct({ lighting: { status: 'computed', litCoveragePct: 0 } })).toBeNull();
    expect(litAtNightPct({ lighting: { status: 'unknown', litCoveragePct: 80 } })).toBeNull();
    expect(litAtNightPct({ lighting: { status: 'computed', litCoveragePct: null } })).toBeNull();
    expect(litAtNightPct(undefined)).toBeNull();
  });
});

describe('routeShadeRowView — hide rows without data', () => {
  it('null when nothing at all', () => {
    expect(routeShadeRowView(null, undefined, at10)).toBeNull();
    expect(routeShadeRowView({ shadedPct: 0 }, { lighting: { status: 'unknown', litCoveragePct: null } }, at10)).toBeNull();
  });
  it('lighting alone is enough for a row', () => {
    expect(routeShadeRowView(null, { lighting: { status: 'computed', litCoveragePct: 50 } }, at10)).toEqual({ shadedPct: null, hourly: null, litPct: 50 });
  });
  it('everything', () => {
    expect(routeShadeRowView({ shadedPct: 41.7, julyByHour: july }, { lighting: { status: 'computed', litCoveragePct: 90 } }, at10))
      .toEqual({ shadedPct: 42, hourly: { now: 35, noon: 22, afternoon: 47 }, litPct: 90 });
  });
});

describe('shadeInfoFromScoreDoc — route_scores → display', () => {
  const measured = { status: 'measured', shadeShare: 0.21, shadedPct: 38.5, coverage: 0.81, source: 'technion_v1' };
  it('measured shade + hourly profile', () => {
    expect(shadeInfoFromScoreDoc({ shade: measured, components: { comfort: { points: 1, max: 2, coverage: 1, hourlyShade: { source: 'shade_hourly_v1', coverage: 0.9, summerMean: 0.3, julyByHour: july } } } }))
      .toEqual({ shadedPct: 38.5, julyByHour: july });
  });
  it('measured shade without hourly → no julyByHour key at all', () => {
    const out = shadeInfoFromScoreDoc({ shade: measured, components: {} });
    expect(out).toEqual({ shadedPct: 38.5 });
    expect(Object.prototype.hasOwnProperty.call(out, 'julyByHour')).toBe(false);
  });
  it('low coverage / no data → no shadedPct; nothing else → null', () => {
    expect(shadeInfoFromScoreDoc({ shade: { ...measured, status: 'low_coverage', shadedPct: null, coverage: 0.3 } })).toBeNull();
    expect(shadeInfoFromScoreDoc({ shade: { ...measured, coverage: 0.4 } })).toBeNull(); // defensive: < 50% is never "measured"
    expect(shadeInfoFromScoreDoc({ shade: null })).toBeNull();
    expect(shadeInfoFromScoreDoc({})).toBeNull();
    expect(shadeInfoFromScoreDoc(null)).toBeNull();
  });
  it('hourly alone still counts (shadedPct null)', () => {
    expect(shadeInfoFromScoreDoc({ shade: null, components: { comfort: { hourlyShade: { julyByHour: july } } } })).toEqual({ shadedPct: null, julyByHour: july });
  });
});

describe('request parsing + ids', () => {
  it('stored ids only — generated routes are never asked about', () => {
    expect(isStoredRouteId('aB3dE5fG7hJ9kL1mN2pQ')).toBe(true);
    for (const id of ['gh-1-0-0', 'gen-1-0-0', 'gen-oab-1-0-0', 'corridor-x-1', 'chain-a-b-0', 'flow-a-0', 'commute-fast-1-0', 'a/b', '', 'x'.repeat(129)]) {
      expect(isStoredRouteId(id)).toBe(false);
    }
  });
  it('dedupes, drops junk, caps the batch', () => {
    expect(parseRouteShadeRequest({ ids: ['a1', 'a1', 'gh-1', 7, 'b2'] })).toEqual({ ids: ['a1', 'b2'] });
    expect(parseRouteShadeRequest({ ids: [] })).toEqual({ error: 'bad_ids' });
    expect(parseRouteShadeRequest({ ids: ['gh-1'] })).toEqual({ error: 'bad_ids' });
    expect(parseRouteShadeRequest(null)).toEqual({ error: 'bad_ids' });
    expect(parseRouteShadeRequest({ ids: Array.from({ length: ROUTE_SHADE_MAX_IDS + 1 }, (_, i) => `r${i}`) })).toEqual({ error: 'too_many_ids' });
  });
});
