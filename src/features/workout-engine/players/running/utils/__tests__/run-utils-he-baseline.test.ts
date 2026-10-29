/**
 * i18n: the run utils' generated text (titles, units, labels, pace and distance formatting) moves to the `player`
 * and `common` catalogs. Snapshots were recorded from origin/main BEFORE the extraction; Hebrew must stay byte-identical.
 */
import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType, WorkoutCategory } from '../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../core/types/running.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { RUN_KIND_STYLE, runTypeLabel, type RunKind } from '../run-preview/run-kind';
import { buildRunPreviewModel } from '../run-preview/run-preview-model';
import { buildRunStructure } from '../run-preview/run-structure';
import { buildRunJourney } from '../run-preview/run-journey';
import { buildZoneLadder } from '../run-preview/run-zone-ladder';
import { SURFACE_TILES } from '../run-preview/run-surfaces';
import { fmtMeters, fmtSeconds, blockSizeLabel, buildRunDisplayTitle } from '../run-preview/run-title';
import { runWeekContextLabel, runWeekSummary } from '../run-preview/run-week';
import { stripPhaseLabels } from '../run-preview/run-strip';
import { groupBlocksIntoSections } from '../run-preview/run-sections';
import { buildRunOverviewLegs } from '../run-overview/run-overview-legs';
import { buildWorkoutElevation } from '../run-overview/run-elevation-bands';
import { applyRunVariant, bareSize, buildRunVariants } from '../run-overview/run-variants';
import { applyMainSet, mainSetTitle, readMainSet, recoveryText, sizeLabel } from '../run-overview/run-main-set';
import { buildSwapAlternatives, swapDeltaText } from '../run-overview/run-swap-alternatives';
import { paceEditTarget, paceOverridesOf, paceTargetKey } from '../run-overview/run-pace-override';
import { accessText, routeChoiceView } from '../run-overview/run-route-choice';
import { blockDisplayLabel, fmtDistance, paceClassText, repSummary } from '../../lib/planned-rep-results';
import { lapsLabel } from '../../lib/route-fit/distance-fit';
import type { RunPaceContext } from '../run-preview/run-estimates';

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
  for (let i = 0; i < 4; i++) {
    out.push(blk({ type: 'run', label: `סטריידס (${i + 1}/4)`, durationSeconds: 20, blockMode: 'effort', effortConfig: { effortLevel: 'hard' }, _isDynamicWrapper: true, drillRef: { exerciseId: 'd1' } }));
    if (i < 3) out.push(blk({ type: 'walk', label: 'הליכת התאוששות', durationSeconds: 45, _isSynthesizedRest: true, _isDynamicWrapper: true }));
  }
  for (let i = 0; i < 6; i++) {
    out.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return out;
}
function timeReps(): RunBlock[] {
  const out: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy' })];
  for (let i = 0; i < 5; i++) {
    out.push(blk({ type: 'interval', label: `3 דק׳ (${i + 1}/5)`, durationSeconds: 180, zoneType: 'interval_long' }));
    if (i < 4) out.push(blk({ type: 'recovery', label: 'ג׳וג', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy' }));
  return out;
}
function pyramid(): RunBlock[] {
  const out: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy' })];
  [200, 400, 600, 400, 200].forEach((m, i, a) => {
    out.push(blk({ type: 'interval', label: `${m} מ׳`, distanceMeters: m, zoneType: 'interval_short' }));
    if (i < a.length - 1) out.push(blk({ type: 'recovery', label: 'התאוששות', durationSeconds: 60, _isSynthesizedRest: true }));
  });
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy' }));
  return out;
}
const tempo = (): RunBlock[] => [
  blk({ type: 'warmup', label: 'חימום', durationSeconds: 720, zoneType: 'easy' }),
  blk({ type: 'run', label: 'טמפו', durationSeconds: 1200, distanceMeters: 3810, zoneType: 'tempo' }),
  blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 600, zoneType: 'easy' }),
];
const easy35 = (): RunBlock[] => [blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 35 * 60, zoneType: 'easy' })];
const longKm = (): RunBlock[] => [
  blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy' }),
  blk({ type: 'run', label: 'ריצה ארוכה', durationSeconds: 0, distanceMeters: 12000, zoneType: 'long_run' }),
  blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy' }),
];
const walkRun = (): RunBlock[] => [
  blk({ type: 'run', label: 'ריצה', durationSeconds: 120, zoneType: 'jogging' }),
  blk({ type: 'walk', label: 'הליכה', durationSeconds: 90, zoneType: 'walk' }),
  blk({ type: 'run', label: 'ריצה', durationSeconds: 120, zoneType: 'jogging' }),
  blk({ type: 'walk', label: 'הליכה', durationSeconds: 90, zoneType: 'walk' }),
];
const ladderZones = (): RunBlock[] => [
  blk({ type: 'run', label: 'הליכה', durationSeconds: 60, zoneType: 'walk' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'jogging' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'recovery' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'fartlek_medium' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'fartlek_fast' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'sprint' }),
  blk({ type: 'run', label: '2 דק׳', durationSeconds: 120, zoneType: 'interval_long' }),
  blk({ type: 'run', label: 'ריצה רציפה', durationSeconds: 300, blockMode: 'effort', effortConfig: { effortLevel: 'moderate' } }),
  blk({ type: 'run', label: 'ריצה רציפה', durationSeconds: 300, blockMode: 'effort', effortConfig: { effortLevel: 'max' } }),
];
const SETS: Record<string, () => RunBlock[]> = { sixBy400, timeReps, pyramid, tempo, easy35, longKm, walkRun, ladderZones };
const CATEGORIES: WorkoutCategory[] = ['easy_run', 'long_run', 'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured', 'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'strides'];
const KINDS: RunKind[] = ['easy', 'interval', 'tempo', 'long'];
const bands = (b: RunBlock[]) => b.map((x) => ({ ...x, id: '' }));

describe('run utils: Hebrew baseline (recorded from origin/main)', () => {
  it('preview models', () => {
    const out: Record<string, unknown> = {};
    for (const [name, mk] of Object.entries(SETS)) {
      for (const show of [true, false]) {
        out[`${name}/${show}`] = buildRunPreviewModel(
          { blocks: mk(), title: 'שם תבנית', category: undefined },
          { basePace: 330, zones, showPaceNumbers: show, week: { week: 3, day: 2, totalWeeks: 8 } },
        );
      }
    }
    out.cat = CATEGORIES.map((c) => runTypeLabel(c, 'easy'));
    out.kind = KINDS.map((k) => [runTypeLabel(null, k), RUN_KIND_STYLE[k].label]);
    out.surfaces = Object.values(SURFACE_TILES);
    out.ladder = buildZoneLadder(zones, 'tempo');
    expect(JSON.parse(JSON.stringify(out, (_k, v) => (v === undefined ? null : v)))).toMatchSnapshot();
  });
  it('structure, journey, titles, strips, sections', () => {
    const out: Record<string, unknown> = {};
    for (const [name, mk] of Object.entries(SETS)) {
      const b = mk();
      out[name] = {
        structure: buildRunStructure(b, ctx),
        structureNoPace: buildRunStructure(b, ctx, { showPaceNumbers: false }),
        journey: buildRunJourney(b, ctx),
        sizes: b.map((x) => blockSizeLabel(x)),
        titles: KINDS.map((k) => buildRunDisplayTitle(b, k, { seconds: 2100, meters: null })),
        strip: stripPhaseLabels(b, ctx, { reps: 6 }),
        stripTempo: stripPhaseLabels(b, ctx, { reps: 0, mainLabel: 'טמפו' }),
        sections: groupBlocksIntoSections({ blocks: b }).map((s) => ({ title: s.title, laps: s.laps })),
      };
    }
    out.fmt = [fmtMeters(400), fmtMeters(1000), fmtMeters(1500), fmtSeconds(30), fmtSeconds(180), fmtSeconds(150)];
    out.week = [runWeekContextLabel({ week: 3, day: 2, totalWeeks: 8 }), runWeekContextLabel({ week: 3, day: 2, totalWeeks: 8 }, { short: true }), runWeekContextLabel({ week: 3 }), runWeekContextLabel(null)];
    out.weekSummary = runWeekSummary([{ entry: { week: 1, day: 1, workoutId: 'a' }, state: 'done', dayLetter: null }, { entry: { week: 1, day: 2, workoutId: 'b' }, state: 'today', dayLetter: null }]);
    expect(out).toMatchSnapshot();
  });
  it('overview legs, variants, elevation', () => {
    const out: Record<string, unknown> = {};
    for (const [name, mk] of Object.entries(SETS)) {
      const b = mk();
      for (const kind of KINDS) {
        out[`${name}/${kind}/legs`] = buildRunOverviewLegs(b, ctx, { kind, walk: { thereMin: 4, backMin: 5 } });
      }
      out[`${name}/collapse`] = buildRunOverviewLegs(b, ctx, { kind: 'interval', collapseMain: { stripLabel: 'x' } });
      const v = buildRunVariants(b, ctx);
      out[`${name}/variants`] = v && v.map((x) => ({ key: x.key, label: x.label, level: x.level, blocks: bands(x.blocks) }));
      out[`${name}/bare`] = b.map(bareSize);
      out[`${name}/lighter`] = bands(applyRunVariant({ blocks: b }, 'lighter', ctx).blocks);
      out[`${name}/elev`] = buildWorkoutElevation(b, ctx, { stepM: 100, elevationsM: Array.from({ length: 61 }, (_, i) => 10 + (i % 10)) }, { loop: true });
      out[`${name}/elevOpen`] = buildWorkoutElevation(b, ctx, { stepM: 100, elevationsM: Array.from({ length: 61 }, (_, i) => 10 + (i % 10)) }, { loop: false });
    }
    expect(JSON.parse(JSON.stringify(out, (_k, v) => (v === undefined ? null : v)))).toMatchSnapshot();
  });
  it('main set, swaps, pace editing', () => {
    const out: Record<string, unknown> = {};
    for (const name of ['sixBy400', 'timeReps', 'pyramid', 'tempo']) {
      const b = SETS[name]();
      const src = readMainSet(b);
      out[`${name}/src`] = src && { spec: src.spec, title: mainSetTitle(src.spec) };
      if (src) {
        out[`${name}/swaps`] = buildSwapAlternatives(src, ctx, { category: 'short_intervals' })?.map((g) => ({
          level: g.level,
          items: g.items.map((a) => ({ key: a.key, title: a.title, sub: a.sub, delta: swapDeltaText(a) })),
        })) ?? null;
        out[`${name}/applied`] = bands(applyMainSet(b, src, { unit: src.spec.unit, reps: [100, 200, 300], recoverySec: 0 })).map((x) => x.label);
        out[`${name}/appliedRest`] = bands(applyMainSet(b, { ...src, rest: null }, { unit: src.spec.unit, reps: [src.spec.reps[0], src.spec.reps[0]], recoverySec: 60 })).map((x) => [x.label, x.type]);
      }
      const keys = new Set<string>();
      b.forEach((x) => { const k = paceTargetKey(x); if (k) keys.add(k); });
      out[`${name}/paces`] = [...keys].map((k) => paceEditTarget(b, k, ctx));
      out[`${name}/overrides`] = paceOverridesOf(b);
    }
    out.titles = [
      mainSetTitle({ unit: 'm', reps: [200, 400, 600, 400, 200], recoverySec: 60 }),
      mainSetTitle({ unit: 'm', reps: [400, 800, 1200], recoverySec: 60 }),
      mainSetTitle({ unit: 's', reps: [60, 60, 60], recoverySec: 60 }),
    ];
    out.sizeLabels = [sizeLabel('m', 400), sizeLabel('s', 90), sizeLabel('m', 1000)];
    out.recovery = [30, 60, 90, 120, 150, 300].map(recoveryText);
    out.delta = [
      swapDeltaText({ deltaSec: null, equalVolume: false, current: true }),
      swapDeltaText({ deltaSec: -420, equalVolume: true, current: false }),
      swapDeltaText({ deltaSec: 130, equalVolume: false, current: false }),
      swapDeltaText({ deltaSec: 0, equalVolume: false, current: false }),
    ];
    expect(JSON.parse(JSON.stringify(out, (_k, v) => (v === undefined ? null : v)))).toMatchSnapshot();
  });
  it('route choice, laps, access', () => {
    const M_LAT = 1 / 111_320;
    const lat = 32.08, lng = 34.78;
    const path: [number, number][] = [[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.005], [lng, lat + 0.005], [lng, lat]];
    const mk = (over: object) => ({ id: 'r', name: 'לולאת הירקון', distance: 4.2, path, routeShape: 'loop', qualitySignals: { lighting: { status: 'computed', isLit: true } }, ...over }) as unknown as Route;
    const fit = (over: object) => ({ fit: { verdict: 'laps', laps: 1.5, endsAtStart: true, turnaroundKm: null, score: 1, reason: null, caution: null, ...over } }) as never;
    const origin = { lat: lat - 600 * M_LAT, lng };
    const out = {
      loop: routeChoiceView(mk({}), fit({}), origin),
      one: routeChoiceView(mk({}), fit({ laps: 1 }), origin),
      far: routeChoiceView(mk({}), fit({}), { lat: lat - 5000 * M_LAT, lng }),
      here: routeChoiceView(mk({}), fit({}), { lat, lng }),
      noName: routeChoiceView(mk({ name: ' ', routeShape: 'out_and_back', qualitySignals: {} }), fit({ turnaroundKm: 2.1 }), null),
      noScore: routeChoiceView(mk({ name: undefined }), null, null),
      access: [accessText(0.1), accessText(0.5), accessText(2.34), accessText(null)],
      laps: [lapsLabel(1), lapsLabel(1.5), lapsLabel(3)],
    };
    expect(out).toMatchSnapshot();
  });
  it('planned rep helpers', () => {
    const out = {
      pace: [paceClassText(null), paceClassText({ band: 'in', deltaSec: 0 }), paceClassText({ band: 'slow', deltaSec: 7 }), paceClassText({ band: 'fast', deltaSec: -4 })],
      summary: [repSummary([]).label, repSummary([{ inRange: true }, { inRange: false }, { inRange: true }] as never).label],
      dist: [fmtDistance(0), fmtDistance(250), fmtDistance(1000), fmtDistance(1250)],
      labels: [
        'surge', 'Sprint 3', 'recovery', 'warmup', 'Warm-up', 'cooldown', 'cool-down', 'run', 'walk', 'strides', 'סתם',
      ].map((label) => blockDisplayLabel(blk({ label }))),
      fallbacks: (['warmup', 'cooldown', 'recovery', 'run'] as const).map((type) => blockDisplayLabel(blk({ type, label: '' }))),
      synth: blockDisplayLabel(blk({ label: '', _isSynthesizedRest: true })),
    };
    expect(out).toMatchSnapshot();
  });
});
