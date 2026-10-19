import { describe, expect, it } from 'vitest';
import { haversineM } from '@/lib/route-quality/geo';
import { summarizeRouteLine, ROUTE_PRIVACY_TRIM_M } from '../capture/route-summary';
import { GenerationLogDraftZ } from '../capture/schema';
import { decodePolyline, encodePolyline } from '../polyline';
import { areaGeohash5, distanceToPathM, trimPathEnds } from '../geo';
import { inSample, shouldCapture } from '../sampling';
import { fingerprintOf } from '../fingerprint';
import { deltaForSession, sumDeltas } from '../review/stats';
import { buildRegressionFixture } from '../review/fixture-export';
import { parseGenLlmOutput, pickLlmSample } from '../review/llm-prompt';
import { runInvariants } from '../invariants';
import { OWNER_FIXTURES, cleanWalkStrength, squareLoop, walkStrengthPushOnly } from './fixtures';

describe('privacy coarsening', () => {
  it('geohash-5 only', () => {
    expect(areaGeohash5(31.525, 34.596)).toMatch(/^[0-9b-hjkmnp-z]{5}$/);
    expect(areaGeohash5(null, 34)).toBeNull();
    expect(areaGeohash5(NaN, 34)).toBeNull();
  });
  it('the stored route line never comes within the privacy zone of the start / end', () => {
    const path = squareLoop();
    const r = summarizeRouteLine({ path, loop: true, targetKm: 4 })!;
    const stored = decodePolyline(r.polyline);
    const start = path[0];
    for (const p of stored) expect(haversineM(p, start)).toBeGreaterThan(ROUTE_PRIVACY_TRIM_M - 15);
    // metrics are still measured on the FULL line
    expect(r.metrics.lengthM).toBeGreaterThan(3900);
  });
  it('a line shorter than both trims stores nothing', () => {
    expect(trimPathEnds([[34.6, 31.5], [34.601, 31.5]], 200)).toEqual([]);
  });
  it('stored coordinates are rounded to 4 decimals', () => {
    const r = summarizeRouteLine({ path: squareLoop().map(([a, b]) => [a + 0.0000123, b + 0.0000456] as [number, number]), loop: true })!;
    for (const [lng, lat] of decodePolyline(r.polyline)) {
      expect(Math.abs(lng * 1e4 - Math.round(lng * 1e4))).toBeLessThan(1e-6);
      expect(Math.abs(lat * 1e4 - Math.round(lat * 1e4))).toBeLessThan(1e-6);
    }
  });
  it('every fixture draft passes the strict wire schema', () => {
    for (const f of [...OWNER_FIXTURES, cleanWalkStrength]) {
      const ok = GenerationLogDraftZ.safeParse({ id: 'gabcdefgh12', type: f.type, input: f.input, output: f.output, fingerprint: fingerprintOf(f.output), shownAtMs: 1 });
      expect(ok.success, f.name).toBe(true);
    }
  });
});

describe('geometry', () => {
  it('polyline round trip', () => {
    const p = squareLoop().map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as [number, number]);
    expect(decodePolyline(encodePolyline(p))).toEqual(p);
  });
  it('distance to path', () => {
    expect(distanceToPathM([34.6, 31.5], [[34.59, 31.5], [34.61, 31.5]])).toBeLessThan(1);
    expect(distanceToPathM([34.6, 31.501], [[34.59, 31.5], [34.61, 31.5]])).toBeGreaterThan(100);
    expect(distanceToPathM([34.6, 31.5], [])).toBeNull();
  });
});

describe('sampling', () => {
  it('super admins always; flag off → nobody else; pct bounds', () => {
    expect(shouldCapture({ flagOn: false, isSuperAdmin: true, uid: 'a', day: 'd', samplePct: 0 })).toBe(true);
    expect(shouldCapture({ flagOn: false, isSuperAdmin: false, uid: 'a', day: 'd', samplePct: 100 })).toBe(false);
    expect(inSample('a', 'd', 100)).toBe(true);
    expect(inSample('a', 'd', 0)).toBe(false);
  });
  it('~pct of users per day, stable per (uid, day)', () => {
    const hits = Array.from({ length: 2000 }, (_, i) => inSample(`u${i}`, '2026-10-19', 25)).filter(Boolean).length;
    expect(hits / 2000).toBeGreaterThan(0.18);
    expect(hits / 2000).toBeLessThan(0.32);
    expect(inSample('u7', '2026-10-19', 25)).toBe(inSample('u7', '2026-10-19', 25));
  });
});

describe('stats / fixture / llm helpers', () => {
  it('first review counts the session; a re-review only the new reports', () => {
    const f = runInvariants(walkStrengthPushOnly);
    const first = deltaForSession('hybrid_smart_walk', f, { firstReview: true, newReports: 0 });
    const again = deltaForSession('hybrid_smart_walk', f, { firstReview: false, newReports: 1 });
    const sum = sumDeltas([first, again]);
    expect(sum).toMatchObject({ sessions: 1, flagged: 1, reports: 1 });
    expect(sum.byRule.STRENGTH_SINGLE_PATTERN).toBe(1);
  });
  it('fixture export defaults to the fired rules', () => {
    const fx = buildRegressionFixture({ logId: 'gx', day: '2026-10-19', type: walkStrengthPushOnly.type, input: walkStrengthPushOnly.input, output: walkStrengthPushOnly.output, findings: runInvariants(walkStrengthPushOnly) });
    expect(fx.expect.mustNotFire).toEqual(['STRENGTH_SINGLE_PATTERN']);
  });
  it('llm output parsing + sample order (reported first)', () => {
    expect(parseGenLlmOutput('{"verdict":"ok","problems":[],"suggestion":""}')?.verdict).toBe('ok');
    expect(parseGenLlmOutput('nope')).toBeNull();
    const a = { id: 'a', reported: false, findings: [] };
    const b = { id: 'b', reported: true, findings: [] };
    expect(pickLlmSample([a, b], 1).map((x) => x.id)).toEqual(['b']);
  });
});
