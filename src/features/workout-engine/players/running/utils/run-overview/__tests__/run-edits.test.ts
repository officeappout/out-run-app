/**
 * Run overview edits (boards M-7a…7d, enable_home_v2): pace edit, main-set
 * swap candidates, level structures, and the workout the player gets.
 */
import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../../core/types/running.types';
import type { RunPaceContext } from '../../run-preview/run-estimates';
import { blockTargetBand } from '../../run-preview/run-estimates';
import { resolveBlockTargetPace } from '../../../lib/planned-rep-results';
import { buildRunVariants } from '../run-variants';
import { applyMainSet, decodeMainSet, encodeMainSet, mainSetTitle, readMainSet, recoveryText } from '../run-main-set';
import { buildSwapAlternatives, swapDeltaText } from '../run-swap-alternatives';
import {
  applyPaceOverrides, hasPaceOverride, paceEditTarget, paceOverridesOf, paceTargetKey, paceVerdict, paceZoneBar,
  personalRange, shiftBand,
} from '../run-pace-override';
import {
  applyRunEdits, isCustomized, NO_RUN_EDITS, readRunEditParams, runEditsToParams, withPace, withSwap, withVariant,
} from '../run-edits';
import { plannedRunMapUrl } from '../run-overview-url';
import { buildRunOverviewLegs } from '../run-overview-legs';
import type { GroupLeg, AerobicLeg } from '@/features/parks/core/components/overview/overview-legs';

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
    out.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short', isQualityExercise: true }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return out;
}
const reps = (bs: readonly RunBlock[]) => bs.filter((b) => b.type === 'interval');
const rests = (bs: readonly RunBlock[]) => bs.filter((b) => b._isSynthesizedRest);

describe('level selector = main-set structure (M-7d)', () => {
  it('קליל 4 reps · 2′, מאוזן 6 · 90″, עוצמתי 8 · 60″ — paces unchanged, warm-up / cool-down untouched', () => {
    const [l, p, h] = buildRunVariants(sixBy400(), ctx)!;
    expect([reps(l.blocks).length, reps(p.blocks).length, reps(h.blocks).length]).toEqual([4, 6, 8]);
    expect(new Set(rests(l.blocks).map((b) => b.durationSeconds))).toEqual(new Set([120]));
    expect(new Set(rests(p.blocks).map((b) => b.durationSeconds))).toEqual(new Set([90]));
    expect(new Set(rests(h.blocks).map((b) => b.durationSeconds))).toEqual(new Set([60]));
    for (const v of [l, p, h]) {
      expect(blockTargetBand(reps(v.blocks)[0], ctx)).toEqual({ min: 285, max: 295 });
      expect(v.blocks[0].durationSeconds).toBe(600);
      expect(v.blocks[v.blocks.length - 1].durationSeconds).toBe(480);
    }
  });
});

describe('main set spec', () => {
  it('reads 6 × 400 · 90″, round-trips the URL form, rejects junk', () => {
    const src = readMainSet(sixBy400())!;
    expect(src.spec).toEqual({ unit: 'm', reps: [400, 400, 400, 400, 400, 400], recoverySec: 90 });
    const key = encodeMainSet(src.spec);
    expect(key).toBe('m:400.400.400.400.400.400~90');
    expect(decodeMainSet(key)).toEqual(src.spec);
    expect(decodeMainSet('x:1~2')).toBeNull();
    expect(decodeMainSet('m:400~9999')).toBeNull();
    expect(decodeMainSet(null)).toBeNull();
  });
  it('writes 4 × 600 · 2′: rep keeps zone / quality, labels renumbered, rests between only, wrappers kept', () => {
    const base = sixBy400();
    const out = applyMainSet(base, readMainSet(base)!, { unit: 'm', reps: [600, 600, 600, 600], recoverySec: 120 });
    expect(reps(out).map((b) => b.label)).toEqual(['600 מ׳ (1/4)', '600 מ׳ (2/4)', '600 מ׳ (3/4)', '600 מ׳ (4/4)']);
    expect(reps(out).every((b) => b.distanceMeters === 600 && b.zoneType === 'interval_short' && b.isQualityExercise)).toBe(true);
    expect(rests(out).map((b) => b.durationSeconds)).toEqual([120, 120, 120]);
    expect(out[0].type).toBe('warmup');
    expect(out[out.length - 1].type).toBe('cooldown');
    expect(out[out.length - 2].type).toBe('interval');
    expect(new Set(out.map((b) => b.id)).size).toBe(out.length);
    expect(mainSetTitle(readMainSet(out)!.spec)).toBe('4 × 600 מ׳');
  });
  it('recovery text', () => {
    expect([recoveryText(45), recoveryText(90), recoveryText(120), recoveryText(150)]).toEqual(['45″', '90″', '2′', '2:30′']);
  });
});

describe('swap candidates (M-7b)', () => {
  const groups = buildSwapAlternatives(readMainSet(sixBy400()), ctx, { category: 'short_intervals' })!;
  const by = (level: string) => groups.find((g) => g.level === level)!.items;

  it('easier / same / harder, the current one first and marked', () => {
    expect(groups.map((g) => g.level)).toEqual(['lower', 'same', 'higher']);
    expect(by('same')[0]).toMatchObject({ title: '6 × 400 מ׳', current: true, sub: '400 מהיר · 90″ התאוששות' });
    expect(swapDeltaText(by('same')[0])).toBe('—');
    expect(groups.flatMap((g) => g.items).filter((a) => a.current)).toHaveLength(1);
  });
  it('same volume (±10 %) with the recovery scaled to the rep; a ladder of the same volume', () => {
    const same = by('same');
    const s600 = same.find((a) => a.title === '4 × 600 מ׳')!;
    expect(s600).toMatchObject({ equalVolume: true, sub: '600 מהיר · 2′ התאוששות' });
    expect(same.find((a) => a.title === '8 × 300 מ׳')?.equalVolume).toBe(true);
    expect(same.find((a) => a.title === 'סולם')?.sub).toBe('400-800-1200 · 90″ בין');
    for (const a of same.filter((x) => !x.current)) {
      const vol = a.spec.reps.reduce((x, y) => x + y, 0);
      expect(Math.abs(vol - 2400)).toBeLessThanOrEqual(240);
    }
  });
  it('easier = fewer reps + longer recovery, half-size reps; harder = longer same-volume reps, shorter recovery', () => {
    expect(by('lower').map((a) => [a.title, a.spec.recoverySec])).toEqual([['4 × 400 מ׳', 120], ['8 × 200 מ׳', 60]]);
    expect(by('higher').map((a) => [a.title, a.spec.recoverySec])).toEqual([['3 × 800 מ׳', 150], ['6 × 400 מ׳', 45]]);
    expect(by('lower').every((a) => (a.deltaSec ?? 0) < 0)).toBe(true);
    expect(swapDeltaText(by('lower')[0])).toBe('−5 דק׳'); // 4 × 116″ + 3 × 2′ vs 6 × 116″ + 5 × 90″
    expect(swapDeltaText(by('higher')[0])).toMatch(/אותו נפח$/);
  });
  it('time deltas come from the zone paces (400 m at 4:50 → 116″ a rep)', () => {
    const s600 = by('same').find((a) => a.title === '4 × 600 מ׳')!;
    // 2400 m × 290 s/km + 3 × 120″  vs  2400 m × 290 + 5 × 90″
    expect(s600.deltaSec).toBe(696 + 360 - (696 + 450));
  });
  it('mini intensity bars: work bars by time, recoveries low', () => {
    const cur = by('same')[0];
    expect(cur.bars).toHaveLength(11);
    expect(cur.bars[0]).toEqual({ tone: 'work', flex: 1.93, height: 100 });
    expect(cur.bars[1]).toEqual({ tone: 'rest', flex: 1.5, height: 30 });
  });
  it('marks a swapped-in set as current; no main set → null', () => {
    const g = buildSwapAlternatives(readMainSet(sixBy400()), ctx, { selectedKey: 'm:600.600.600.600~120' })!;
    expect(g.flatMap((x) => x.items).find((a) => a.current)?.title).toBe('4 × 600 מ׳');
    expect(buildSwapAlternatives(readMainSet([blk({ durationSeconds: 1800, zoneType: 'easy' })]), ctx)).toBeNull();
  });
  it('long intervals never offer reps under 400 m', () => {
    const g = buildSwapAlternatives(readMainSet(sixBy400()), ctx, { category: 'long_intervals' })!;
    const all = g.flatMap((x) => x.items).filter((a) => !a.current);
    expect(all.filter((a) => a.spec.reps.length > 3).every((a) => a.spec.reps.every((r) => r >= 300))).toBe(true);
  });
});

describe('pace edit (M-7a)', () => {
  it('targets by phase + zone; ±5″ steps; personal range 4:40–5:00; verdicts', () => {
    const base = sixBy400();
    expect(paceTargetKey(base[1])).toBe('main.interval_short');
    expect(paceTargetKey(base[0])).toBe('warmup.easy');
    expect(paceTargetKey(base[2])).toBeNull();
    const planned = { min: 285, max: 295 };
    expect(shiftBand(planned, -5)).toEqual({ min: 280, max: 290 });
    expect(personalRange(planned)).toEqual({ min: 280, max: 300 });
    expect(paceVerdict({ min: 280, max: 290 }, personalRange(planned))).toBeNull();
    expect(paceVerdict({ min: 270, max: 280 }, personalRange(planned))).toBe('fast');
    expect(paceVerdict({ min: 300, max: 310 }, personalRange(planned))).toBe('slow');
  });
  it('the zone bar puts fast on the right and spans both bands', () => {
    const g = paceZoneBar({ min: 280, max: 300 }, { min: 270, max: 280 });
    expect(g.band.right).toBeLessThan(g.range.right);
    expect(g.range.width).toBeGreaterThan(0);
    expect(g.band.right + g.band.width).toBeLessThanOrEqual(100);
  });
  it('overrides reach the player targets (resolveBlockTargetPace) and only their own target', () => {
    const out = applyPaceOverrides(sixBy400(), { 'main.interval_short': { min: 280, max: 290 } });
    expect(resolveBlockTargetPace(reps(out)[0], 330, zones)).toEqual({ min: 280, max: 290 });
    expect(resolveBlockTargetPace(out[0], 330, zones)).toEqual({ min: 390, max: 400 });
    expect(hasPaceOverride(out)).toBe(true);
    expect(paceOverridesOf(out)).toEqual([{ key: 'main.interval_short', minPaceSec: 280, maxPaceSec: 290 }]);
    expect(applyPaceOverrides(sixBy400(), {}).some((b) => b.paceOverride)).toBe(false);
  });
  it('the sheet target: planned vs current, subtitle, rep distance', () => {
    const out = applyPaceOverrides(sixBy400(), { 'main.interval_short': { min: 280, max: 290 } });
    expect(paceEditTarget(out, 'main.interval_short', ctx)).toEqual({
      key: 'main.interval_short', planned: { min: 285, max: 295 }, current: { min: 280, max: 290 }, edited: true,
      subtitle: 'חזרות 400 מ׳ · 6 ×', repMeters: 400,
    });
    expect(paceEditTarget(sixBy400(), 'warmup.easy', ctx)).toMatchObject({ subtitle: 'חימום', edited: false, repMeters: null });
    expect(paceEditTarget(sixBy400(), 'main.tempo', ctx)).toBeNull();
  });
});

describe('the workout the player runs (applyRunEdits)', () => {
  type W = { id: string; blocks: RunBlock[]; mainSwap?: { from: string; to: string } };
  const w = (): W => ({ id: 'w', blocks: sixBy400() });
  it('no edits → the same object; a level alone is not "מותאם"', () => {
    const x = w();
    expect(applyRunEdits(x, NO_RUN_EDITS, ctx)).toBe(x);
    expect(isCustomized(withVariant(NO_RUN_EDITS, 'lighter'))).toBe(false);
  });
  it('a swap wins over the level, records "היה …", keeps the paces', () => {
    let e = withVariant(NO_RUN_EDITS, 'lighter');
    e = withSwap(e, 'm:600.600.600.600~120');
    e = withPace(e, 'main.interval_short', { min: 280, max: 290 });
    const out = applyRunEdits(w(), e, ctx);
    expect(reps(out.blocks).map((b) => b.distanceMeters)).toEqual([600, 600, 600, 600]);
    expect(out.mainSwap).toEqual({ from: '4 × 400 מ׳', to: '4 × 600 מ׳' });
    expect(reps(out.blocks).every((b) => b.paceOverride?.min === 280)).toBe(true);
    expect(isCustomized(e)).toBe(true);
    // Picking a level clears the swap (board M-7c note).
    expect(withVariant(e, 'harder').swap).toBeNull();
    // Reset a pace.
    expect(withPace(e, 'main.interval_short', null).paces).toEqual({});
  });
  it('a pyramid swap', () => {
    const out = applyRunEdits(w(), withSwap(NO_RUN_EDITS, 'm:200.400.600.400.200~90'), ctx);
    expect(reps(out.blocks).map((b) => b.distanceMeters)).toEqual([200, 400, 600, 400, 200]);
    expect(out.mainSwap?.to).toBe('פירמידה');
  });
  it('edits travel in the map link and back', () => {
    const e = withPace(withSwap(withVariant(NO_RUN_EDITS, 'harder'), 'm:800.800.800~150'), 'warmup.easy', { min: 380, max: 395 });
    const url = plannedRunMapUrl({ workoutId: 'x', week: 3, day: 2, autoStart: true, edits: e });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(readRunEditParams({ variant: q.get('variant'), swap: q.get('swap'), pace: q.get('pace') })).toEqual(e);
    expect(runEditsToParams(NO_RUN_EDITS)).toEqual({});
    expect(readRunEditParams({ pace: 'main.x:1-2,bad', swap: 'nope' })).toEqual(NO_RUN_EDITS);
  });
});

describe('axis legs carry the edit targets', () => {
  it('group rows / warm-up pill get paceKey + edited; a pyramid collapses into ONE "העיקר" group', () => {
    const edited = applyRunEdits({ blocks: sixBy400() }, withPace(NO_RUN_EDITS, 'warmup.easy', { min: 380, max: 390 }), ctx);
    const legs = buildRunOverviewLegs(edited.blocks, ctx, { kind: 'interval' });
    const warm = legs[0] as AerobicLeg;
    expect(warm).toMatchObject({ paceKey: 'warmup.easy', paceEdited: true, paceText: '6:20–6:30' });
    const main = legs.find((l) => l.kind === 'group') as GroupLeg;
    expect(main.key).toBe('main-0');
    expect(main.rows[0]).toMatchObject({ paceKey: 'main.interval_short', paceEdited: false });
    expect(main.rows[1].paceKey).toBeUndefined();

    const pyr = applyRunEdits({ blocks: sixBy400() }, withSwap(NO_RUN_EDITS, 'm:200.400.600.400.200~90'), ctx);
    const pl = buildRunOverviewLegs(pyr.blocks, ctx, { kind: 'interval', collapseMain: { stripLabel: 'פירמידה' } });
    const groups = pl.filter((l) => l.kind === 'group') as GroupLeg[];
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'main-0', title: 'העיקר', stripLabel: 'פירמידה' });
    expect(groups[0].rows.filter((r) => r.tone === 'work')).toHaveLength(5);
    expect(groups[0].rows.filter((r) => r.tone === 'recovery')).toHaveLength(1);
    expect(pl.filter((l) => l.kind === 'aerobic')).toHaveLength(2);
  });
});
