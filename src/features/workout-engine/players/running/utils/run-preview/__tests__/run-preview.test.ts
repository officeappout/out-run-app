import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../../core/types/running.types';
import { ALL_RUN_ZONES } from '../../../../../core/types/running.types';
import { inferRunKind, resolveRunCategory, runTypeLabel, RUN_KIND_STYLE } from '../run-kind';
import {
  estimateBlockMeters,
  estimateRunTotals,
  findMainRep,
  repTarget,
  WALK_PACE_SEC_PER_KM,
  type RunPaceContext,
} from '../run-estimates';
import { buildRunDisplayTitle, cleanBlockLabel, fmtMeters, fmtSeconds } from '../run-title';
import { blockPhase, buildIntensityStrip, intensityHeight, stripPhaseLabels, STRIP_REST_COLOR } from '../run-strip';
import { buildRunStructure, buildStructureLines } from '../run-structure';
import { buildZoneLadder, mainZone } from '../run-zone-ladder';
import { buildRunWeekRows, parseRunWeekParams, runWeekContextLabel, runWeekSummary } from '../run-week';
import { SURFACE_TILES, surfaceTilesFor } from '../run-surfaces';
import { buildRunPreviewModel } from '../run-preview-model';
import { buildRunJourney } from '../run-journey';
import { groupBlocksIntoSections } from '../run-sections';

let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });

// Fake zones: every zone a 10 s band around a fixed middle.
const MID: Record<RunZoneType, number> = {
  walk: 600, jogging: 420, recovery: 450, easy: 395, long_run: 365,
  fartlek_medium: 330, tempo: 315, fartlek_fast: 300, interval_long: 300, interval_short: 290, sprint: 260,
};
const zones = Object.fromEntries(
  ALL_RUN_ZONES.map((z) => [z, { minPace: MID[z] - 5, maxPace: MID[z] + 5, label: '' } as ComputedPaceZone]),
) as Record<RunZoneType, ComputedPaceZone>;
const ctx: RunPaceContext = { basePace: 330, zones };
const noProfile: RunPaceContext = { basePace: 0, zones: null };

// 10′ easy warm-up, 4 × 20″ strides (45″ walk), 6 × 400 m interval_short (90″ recovery), 8′ cool-down.
function sixBy400(): RunBlock[] {
  const out: RunBlock[] = [
    blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true }),
  ];
  for (let i = 0; i < 4; i++) {
    out.push(blk({ type: 'run', label: `סטריידס (${i + 1}/4)`, durationSeconds: 20, blockMode: 'effort', effortConfig: { effortLevel: 'hard' }, _isDynamicWrapper: true }));
    if (i < 3) out.push(blk({ type: 'walk', label: 'הליכת התאוששות', durationSeconds: 45, _isSynthesizedRest: true, _isDynamicWrapper: true }));
  }
  for (let i = 0; i < 6; i++) {
    out.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 5) out.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  out.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return out;
}

function tempo20(): RunBlock[] {
  return [
    blk({ type: 'warmup', label: 'חימום', durationSeconds: 720, zoneType: 'easy' }),
    blk({ type: 'run', label: 'טמפו', durationSeconds: 1200, distanceMeters: 3810, zoneType: 'tempo' }),
    blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 600, zoneType: 'easy' }),
  ];
}

describe('run-kind', () => {
  it('prefers the workout category, falls back to the template, ignores unknown strings', () => {
    expect(resolveRunCategory('tempo', 'long_run')).toBe('tempo');
    expect(resolveRunCategory(undefined, 'long_run')).toBe('long_run');
    expect(resolveRunCategory('טמפו', 'nope')).toBeNull();
  });
  it('maps categories into the 4 kinds and infers from blocks without one', () => {
    expect(inferRunKind('hill_sprints')).toBe('interval');
    expect(inferRunKind('hill_long')).toBe('tempo');
    expect(inferRunKind(null, sixBy400())).toBe('interval');
    expect(inferRunKind(null, tempo20())).toBe('tempo');
    expect(inferRunKind(null, [blk({ durationSeconds: 70 * 60, zoneType: 'easy' })])).toBe('long');
    expect(inferRunKind(null, [blk({ durationSeconds: 35 * 60, zoneType: 'easy' })])).toBe('easy');
  });
  it('labels from the category, else the kind', () => {
    expect(runTypeLabel('short_intervals', 'interval')).toBe('אינטרוולים קצרים');
    expect(runTypeLabel(null, 'tempo')).toBe(RUN_KIND_STYLE.tempo.label);
  });
});

describe('run-estimates', () => {
  it('fills distance from pace for time blocks and walk pace for rests', () => {
    expect(estimateBlockMeters(blk({ durationSeconds: 395, zoneType: 'easy' }), ctx)).toBe(1000);
    expect(estimateBlockMeters(blk({ type: 'recovery', durationSeconds: 60, _isSynthesizedRest: true }), ctx)).toBe(
      Math.round((60 / WALK_PACE_SEC_PER_KM) * 1000),
    );
  });
  it('totals: time + distance for the 6×400', () => {
    const t = estimateRunTotals(sixBy400(), ctx);
    // 600 + 80 + 135 + 6 × 116 + 450 + 480
    expect(t.seconds).toBe(600 + 80 + 135 + 6 * 116 + 450 + 480);
    expect(t.meters).toBeGreaterThan(5000);
  });
  it('totals: a distance block without any pace makes the time unknown', () => {
    expect(estimateRunTotals([blk({ distanceMeters: 400, zoneType: 'interval_short' })], noProfile).seconds).toBeNull();
  });
  it('finds the main rep and its target per rep', () => {
    const rep = findMainRep(sixBy400());
    expect(rep?.count).toBe(6);
    const t = repTarget(rep!.block, ctx);
    expect(t.paceSec).toBe(290);
    expect(t.repSeconds).toBe(116); // 0.4 × 290 → "~1:56"
  });
  it('legs under 400 m keep the rep time but get no pace (owner rule)', () => {
    const t = repTarget(blk({ type: 'interval', distanceMeters: 200, zoneType: 'sprint' }), ctx);
    expect(t.paceSec).toBeNull();
    expect(t.band).toBeNull();
    expect(t.repSeconds).toBe(52);
  });
  it('effort blocks have no target', () => {
    expect(repTarget(blk({ durationSeconds: 120, blockMode: 'effort' }), ctx).paceSec).toBeNull();
  });
});

describe('run-title', () => {
  it('formats sizes', () => {
    expect(fmtMeters(400)).toBe('400 מ׳');
    expect(fmtMeters(1000)).toBe('1 ק״מ');
    expect(fmtMeters(1500)).toBe('1.5 ק״מ');
    expect(fmtSeconds(45)).toBe('45 שנ׳');
    expect(fmtSeconds(180)).toBe('3 דק׳');
    expect(fmtSeconds(150)).toBe('2:30 דק׳');
    expect(cleanBlockLabel('400 מ׳ (2/6)')).toBe('400 מ׳');
  });
  it('builds human titles', () => {
    const b = sixBy400();
    expect(buildRunDisplayTitle(b, 'interval', estimateRunTotals(b, ctx))).toBe('6 × 400 מ׳');
    const t = tempo20();
    expect(buildRunDisplayTitle(t, 'tempo', estimateRunTotals(t, ctx))).toBe('טמפו 20 דק׳');
    const easy = [blk({ durationSeconds: 35 * 60, zoneType: 'easy' })];
    expect(buildRunDisplayTitle(easy, 'easy', estimateRunTotals(easy, ctx))).toBe('ריצה קלה 35 דק׳');
    const long = [blk({ distanceMeters: 12000, zoneType: 'long_run' })];
    expect(buildRunDisplayTitle(long, 'long', estimateRunTotals(long, ctx))).toBe('ריצה ארוכה 12 ק״מ');
    const timeReps = [1, 2, 3, 4, 5].map(() => blk({ type: 'interval', durationSeconds: 180, distanceMeters: 620, zoneType: 'interval_long' }));
    expect(buildRunDisplayTitle(timeReps, 'interval', estimateRunTotals(timeReps, ctx))).toBe('5 × 3 דק׳');
    expect(buildRunDisplayTitle([], 'easy', { seconds: null, meters: null })).toBeNull();
  });
});

describe('run-strip', () => {
  it('one segment per block, rests light, reps tallest', () => {
    const b = sixBy400();
    const s = buildIntensityStrip(b, ctx);
    expect(s).toHaveLength(b.length);
    const rest = s[b.findIndex((x) => x.type === 'recovery')];
    expect(rest.color).toBe(STRIP_REST_COLOR);
    const rep = s[b.findIndex((x) => x.type === 'interval')];
    expect(rep.color).toBe('#e5484d');
    expect(rep.height).toBe(100);
    expect(rep.flex).toBe(1.9);
    expect(s[0].color).toBe('#bfe48a');
    expect(intensityHeight(b[1])).toBe(80); // stride
  });
  it('phases and labels', () => {
    const b = sixBy400();
    expect(blockPhase(b[1])).toBe('warmup');
    expect(blockPhase(b[b.length - 1])).toBe('cooldown');
    expect(stripPhaseLabels(b, ctx, { reps: 6 })).toEqual(['חימום · 14′', 'עיקר · 6 חזרות', 'שחרור · 8′']);
    expect(stripPhaseLabels(tempo20(), ctx, { reps: 0, mainLabel: 'טמפו' })).toEqual(['חימום · 12′', 'טמפו · 20′', 'שחרור · 10′']);
  });
});

describe('run-structure', () => {
  it('warm-up (with strides) → main with a repeat badge → cool-down', () => {
    const steps = buildRunStructure(sixBy400(), ctx);
    expect(steps.map((s) => s.title)).toEqual(['חימום', 'העיקר', 'שחרור']);
    expect(steps[0].rows.map((r) => r.text)).toEqual(['10 דק׳ ריצה קלה', '4 × 20 שנ׳ סטריידס']);
    expect(steps[0].rows[1].side).toBe('מאמץ גבוה');
    expect(steps[1].repeat).toBe(6);
    expect(steps[1].rows[0].text).toBe('400 מ׳ מהיר · ~1:56');
    expect(steps[1].rows[0].side).toBe('4:45–4:55');
    expect(steps[1].rows[1].isRest).toBe(true);
    expect(steps[1].rows[1].side).toBe('מנוחה');
  });
  it('hides pace numbers for beginners', () => {
    const steps = buildRunStructure(sixBy400(), ctx, { showPaceNumbers: false });
    expect(steps[1].rows[0].side).toBe('');
    expect(steps[1].rows[0].text).toBe('400 מ׳ מהיר');
  });
  it('the preview card lines', () => {
    const lines = buildStructureLines(sixBy400(), ctx);
    expect(lines.map((l) => l.text)).toEqual(['חימום 14 דק׳', '6 × 400 מ׳ · 1:30 דק׳ ריצת התאוששות', 'שחרור 8 דק׳']);
    expect(lines[1].side).toBe('4:45–4:55');
  });
  it('legacy grouping is unchanged (moved, not rewritten)', () => {
    const sections = groupBlocksIntoSections({ blocks: sixBy400() });
    expect(sections.map((s) => [s.title, s.laps])).toEqual([
      ['חימום', undefined],
      ['מתגברות', 4],
      ['400 מ׳ (1/6)', 6],
      ['מתיחות', undefined],
    ]);
  });
});

describe('run-zone-ladder', () => {
  it('builds the 5 rungs and highlights the main zone', () => {
    const l = buildZoneLadder(zones, mainZone(tempo20()));
    expect(l.map((x) => x.label)).toEqual(['קל', 'ארוכה', 'טמפו', 'אינטרוול', 'ספרינט']);
    expect(l.find((x) => x.active)?.rung).toBe('tempo');
    expect(l[0].pace).toBe('6:30+');
    expect(l[2].pace).toBe('5:15');
  });
  it('empty without zones', () => {
    expect(buildZoneLadder(null, 'tempo')).toEqual([]);
  });
});

describe('run-week', () => {
  it('parses URL params', () => {
    expect(parseRunWeekParams('3', '2', 8)).toEqual({ week: 3, day: 2, totalWeeks: 8 });
    expect(parseRunWeekParams(null, '2')).toBeNull();
    expect(parseRunWeekParams('3', 'x', 2)).toEqual({ week: 3 });
  });
  it('labels', () => {
    expect(runWeekContextLabel({ week: 3, day: 2, totalWeeks: 8 })).toBe('שבוע 3 מתוך 8 · אימון 2 השבוע');
    expect(runWeekContextLabel({ week: 3, day: 2 }, { short: true })).toBe('שבוע 3 · אימון 2');
    expect(runWeekContextLabel(null)).toBe('');
  });
  it('week rows: day letters, done / today / upcoming', () => {
    const schedule = [
      { week: 3, day: 2, workoutId: 'b', status: 'pending', category: 'short_intervals' },
      { week: 3, day: 1, workoutId: 'a', status: 'completed', category: 'easy_run' },
      { week: 3, day: 3, workoutId: 'c', status: 'pending', category: 'long_run' },
      { week: 4, day: 1, workoutId: 'd', status: 'pending' },
    ];
    const rows = buildRunWeekRows(schedule, 3, ['ה', 'א', 'ג'], { targetDay: 2, isRunDay: true });
    expect(rows.map((r) => [r.entry.workoutId, r.state, r.dayLetter])).toEqual([
      ['a', 'done', 'א׳'],
      ['b', 'today', 'ג׳'],
      ['c', 'upcoming', 'ה׳'],
    ]);
    expect(runWeekSummary(rows).label).toBe('1 מתוך 3 בוצע');
    expect(buildRunWeekRows(schedule, 3, [], { targetDay: 2, isRunDay: false })[1]).toMatchObject({ state: 'upcoming', dayLetter: null });
  });
});

describe('run-surfaces', () => {
  it('fixes the legacy typo and orders by kind', () => {
    expect(Object.values(SURFACE_TILES).some((t) => t.label.includes('סטוריית'))).toBe(false);
    expect(surfaceTilesFor('interval')[0].id).toBe('track');
    expect(surfaceTilesFor('long')[0].id).toBe('road');
  });
});

describe('buildRunPreviewModel', () => {
  it('composes the intervals preview', () => {
    const m = buildRunPreviewModel(
      { title: '6x400m — אינטרוולים קצרים קלאסי', blocks: sixBy400(), category: 'short_intervals', logicCue: 'חזרה ראשונה לא מהירה מהאחרונה.' },
      { ...ctx, week: { week: 3, day: 2, totalWeeks: 8 } },
    );
    expect(m.title).toBe('6 × 400 מ׳');
    expect(m.typeLabel).toBe('אינטרוולים קצרים');
    expect(m.kind).toBe('interval');
    expect(m.reps).toBe(6);
    expect(m.meta[0]).toMatch(/^\d+ דק׳$/);
    expect(m.meta[1]).toMatch(/^~\d+(\.\d)? ק״מ$/);
    expect(m.meta[2]).toBe('6 חזרות @ 4:50');
    expect(m.journey.map((j) => j.kind)).toEqual(['aerobic', 'repeat', 'aerobic']);
    expect(m.weekLabel).toBe('שבוע 3 מתוך 8 · אימון 2 השבוע');
    expect(m.tip).toBe('חזרה ראשונה לא מהירה מהאחרונה.');
    expect(m.ladder.find((x) => x.active)?.rung).toBe('interval');
  });
  it('without a pace profile: the template name survives when the title can\'t be built, no pace stats', () => {
    const m = buildRunPreviewModel({ title: 'שם התבנית', blocks: [blk({ distanceMeters: 400, zoneType: 'interval_short' })] }, noProfile);
    expect(m.title).toBe('שם התבנית');
    expect(m.meta.some((x) => x.includes('@'))).toBe(false);
    expect(m.ladder).toEqual([]);
  });
  it('beginners: no pace numbers anywhere', () => {
    const m = buildRunPreviewModel({ title: 'x', blocks: sixBy400(), category: 'short_intervals' }, { ...ctx, showPaceNumbers: false });
    expect(m.meta.some((x) => x.includes('@'))).toBe(false);
    expect(m.ladder).toEqual([]);
    expect(m.meta).toContain('6 חזרות');
  });
});

describe('run-journey', () => {
  it('intervals: warm-up (incl. strides) › 6 × 400 מ׳ › cool-down', () => {
    const j = buildRunJourney(sixBy400(), ctx);
    expect(j).toEqual([
      { key: 'warmup', kind: 'aerobic', subtype: 'running', seconds: 600 + 80 + 135 },
      { key: 'main', kind: 'repeat', subtype: 'running', label: '6 × 400 מ׳' },
      { key: 'cooldown', kind: 'aerobic', subtype: 'running', seconds: 480 },
    ]);
  });
  it('tempo: warm-up › 20′ › cool-down', () => {
    expect(buildRunJourney(tempo20(), ctx).map((x) => [x.kind, x.seconds ?? x.label])).toEqual([
      ['aerobic', 720],
      ['aerobic', 1200],
      ['aerobic', 600],
    ]);
  });
  it('easy: one leg; beginners run/walk: one repeat', () => {
    expect(buildRunJourney([blk({ durationSeconds: 2100, zoneType: 'easy' })], ctx)).toEqual([
      { key: 'main0', kind: 'aerobic', subtype: 'running', seconds: 2100 },
    ]);
    const rw: RunBlock[] = [];
    for (let i = 0; i < 4; i++) {
      rw.push(blk({ type: 'run', durationSeconds: 120, blockMode: 'effort', effortConfig: { effortLevel: 'moderate' } }));
      if (i < 3) rw.push(blk({ type: 'walk', durationSeconds: 60, _isSynthesizedRest: true }));
    }
    expect(buildRunJourney(rw, ctx)).toEqual([{ key: 'main', kind: 'repeat', subtype: 'running', label: '4 × 2 דק׳' }]);
  });
  it('mixed main set (pyramid): one item per section', () => {
    const pyr = [
      blk({ type: 'interval', distanceMeters: 400, zoneType: 'interval_short' }),
      blk({ type: 'recovery', durationSeconds: 90, _isSynthesizedRest: true }),
      blk({ type: 'interval', distanceMeters: 800, zoneType: 'interval_long' }),
      blk({ type: 'recovery', durationSeconds: 90, _isSynthesizedRest: true }),
      blk({ type: 'interval', distanceMeters: 400, zoneType: 'interval_short' }),
    ];
    expect(buildRunJourney(pyr, ctx).map((x) => x.kind)).toEqual(['aerobic', 'aerobic', 'aerobic']);
  });
});
