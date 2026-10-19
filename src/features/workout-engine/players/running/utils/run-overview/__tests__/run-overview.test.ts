import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../../core/types/running.types';
import type { RunPaceContext } from '../../run-preview/run-estimates';
import { estimateRunTotals } from '../../run-preview/run-estimates';
import { applyRunVariant, bareSize, buildRunVariants } from '../run-variants';
import { buildRunOverviewLegs, routeWalkMinutes } from '../run-overview-legs';
import { buildWorkoutElevation, elevationAlongRun, EASY_BAND_COLOR } from '../run-elevation-bands';
import { plannedRunMapUrl, readVariantParam } from '../run-overview-url';
import { accessText, routeChoiceView } from '../run-route-choice';
import type { Route } from '@/features/parks/core/types/route.types';

let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });

const MID: Record<RunZoneType, number> = {
  walk: 600, jogging: 420, recovery: 450, easy: 395, long_run: 365,
  fartlek_medium: 330, tempo: 315, fartlek_fast: 300, interval_long: 300, interval_short: 290, sprint: 260,
};
const zones = Object.fromEntries(
  ALL_RUN_ZONES.map((z) => [z, { minPace: MID[z] - 5, maxPace: MID[z] + 5, label: '' } as ComputedPaceZone]),
) as Record<RunZoneType, ComputedPaceZone>;
const ctx: RunPaceContext = { basePace: 330, zones };

function sixBy400(): RunBlock[] {
  const out: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true })];
  for (let i = 0; i < 6; i++) {
    out.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return out;
}
function tempo2x10(): RunBlock[] {
  return [
    blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy' }),
    blk({ type: 'run', label: 'טמפו', durationSeconds: 600, zoneType: 'tempo' }),
    blk({ type: 'recovery', label: 'ג׳וג קל', durationSeconds: 120, _isSynthesizedRest: true }),
    blk({ type: 'run', label: 'טמפו', durationSeconds: 600, zoneType: 'tempo' }),
    blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy' }),
  ];
}
const easy35 = () => [blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 35 * 60, zoneType: 'easy' })];
const work = (bs: RunBlock[]) => bs.filter((b) => b.type === 'interval' || (b.type === 'run' && !b._isSynthesizedRest));

describe('run variants (M-6a selector)', () => {
  it('≥ 4 reps: ±2 reps, wrappers untouched, rep suffixes renumbered, unique ids', () => {
    const v = buildRunVariants(sixBy400(), ctx)!;
    expect(v.map((x) => x.label)).toEqual(['4 × 400', '6 × 400', '8 × 400']);
    expect(work(v[0].blocks)).toHaveLength(4);
    expect(work(v[2].blocks)).toHaveLength(8);
    expect(v[2].blocks[0].type).toBe('warmup');
    expect(v[2].blocks[v[2].blocks.length - 1].type).toBe('cooldown');
    expect(work(v[2].blocks).map((b) => b.label)).toEqual(Array.from({ length: 8 }, (_, i) => `400 מ׳ (${i + 1}/8)`));
    // A rest between every pair of reps, none after the last.
    const main = v[2].blocks.slice(1, -1);
    expect(main).toHaveLength(15);
    expect(main[main.length - 1].type).toBe('interval');
    expect(new Set(v[2].blocks.map((b) => b.id)).size).toBe(v[2].blocks.length);
  });
  it('2–3 reps: lighter shortens each rep (2 × 8), harder adds one (3 × 10)', () => {
    const v = buildRunVariants(tempo2x10(), ctx)!;
    expect(v.map((x) => x.label)).toEqual(['2 × 8', '2 × 10', '3 × 10']);
    expect(work(v[0].blocks).map((b) => b.durationSeconds)).toEqual([480, 480]);
    expect(work(v[2].blocks)).toHaveLength(3);
  });
  it('steady run: main time to a round 5 minutes (35′ → 30′ / 45′)', () => {
    const v = buildRunVariants(easy35(), ctx)!;
    expect(v.map((x) => x.label)).toEqual(['30 דק׳', '35 דק׳', '45 דק׳']);
    expect(v[0].blocks[0].durationSeconds).toBe(1800);
    expect(v[2].blocks[0].durationSeconds).toBe(2700);
  });
  it('applyRunVariant: planned / unknown → the same object', () => {
    const w = { blocks: sixBy400() };
    expect(applyRunVariant(w, 'planned', ctx)).toBe(w);
    expect(applyRunVariant(w, null, ctx)).toBe(w);
    expect(work(applyRunVariant(w, 'lighter', ctx).blocks)).toHaveLength(4);
  });
  it('no main set → null', () => {
    expect(buildRunVariants([], ctx)).toBeNull();
    expect(buildRunVariants([blk({ type: 'warmup', durationSeconds: 600 })], ctx)).toBeNull();
  });
  it('bareSize drops the unit', () => {
    expect(bareSize(blk({ distanceMeters: 400 }))).toBe('400');
    expect(bareSize(blk({ durationSeconds: 600 }))).toBe('10');
  });
});

describe('run overview legs (axis)', () => {
  it('intervals: warm-up leg → ONE group leg (6 ×, work + recovery rows with paces) → cool-down', () => {
    const legs = buildRunOverviewLegs(sixBy400(), ctx, { kind: 'interval' });
    expect(legs.map((l) => l.kind)).toEqual(['aerobic', 'group', 'aerobic']);
    const g = legs[1];
    if (g.kind !== 'group') throw new Error('group');
    expect(g.title).toBe('העיקר');
    expect(g.repeat).toBe(6);
    expect(g.stripLabel).toBe('6 × 400 מ׳');
    expect(g.rows.map((r) => r.tone)).toEqual(['work', 'recovery']);
    expect(g.rows[0].label).toMatch(/^400 מ׳ מהיר · ~/);
    expect(g.rows[0].paceText).toMatch(/\d:\d\d–\d:\d\d/);
    expect(g.rows[1].paceText).toBe('מנוחה');
    expect(g.meta?.map((m) => m.text)).toEqual([expect.stringMatching(/^~\d+\.\d ק״מ$/), expect.stringMatching(/^~\d+ דק׳$/)]);
    expect(g.color).toBeTruthy();
    const w = legs[0];
    if (w.kind !== 'aerobic') throw new Error('aerobic');
    expect(w.title).toBe('חימום');
    expect(w.meta.map((m) => m.text)).toContain('10 דק׳');
    expect(w.paceSecPerKm).toBe(395);
  });
  it('beginners: no pace numbers anywhere', () => {
    const legs = buildRunOverviewLegs(sixBy400(), ctx, { kind: 'interval', showPaceNumbers: false });
    const g = legs[1];
    if (g.kind !== 'group') throw new Error('group');
    expect(g.rows[0].paceText).toBeUndefined();
    expect(legs[0].kind === 'aerobic' && legs[0].paceSecPerKm).toBeFalsy();
  });
  it('tempo 2 × 10: grouped; easy: ONE steady leg with a pace band', () => {
    const t = buildRunOverviewLegs(tempo2x10(), ctx, { kind: 'tempo' });
    expect(t.map((l) => l.kind)).toEqual(['aerobic', 'group', 'aerobic']);
    const e = buildRunOverviewLegs(easy35(), ctx, { kind: 'easy' });
    expect(e).toHaveLength(1);
    if (e[0].kind !== 'aerobic') throw new Error('aerobic');
    expect(e[0].title).toBe('ריצה קלה');
    expect(e[0].badge).toBe('קצב שיחה');
    expect(e[0].paceText).toBe('6:30–6:40');
  });
  it('a chosen route adds the walk there / back as transport legs', () => {
    const legs = buildRunOverviewLegs(easy35(), ctx, { kind: 'easy', walk: { thereMin: 4, backMin: 4 } });
    expect(legs.map((l) => l.kind)).toEqual(['transport', 'aerobic', 'transport']);
    expect(routeWalkMinutes(0.1, true)).toBeNull();
    expect(routeWalkMinutes(0.6, true)).toEqual({ thereMin: 8, backMin: 8 });
    expect(routeWalkMinutes(0.6, false)).toEqual({ thereMin: 8, backMin: 0 });
  });
});

describe('elevation along the workout (graph page 2)', () => {
  const samples = { stepM: 100, elevationsM: [10, 20, 30, 20, 10] }; // a 400 m loop
  it('loops wrap, other shapes turn round', () => {
    const rising = { stepM: 100, elevationsM: [10, 20, 30, 40, 50] };
    expect(elevationAlongRun(rising, 500, true)).toBe(20); // lap 2, 100 m in
    expect(elevationAlongRun(rising, 500, false)).toBe(40); // turned round at 400 → back at 300 m
    expect(elevationAlongRun(samples, 0, true)).toBe(10);
  });
  it('bands follow the workout, laps are marked, legend + caption', () => {
    const blocks = sixBy400();
    const geo = buildWorkoutElevation(blocks, ctx, { stepM: 100, elevationsM: Array.from({ length: 41 }, (_, i) => 10 + (i % 10)) }, { loop: true })!;
    expect(geo.bands).toHaveLength(blocks.length);
    expect(geo.bands[0].color).toBe(EASY_BAND_COLOR);
    expect(Math.max(...geo.bands.map((b) => b.x + b.width))).toBeLessThanOrEqual(326.1);
    const totalKm = (estimateRunTotals(blocks, ctx).meters ?? 0) / 1000;
    expect(geo.laps.length).toBe(Math.ceil(totalKm / 4 - 0.1) - 1);
    expect(geo.laps[0].label).toBe('סיבוב 2');
    expect(geo.legend.map((l) => l.label)).toEqual(['חימום / שחרור', 'חזרות 400', 'התאוששות']);
    expect(geo.caption).toMatch(/^שיא 19 מ׳ · עלייה \d+ מ׳ לסיבוב$/);
  });
  it('no distance → null', () => {
    expect(buildWorkoutElevation([], ctx, samples, { loop: true })).toBeNull();
  });
});

describe('links + chosen route view', () => {
  it('the home link keeps today\'s params and adds variant / suggest', () => {
    expect(plannedRunMapUrl({ workoutId: 'w1_w3', week: 3, day: 2, autoStart: true, variant: 'planned' }))
      .toBe('/map?workoutId=w1_w3&week=3&day=2&context=running&autoStart=true');
    expect(plannedRunMapUrl({ workoutId: 'w1', week: 3, day: 2, suggest: true, variant: 'harder' }))
      .toBe('/map?workoutId=w1&week=3&day=2&context=running&suggest=1&variant=harder');
    expect(readVariantParam('lighter')).toBe('lighter');
    expect(readVariantParam('planned')).toBeNull();
    expect(readVariantParam('x')).toBeNull();
  });
  it('route view: name, km · laps · lit, access, walk, notes', () => {
    const M_LAT = 1 / 111_320;
    const lat = 32.08, lng = 34.78;
    const path: [number, number][] = [[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.005], [lng, lat + 0.005], [lng, lat]];
    const route = {
      id: 'r', name: 'לולאת הירקון', distance: 4.2, path, routeShape: 'loop',
      qualitySignals: { lighting: { status: 'computed', isLit: true } },
    } as unknown as Route;
    const v = routeChoiceView(route, { fit: { verdict: 'laps', laps: 1.5, endsAtStart: true, turnaroundKm: null, score: 1, reason: null, caution: null } },
      { lat: lat - 600 * M_LAT, lng });
    expect(v.name).toBe('לולאת הירקון');
    expect(v.lapsText).toBe('1.5 סיבובים');
    expect(v.meta[0]).toMatch(/ק״מ$/);
    expect(v.accessText).toBe('600 מ׳ ממך');
    expect(v.walk!.thereMin).toBeGreaterThanOrEqual(7);
    expect(v.walk!.backMin).toBe(v.walk!.thereMin); // a loop brings you back
    expect(v.onRouteNote).toBe('על לולאת הירקון — 1.5 סיבובים');
    expect(v.headerLine).toBe('על לולאת הירקון · 1.5 סיבובים · 600 מ׳ ממך');
    expect(accessText(0.1)).toBe('מתחיל כאן');
    expect(accessText(null)).toBeNull();
  });
});
