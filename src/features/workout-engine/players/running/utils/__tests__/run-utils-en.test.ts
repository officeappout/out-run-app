/**
 * The run utils' generated text follows the UI language. English must not leak Hebrew from the builders
 * (titles, units, strip labels, legs, elevation legend, swap and route texts, live helpers); Hebrew is pinned
 * byte for byte by run-utils-he-baseline.test.ts. Block labels in the fixtures are the template's own Hebrew
 * (display of those is covered by run-block-label.test.ts), so only the builders' words are asserted here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enPlayer from '@/messages/en/player.json';
import enCommon from '@/messages/en/common.json';
import hePlayer from '@/messages/he/player.json';
import { useLocaleStore } from '@/store/useLocaleStore';
import { __resetCatalogsForTests, registerCatalog } from '@/lib/i18n/catalogs';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';
import type { RunBlock } from '../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType, WorkoutCategory } from '../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../core/types/running.types';
import { runTypeLabel, RUN_KIND_STYLE } from '../run-preview/run-kind';
import { buildRunPreviewModel } from '../run-preview/run-preview-model';
import { buildRunStructure } from '../run-preview/run-structure';
import { fmtMeters, fmtSeconds, blockSizeLabel, bareBlockSize } from '../run-preview/run-title';
import { runWeekContextLabel } from '../run-preview/run-week';
import { SURFACE_TILES } from '../run-preview/run-surfaces';
import { buildRunOverviewLegs } from '../run-overview/run-overview-legs';
import { buildWorkoutElevation } from '../run-overview/run-elevation-bands';
import { buildRunVariants, bareSize } from '../run-overview/run-variants';
import { mainSetTitle, readMainSet, sizeLabel } from '../run-overview/run-main-set';
import { applyMainSet } from '../run-overview/run-main-set';
import { buildSwapAlternatives, swapDeltaText } from '../run-overview/run-swap-alternatives';
import { accessText } from '../run-overview/run-route-choice';
import { blockDisplayLabel, fmtDistance, paceClassText, repSummary } from '../../lib/planned-rep-results';
import { lapsLabel } from '../../lib/route-fit/distance-fit';
import { defaultCommonT } from '@/lib/i18n/units';
import type { RunPaceContext } from '../run-preview/run-estimates';

const HEBREW = /[֐-׿]/;
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
    out.push(blk({ type: 'interval', distanceMeters: 400, label: `400 מ׳ (${i + 1}/6)`, zoneType: 'interval_short' }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return out;
}
const tempo = (): RunBlock[] => [
  blk({ type: 'warmup', label: 'חימום', durationSeconds: 720, zoneType: 'easy' }),
  blk({ type: 'run', label: 'טמפו', durationSeconds: 1200, distanceMeters: 3810, zoneType: 'tempo' }),
  blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 600, zoneType: 'easy' }),
];
const easy35 = (): RunBlock[] => [blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 35 * 60, zoneType: 'easy' })];

beforeEach(() => {
  __resetCatalogsForTests();
  registerCatalog('en', 'player', enPlayer as Record<string, string>);
  registerCatalog('en', 'common', enCommon as Record<string, string>);
  useLocaleStore.setState({ locale: 'en' });
});
afterEach(() => useLocaleStore.setState({ locale: 'he', gender: 'other' }));

describe('run utils in English', () => {
  it('units and sizes', () => {
    expect(fmtMeters(400)).toBe('400 m');
    expect(fmtMeters(1500)).toBe('1.5 km');
    expect(fmtSeconds(45)).toBe('45 sec');
    expect(fmtSeconds(150)).toBe('2:30 min');
    expect(blockSizeLabel(blk({ distanceMeters: 400 }))).toBe('400 m');
    expect(bareBlockSize(blk({ durationSeconds: 150 }))).toBe('2:30');
    expect(bareSize(blk({ distanceMeters: 1200 }))).toBe('1.2');
    // Stored labels stay Hebrew whatever the UI language is.
    expect(sizeLabel('m', 400, defaultCommonT())).toBe('400 מ׳');
  });

  it('preview model: type, title, meta, strip, week, ladder, surfaces', () => {
    const m = buildRunPreviewModel({ blocks: sixBy400(), title: 'x' }, { basePace: 330, zones, week: { week: 3, day: 2, totalWeeks: 8 } });
    expect(m.typeLabel).toBe('Intervals');
    expect(m.title).toBe('6 × 400 m');
    expect(m.weekLabel).toBe('Week 3 of 8 · Workout 2 this week');
    expect(runWeekContextLabel({ week: 3, day: 2 }, { short: true })).toBe('Week 3 · Workout 2');
    expect(m.meta.join(' | ')).toMatch(/min \| ~[\d.]+ km \| 6 reps @ /);
    expect(m.stripLabels).toEqual(['Warm-up · 10 min', 'Main · 6 reps', 'Cool-down · 8 min']);
    expect(m.ladder.map((l) => l.label)).toEqual(['Easy', 'Long', 'Tempo', 'Interval', 'Sprint']);
    expect(Object.values(SURFACE_TILES).map((s) => s.label)).toEqual(['Athletics track', 'Park trail', 'Promenade or road']);
    const t = buildRunPreviewModel({ blocks: tempo(), title: 'x' }, { basePace: 330, zones });
    expect(t.title).toBe('Tempo 20 min');
    expect(t.stripLabels[1]).toBe('Tempo · 20 min');
    expect(runTypeLabel('hill_sprints', 'interval')).toBe('Hill sprints');
    expect(RUN_KIND_STYLE.long.label).toBe('Long run');
  });

  it('category labels: Hebrew table is the catalog source', () => {
    for (const [cat, he] of Object.entries(RUNNING_WORKOUT_CATEGORY_LABELS_HE)) {
      expect((hePlayer as Record<string, string>)[`runUtils.category.${cat}`]).toBe(he);
      expect(HEBREW.test(runTypeLabel(cat as WorkoutCategory, 'easy'))).toBe(false);
    }
  });

  it('structure and legs carry no builder Hebrew', () => {
    const steps = buildRunStructure(sixBy400(), ctx);
    expect(steps.map((s) => s.title)).toEqual(['Warm-up', 'Main set', 'Cool-down']);
    const legs = buildRunOverviewLegs(sixBy400(), ctx, { kind: 'interval', walk: { thereMin: 4, backMin: 4 } });
    const g = legs.find((l) => l.kind === 'group');
    if (!g || g.kind !== 'group') throw new Error('group');
    expect(g.stripLabel).toBe('6 × 400 m');
    expect(g.rows[1].paceText).toBe('Rest');
    expect(g.meta?.map((x) => x.text).join(' ')).toMatch(/km.*min/);
    expect(legs[0]).toMatchObject({ kind: 'transport', label: 'Walk to the route' });
    expect(legs[legs.length - 1]).toMatchObject({ kind: 'transport', label: 'Walk back' });
    const easy = buildRunOverviewLegs(easy35(), ctx, { kind: 'easy' })[0];
    expect(easy).toMatchObject({ title: 'Easy run', badge: 'Conversational pace' });
  });

  it('variants, elevation, swaps, main set', () => {
    expect(buildRunVariants(easy35(), ctx)!.map((v) => v.label)).toEqual(['30 min', '35 min', '45 min']);
    const geo = buildWorkoutElevation(sixBy400(), ctx, { stepM: 100, elevationsM: Array.from({ length: 41 }, (_, i) => 10 + (i % 10)) }, { loop: true })!;
    expect(geo.laps[0].label).toBe('Lap 2');
    expect(geo.legend.map((l) => l.label)).toEqual(['Warm-up / cool-down', 'Reps of 400', 'Recovery']);
    expect(geo.caption).toMatch(/^Peak 19 m · climb \d+ m per lap$/);
    const src = readMainSet(sixBy400())!;
    expect(mainSetTitle(src.spec)).toBe('6 × 400 m');
    expect(mainSetTitle({ unit: 'm', reps: [200, 400, 200], recoverySec: 60 })).toBe('Pyramid');
    const groups = buildSwapAlternatives(src, ctx, { category: 'short_intervals' })!;
    for (const a of groups.flatMap((x) => x.items)) {
      expect(HEBREW.test(a.title + a.sub + swapDeltaText(a))).toBe(false);
    }
    expect(swapDeltaText({ deltaSec: -420, equalVolume: true, current: false })).toBe('−7 min · Same volume');
    // The written main set keeps Hebrew block labels (they are matched later).
    const labels = applyMainSet(sixBy400(), { ...src, work: { ...src.work, label: '400 מ׳' } }, { unit: 'm', reps: [100, 200], recoverySec: 30 }).map((b) => b.label);
    expect(labels.some((l) => l === '100 מ׳')).toBe(true);
  });

  it('route texts and live helpers', () => {
    expect(accessText(0.1)).toBe('Starts here');
    expect(accessText(0.6)).toBe('600 m from you');
    expect(lapsLabel(1)).toBe('One lap');
    expect(lapsLabel(1.5)).toBe('1.5 laps');
    expect(paceClassText({ band: 'in', deltaSec: 0 })).toBe('In range');
    expect(paceClassText({ band: 'slow', deltaSec: 7 })).toBe('7 sec slow');
    expect(paceClassText({ band: 'fast', deltaSec: -4 })).toBe('4 sec fast');
    expect(repSummary([{ inRange: true }, { inRange: false }] as never).label).toBe('1/2 in range');
    expect(fmtDistance(1250)).toBe('1.3 km');
    expect(blockDisplayLabel(blk({ label: 'Warmup 10 min' }))).toBe('Warm-up');
    expect(blockDisplayLabel(blk({ type: 'cooldown', label: '' }))).toBe('Cool-down');
  });
});
