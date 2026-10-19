import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { RunBlock } from '../../types/run-block.type';
import {
  advanceTarget,
  blockDisplayLabel,
  buildBlockRecords,
  classifyPace,
  isShortLeg,
  liveCardMode,
  paceClassText,
  paceScaleGeometry,
  planSections,
  recordClass,
  repNumbers,
  repSummary,
  resolveBlockTargetPace,
  v2BlockColor,
  V2_BLOCK_COLORS,
} from '../planned-rep-results';

const blk = (over: Partial<RunBlock>): RunBlock => ({ id: Math.random().toString(36), type: 'run', label: 'ריצה', colorHex: '#000', ...over });

// 6 × 400 m @ interval_short with 90 s recoveries, wrapped by warm-up / cool-down (13 blocks).
const sixBy400: RunBlock[] = [
  blk({ id: 'wu', type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy' }),
  ...Array.from({ length: 6 }).flatMap((_, i) => {
    const rep = blk({ id: `r${i}`, type: 'interval', label: 'אינטרוול', distanceMeters: 400, zoneType: 'interval_short', isQualityExercise: true });
    return i < 5 ? [rep, blk({ id: `rest${i}`, type: 'recovery', label: 'התאוששות', durationSeconds: 90, _isSynthesizedRest: true })] : [rep];
  }),
  blk({ id: 'cd', type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy' }),
];
const band = () => ({ min: 285, max: 295 }); // 4:45–4:55

describe('classifyPace — in-range classification', () => {
  it('inside / on the edges is in range', () => {
    expect(classifyPace(290, 285, 295)).toEqual({ band: 'in', deltaSec: 0 });
    expect(classifyPace(285, 285, 295)?.band).toBe('in');
    expect(classifyPace(295.4, 285, 295)?.band).toBe('in'); // whole seconds, as shown
  });
  it('slower / faster carry the whole-second delta', () => {
    expect(classifyPace(298, 285, 295)).toEqual({ band: 'slow', deltaSec: 3 });
    expect(classifyPace(281, 285, 295)).toEqual({ band: 'fast', deltaSec: -4 });
  });
  it('missing pace or band ⇒ null', () => {
    expect(classifyPace(0, 285, 295)).toBeNull();
    expect(classifyPace(290, 0, 0)).toBeNull();
    expect(classifyPace(Infinity, 285, 295)).toBeNull();
  });
  it('text: בטווח / איטי ב-N / מהיר ב-N', () => {
    expect(paceClassText({ band: 'in', deltaSec: 0 })).toBe('בטווח');
    expect(paceClassText({ band: 'slow', deltaSec: 3 })).toBe('איטי ב-3 שנ׳');
    expect(paceClassText({ band: 'fast', deltaSec: -4 })).toBe('מהיר ב-4 שנ׳');
    expect(paceClassText(null)).toBe('');
  });
});

describe('short legs (owner rule: no pace under 400 m)', () => {
  it('distance legs under 400 m are short; 400 m is not', () => {
    expect(isShortLeg(blk({ distanceMeters: 300 }))).toBe(true);
    expect(isShortLeg(blk({ distanceMeters: 400 }))).toBe(false);
  });
  it('time legs under 90 s are short', () => {
    expect(isShortLeg(blk({ durationSeconds: 30 }))).toBe(true);
    expect(isShortLeg(blk({ durationSeconds: 180 }))).toBe(false);
  });
});

describe('buildBlockRecords — the per-rep record saved with the workout', () => {
  const results = [
    { blockIndex: 0, elapsedSeconds: 600, elapsedMeters: 1650 },
    { blockIndex: 1, elapsedSeconds: 115, elapsedMeters: 400 }, // 4:47.5 → in
    { blockIndex: 2, elapsedSeconds: 90, elapsedMeters: 120 },
    { blockIndex: 3, elapsedSeconds: 119.2, elapsedMeters: 400 }, // 4:58 → slow by 3
  ];

  it('keeps only reps (work blocks), numbered among the reps', () => {
    const recs = buildBlockRecords(sixBy400, results, band);
    expect(recs.map((r) => [r.blockIndex, r.rep])).toEqual([[1, 1], [3, 2]]);
  });

  it('records target band, actuals, avg pace and in-range', () => {
    const [r1, r2] = buildBlockRecords(sixBy400, results, band);
    expect(r1).toMatchObject({
      plannedDistanceMeters: 400, distanceMeters: 400, durationSeconds: 115,
      targetMinPaceSec: 285, targetMaxPaceSec: 295, avgPaceSec: 288, inRange: true, paceDeltaSec: 0,
    });
    expect(r2).toMatchObject({ avgPaceSec: 298, inRange: false, paceDeltaSec: 3 });
    expect(recordClass(r2)).toEqual({ band: 'slow', deltaSec: 3 });
  });

  it('never holds undefined values (Firestore rejects them in arrays)', () => {
    for (const r of buildBlockRecords(sixBy400, results, () => ({ min: 0, max: 0 }), { workOnly: false })) {
      for (const v of Object.values(r)) expect(v).not.toBeUndefined();
    }
  });

  it('no band ⇒ pace kept, no in-range', () => {
    const [r1] = buildBlockRecords(sixBy400, results, () => ({ min: 0, max: 0 }));
    expect(r1.avgPaceSec).toBe(288);
    expect(r1.inRange).toBeUndefined();
    expect(recordClass(r1)).toBeNull();
  });

  it('short legs store time only — no pace, no band', () => {
    const blocks = [blk({ type: 'interval', distanceMeters: 200, zoneType: 'sprint' })];
    const [r] = buildBlockRecords(blocks, [{ blockIndex: 0, elapsedSeconds: 40, elapsedMeters: 200 }], band);
    expect(r.durationSeconds).toBe(40);
    expect(r.avgPaceSec).toBeUndefined();
    expect(r.targetMinPaceSec).toBeUndefined();
  });

  it('a block revisited is counted once (first visit)', () => {
    const recs = buildBlockRecords(sixBy400, [...results, { blockIndex: 1, elapsedSeconds: 5, elapsedMeters: 10 }], band);
    expect(recs.filter((r) => r.blockIndex === 1)).toHaveLength(1);
    expect(recs[0].durationSeconds).toBe(115);
  });

  it('GPS-less rep (< 50 m) gets no pace', () => {
    const [r] = buildBlockRecords(sixBy400, [{ blockIndex: 1, elapsedSeconds: 115, elapsedMeters: 20 }], band);
    expect(r.avgPaceSec).toBeUndefined();
    expect(r.inRange).toBeUndefined();
  });
});

describe('repSummary — "N/M בטווח"', () => {
  it('counts scored reps only', () => {
    const recs = buildBlockRecords(sixBy400, [
      { blockIndex: 1, elapsedSeconds: 115, elapsedMeters: 400 },
      { blockIndex: 3, elapsedSeconds: 119.2, elapsedMeters: 400 },
      { blockIndex: 5, elapsedSeconds: 116, elapsedMeters: 400 },
      { blockIndex: 7, elapsedSeconds: 100, elapsedMeters: 10 }, // unscored
    ], band);
    expect(repSummary(recs)).toEqual({ reps: 4, scored: 3, inRange: 2, label: '2/3 בטווח' });
  });
  it('nothing / absent ⇒ no label', () => {
    expect(repSummary(undefined)).toEqual({ reps: 0, scored: 0, inRange: 0, label: null });
  });
});

describe('resolveBlockTargetPace — same rule the live engine always used', () => {
  const zones = { interval_short: { minPace: 285, maxPace: 295 } } as never;
  it('zone first, then percentage, else none', () => {
    expect(resolveBlockTargetPace(blk({ zoneType: 'interval_short' }), 300, zones)).toEqual({ min: 285, max: 295 });
    expect(resolveBlockTargetPace(blk({ targetPacePercentage: { min: 90, max: 100 } }), 300, null)).toEqual({ min: 270, max: 300 });
    expect(resolveBlockTargetPace(blk({}), 300, zones)).toEqual({ min: 0, max: 0 });
    expect(resolveBlockTargetPace(blk({ zoneType: 'interval_short' }), 0, zones)).toEqual({ min: 0, max: 0 });
  });
});

describe('paceScaleGeometry', () => {
  it('band centred with room on both sides; marker clamps', () => {
    const g = paceScaleGeometry(285, 295, 290);
    expect(g.bandLeft + g.bandWidth / 2).toBeCloseTo(50);
    expect(g.marker).toBeCloseTo(50);
    expect(paceScaleGeometry(285, 295, 100).marker).toBe(0);
    expect(paceScaleGeometry(285, 295, 900).marker).toBe(100);
    expect(paceScaleGeometry(285, 295, 0).marker).toBeNull();
  });
  it('faster pace sits left of the band', () => {
    const g = paceScaleGeometry(285, 295, 280);
    expect(g.marker!).toBeLessThan(g.bandLeft);
  });
});

describe('live card mode', () => {
  it('picks the screen per block', () => {
    expect(liveCardMode(null, true)).toBe('none');
    expect(liveCardMode(sixBy400[2], true)).toBe('recovery');
    expect(liveCardMode(sixBy400[1], true)).toBe('pace');
    expect(liveCardMode(sixBy400[1], false)).toBe('pace_free');
    expect(liveCardMode(blk({ distanceMeters: 200 }), true)).toBe('short');
    expect(liveCardMode(blk({ blockMode: 'effort', durationSeconds: 300 }), false)).toBe('effort');
  });
});

describe('sections, rep numbers, colours, labels', () => {
  it('warm-up / main (reps + recoveries) / cool-down', () => {
    expect(planSections(sixBy400)).toEqual({ warmup: [0], main: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], cooldown: [12] });
    expect(repNumbers(sixBy400).total).toBe(6);
    expect(repNumbers(sixBy400).byIndex.get(11)).toBe(6);
  });
  it('no reps ⇒ everything is the main section', () => {
    const blocks = [blk({ type: 'warmup' }), blk({ type: 'cooldown' })];
    expect(planSections(blocks)).toEqual({ warmup: [], main: [0, 1], cooldown: [] });
  });
  it('one palette by type / zone', () => {
    expect(v2BlockColor(sixBy400[0])).toBe(V2_BLOCK_COLORS.wrapper);
    expect(v2BlockColor(sixBy400[1])).toBe(V2_BLOCK_COLORS.fast);
    expect(v2BlockColor(sixBy400[2])).toBe(V2_BLOCK_COLORS.rest);
    expect(v2BlockColor(blk({ type: 'run', zoneType: 'tempo' }))).toBe(V2_BLOCK_COLORS.tempo);
    expect(v2BlockColor(blk({ type: 'run', zoneType: 'easy' }))).toBe(V2_BLOCK_COLORS.easy);
  });
  it('English template labels read in Hebrew', () => {
    expect(blockDisplayLabel(blk({ label: 'Warmup jog' }))).toBe('חימום');
    expect(blockDisplayLabel(blk({ label: 'טמפו' }))).toBe('טמפו');
  });
});

describe('advanceTarget — auto-finish is reachable (bug fix 19.10.2026)', () => {
  it('advancing from the last block reaches "complete" (index === total)', () => {
    expect(advanceTarget(0, 13)).toBe(1);
    expect(advanceTarget(12, 13)).toBe(13);
  });
  it('already complete / no blocks ⇒ nothing to do', () => {
    expect(advanceTarget(13, 13)).toBeNull();
    expect(advanceTarget(0, 0)).toBeNull();
  });
  it('the store uses it, and PlannedRunActive guards skip + hybrid', () => {
    const store = readFileSync(fileURLToPath(new URL('../../store/useRunningPlayer.ts', import.meta.url)), 'utf8');
    const adv = store.slice(store.indexOf('  advanceBlock: () => {'), store.indexOf('  jumpToBlock: (targetIndex) => {'));
    expect(adv).toContain('advanceTarget(currentBlockIndex, currentWorkout.blocks.length)');
    expect(adv).not.toContain('if (nextIndex >= currentWorkout.blocks.length) return;');
    const active = readFileSync(fileURLToPath(new URL('../../components/PlannedRun/PlannedRunActive.tsx', import.meta.url)), 'utf8');
    expect(active).toContain('const canSkip = !isWorkoutComplete && currentBlockIndex < engine.totalBlocks - 1;');
    expect(active).toContain('if (hybridMode) return;');
    // The countdown panel must not call a hook below its null-block early return.
    const panel = readFileSync(fileURLToPath(new URL('../../components/PlannedRun/BlockCountdownPanel.tsx', import.meta.url)), 'utf8');
    expect(panel.indexOf('const blockTitle = useMemo(')).toBeLessThan(panel.indexOf('if (!currentBlock) return null;'));
  });
  it('finishWorkout saves blockResults only when there are any', () => {
    const store = readFileSync(fileURLToPath(new URL('../../store/useRunningPlayer.ts', import.meta.url)), 'utf8');
    expect(store).toContain('...(blockResults.length > 0 ? { blockResults } : {}),');
  });
});
