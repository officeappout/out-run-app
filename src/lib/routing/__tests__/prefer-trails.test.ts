import { describe, expect, it } from 'vitest';
import { buildCustomModel, buildRoundTripRequest, DEFAULT_TAGS } from '../graphhopper';
import { PREFER_TRAILS_PAVED_MULTIPLIER } from '../graphhopper/custom-model';
import { generateLoops } from '../loop-service';
import { scoreLoop, trailShareOf, TRAIL_SCORE_WEIGHT } from '../loops/scoring';
import { parseGenerateRequest } from '../api-contract';
import { shouldPreferTrails } from '../prefer-trails';
import { GH, fakeClient, routed } from './fixtures';

const start = GH.start;
const trailsTags = { ...DEFAULT_TAGS, preferMarkedTrails: true };

describe('custom model — preferMarkedTrails', () => {
  it('flag off (tag absent/false) = exactly today\'s model, byte for byte', () => {
    const today = JSON.stringify(buildCustomModel('foot', DEFAULT_TAGS));
    expect(JSON.stringify(buildCustomModel('foot', { ...DEFAULT_TAGS, preferMarkedTrails: false }))).toBe(today);
    expect(JSON.stringify(buildCustomModel('foot_turns', DEFAULT_TAGS))).toBe(JSON.stringify(buildCustomModel('foot_turns', { ...DEFAULT_TAGS, preferMarkedTrails: undefined })));
    expect(buildCustomModel('foot', {})).toBeNull();
    expect(buildCustomModel('out_run', DEFAULT_TAGS)).toBeNull();
  });
  it('on: adds ONE statement after the existing ones; the existing ones are untouched', () => {
    const off = buildCustomModel('foot', DEFAULT_TAGS)!.priority;
    const on = buildCustomModel('foot', trailsTags)!.priority;
    expect(on.slice(0, off.length)).toEqual(off);
    expect(on).toHaveLength(off.length + 1);
    expect(on[on.length - 1]).toMatchObject({ multiply_by: PREFER_TRAILS_PAVED_MULTIPLIER });
    expect(on[on.length - 1].if).toContain('foot_network == MISSING');
  });
  it('never boosts above 1 and never names trail-like classes (they stay un-penalised)', () => {
    for (const p of ['foot', 'foot_turns', 'out_run'] as const) {
      for (const s of buildCustomModel(p, trailsTags)?.priority ?? []) expect(Number(s.multiply_by)).toBeLessThanOrEqual(1);
    }
    const stmt = buildCustomModel('foot', trailsTags)!.priority.at(-1)!;
    for (const c of ['PATH', 'TRACK', 'BRIDLEWAY', 'FOOTWAY', 'STEPS']) expect(stmt.if).not.toContain(c);
  });
  it('out_run (quiet streets baked in) gets only the trail statement; bike profiles are untouched', () => {
    expect(buildCustomModel('out_run', { preferMarkedTrails: true })!.priority).toHaveLength(1);
    expect(buildCustomModel('bike', { preferMarkedTrails: true })).toBeNull();
    expect(buildCustomModel('mtb', { preferMarkedTrails: true })).toBeNull();
  });
  it('request body: off is identical to a plain request', () => {
    const p = { start, distanceM: 5000, seed: 1, profile: 'foot' as const };
    expect(JSON.stringify(buildRoundTripRequest({ ...p, tags: DEFAULT_TAGS }))).toBe(JSON.stringify(buildRoundTripRequest({ ...p, tags: { ...DEFAULT_TAGS, preferMarkedTrails: false } })));
    expect(buildRoundTripRequest({ ...p, tags: trailsTags }).custom_model!.priority).toHaveLength(9);
  });
});

describe('wire + decision', () => {
  const base = { start, targetKm: 5 };
  it('parses preferTrails only for running/walking, and only when exactly true', () => {
    expect(parseGenerateRequest({ ...base, activity: 'running', preferTrails: true })).toMatchObject({ preferTrails: true });
    expect(parseGenerateRequest({ ...base, activity: 'cycling', preferTrails: true })).not.toHaveProperty('preferTrails');
    expect(parseGenerateRequest({ ...base, activity: 'running', preferTrails: 'yes' })).not.toHaveProperty('preferTrails');
    expect(parseGenerateRequest({ ...base, activity: 'running' })).toEqual({ mode: 'loop', start, targetKm: 5, activity: 'running', seed: 0, maxResults: 3 });
  });
  it('app side: not in the big (Technion) cities, only on foot', () => {
    expect(shouldPreferTrails('running', undefined)).toBe(true);
    expect(shouldPreferTrails('walking', 'מועצה אזורית הגלבוע')).toBe(true);
    expect(shouldPreferTrails('running', 'חיפה')).toBe(false);
    expect(shouldPreferTrails('cycling', undefined)).toBe(false);
    expect(shouldPreferTrails('workout', undefined)).toBe(false);
  });
});

describe('loop service + scoring', () => {
  const answer = () => GH.passing5km;
  it('flag off: requests and results are identical to before', async () => {
    const a = fakeClient(answer), b = fakeClient(answer);
    const plain = await generateLoops(a, { start, targetKm: 5, activity: 'running', seed: 0 });
    const off = await generateLoops(b, { start, targetKm: 5, activity: 'running', seed: 0, preferTrails: false });
    expect(JSON.stringify(b.bodies)).toBe(JSON.stringify(a.bodies));
    expect(JSON.stringify(off.loops)).toBe(JSON.stringify(plain.loops));
    expect(plain.loops.every(l => l.trailShare === undefined)).toBe(true);
  });
  it('flag on: every request carries the extra statement; cycling never does', async () => {
    const on = fakeClient(answer);
    await generateLoops(on, { start, targetKm: 5, activity: 'running', seed: 0, preferTrails: true });
    expect(on.bodies.length).toBeGreaterThan(0);
    expect(on.bodies.every(x => x.custom_model!.priority.length === 9)).toBe(true);
    const bike = fakeClient(answer);
    await generateLoops(bike, { start, targetKm: 5, activity: 'cycling', seed: 0, preferTrails: true });
    expect(bike.bodies.every(x => x.profile === 'bike' && x.custom_model!.priority.length === 3)).toBe(true);
  });
  it('trail share counts path/track/bridleway only; the bonus is a small tie-breaker', () => {
    expect(trailShareOf({ path: 0.2, track: 0.3, bridleway: 0.1, footway: 0.4 })).toBeCloseTo(0.6, 9);
    expect(trailShareOf({})).toBe(0);
    expect(trailShareOf({ path: 0.8, track: 0.8 })).toBe(1);
    expect(TRAIL_SCORE_WEIGHT).toBeLessThan(1);
  });
  it('scoreLoop: off = unchanged; on = score drops by weight × share and distance/verdict are untouched', () => {
    const r = routed(GH.passing5km);
    const cand = { source: 'round_trip' as const, routed: { ...r, roadClassShare: { ...r.roadClassShare, path: 0.5 } }, calls: 1 };
    const off = scoreLoop(cand, 5, null);
    const on = scoreLoop(cand, 5, null, undefined, true);
    expect(scoreLoop(cand, 5, null, undefined, false)).toEqual(off);
    expect(on.trailShare).toBeCloseTo(0.5, 9);
    expect(on.score).toBeCloseTo(off.score - TRAIL_SCORE_WEIGHT * 0.5, 9);
    expect(on.verdict).toEqual(off.verdict);
    expect(on.distanceKm).toBe(off.distanceKm);
  });
});
