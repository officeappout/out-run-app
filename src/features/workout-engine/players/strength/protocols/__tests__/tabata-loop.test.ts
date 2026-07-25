import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeTabataStep } from '../tabata.step';
import { tabataAdvance, tabataIntervalInfo, tabataMemberCosts } from '../tabata.advance';
import { effectiveSetsForExercise } from '../../logic/set-target.utils';
import { TABATA_CLASSIC, TABATA_BLOCK_SECONDS } from '@/features/workout-engine/logic/protocols/tabata.constants';
import type { AdvanceContext, AdvanceExercise } from '../advance-strategy.types';

/**
 * Headless loop test (protocol-blocks). Drives a FULL tabata block through the
 * exact pure functions the live player delegates to — computeTabataStep (the
 * extracted work→rest→advance decision), tabataAdvance (round-robin) and
 * tabataIntervalInfo (the header counter). No React, no jsdom, node env.
 *
 * The driver mirrors the state machine's cursor + the handler's side effects;
 * only the trivial "apply the decision" glue lives here (that glue is what
 * David's on-device smoke covers).
 */

const CONFIG = TABATA_CLASSIC; // { workSec: 20, restSec: 10, rounds: 8 }

type Member = { id: string; symmetry: 'bilateral' | 'unilateral' };

interface DriveResult {
  intervals: Array<{ member: string; side: 'right' | 'left' | null; displayed: number }>;
  logs: Array<{ member: string; sideData?: { right: number; left: number }; targetReps?: number }>;
  workSeconds: number;
  restCount: number;
  restSeconds: number;
  totalSeconds: number;
  exited: boolean;
}

function driveTabataBlock(members: Member[]): DriveResult {
  const exercises = members.map(
    (m) => ({ id: m.id, name: m.id, sets: 3, symmetry: m.symmetry }) as unknown as AdvanceExercise,
  );
  const costs = tabataMemberCosts(exercises as unknown as Array<Record<string, unknown>>);
  const segment = { id: 'seg-tabata', exercises, protocol: 'tabata', protocolConfig: CONFIG } as never;

  const sideOf = (i: number): 'right' | 'left' | null =>
    members[i].symmetry === 'unilateral' ? 'right' : null;

  // Loop cursor (mirrors the machine's tabata state).
  let exerciseIndex = 0;
  let setIdx = 0;
  let side: 'right' | 'left' | null = sideOf(0);
  let pendingRightElapsed: number | null = null;
  let exited = false;

  const intervals: DriveResult['intervals'] = [];
  const logs: DriveResult['logs'] = [];
  let workSeconds = 0;
  let restCount = 0;
  let restSeconds = 0;

  const advanceCtx = (): AdvanceContext => ({
    segments: [segment],
    currentSegmentIndex: 0,
    prevExerciseIndex: exerciseIndex,
    setIdx,
    log: [],
    getExercises: (s) => ((s as { exercises?: AdvanceExercise[] })?.exercises ?? null),
    getSets: effectiveSetsForExercise,
  });

  // moveToNext = apply tabataAdvance's decision to the cursor.
  const moveToNext = (): 'continue' | 'exit' => {
    const d = tabataAdvance(advanceCtx());
    if (d.kind === 'goToExercise') {
      exerciseIndex = d.exerciseIndex;
      if (d.nextSetIdx != null) setIdx = d.nextSetIdx;
      side = sideOf(exerciseIndex);
      pendingRightElapsed = null;
      return 'continue';
    }
    return 'exit'; // nextSegment / workoutComplete
  };

  let guard = 0;
  while (!exited && guard++ < 100) {
    // 1) A work interval elapses (timer auto-completes at workSec).
    const { intervalIndex } = tabataIntervalInfo({ costs, exerciseIndex, setIdx, rounds: CONFIG.rounds });
    const displayed = Math.min(intervalIndex + 1 + (side === 'left' ? 1 : 0), CONFIG.rounds); // header memo
    intervals.push({ member: members[exerciseIndex].id, side, displayed });
    workSeconds += CONFIG.workSec;

    // 2) Pure decision — the same call the live handler makes.
    const step = computeTabataStep({
      reps: CONFIG.workSec,
      isUnilateral: members[exerciseIndex].symmetry === 'unilateral',
      currentSide: side,
      pendingRightElapsed,
      exerciseType: 'time',
      config: CONFIG,
      memberCosts: costs,
      exerciseIndex,
      setIdx,
    });

    // 3) Apply the decision (the handler's side effects, simulated).
    if (step.kind === 'sideTransition') {
      pendingRightElapsed = step.storeRightElapsed;
      side = 'left';
      if (step.sideRestSec != null) {
        restCount++;
        restSeconds += step.sideRestSec;
      }
      continue; // resume ACTIVE on the SAME exercise, left side
    }

    // logAndContinue
    logs.push({ member: members[exerciseIndex].id, sideData: step.log.sideData, targetReps: step.log.targetReps });
    if (step.next.kind === 'rest') {
      restCount++;
      restSeconds += step.next.restSec;
    }
    // advance → moveToNext now; rest → rest elapses, then moveToNext.
    if (moveToNext() === 'exit') exited = true;
  }

  return {
    intervals,
    logs,
    workSeconds,
    restCount,
    restSeconds,
    totalSeconds: workSeconds + restSeconds,
    exited,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('tabata full-block loop (headless driver)', () => {
  it('bilateral block: 8 intervals, round-robin, exits on the last, ~240s math', () => {
    // [A, B] bilateral: cycle cost 2 → exactly 4 cycles of 2 = 8 intervals.
    const r = driveTabataBlock([
      { id: 'A', symmetry: 'bilateral' },
      { id: 'B', symmetry: 'bilateral' },
    ]);

    expect(r.intervals).toHaveLength(8);
    // interval counter rises 1..8 with no gaps
    expect(r.intervals.map((i) => i.displayed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // round-robin A,B,A,B,...
    expect(r.intervals.map((i) => i.member)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']);
    // no unilateral → no sides, no paired logs
    expect(r.intervals.every((i) => i.side === null)).toBe(true);
    expect(r.logs.every((l) => l.sideData === undefined)).toBe(true);

    // exits the segment on the last interval (no trailing rest)
    expect(r.exited).toBe(true);
    expect(r.restCount).toBe(7); // 8 work intervals → 7 gaps

    // ~240s: 8×20 work + 7×10 rest = 230; priced block = 8×(20+10) = 240,
    // the runtime drops the last interval's trailing rest (240 − 10 = 230).
    expect(r.workSeconds).toBe(8 * CONFIG.workSec); // 160
    expect(TABATA_BLOCK_SECONDS).toBe((CONFIG.workSec + CONFIG.restSec) * CONFIG.rounds); // 240
    expect(r.totalSeconds).toBe(TABATA_BLOCK_SECONDS - CONFIG.restSec); // 230
  });

  it('block with a unilateral member: right→left = two consecutive intervals, still 8 + exit', () => {
    // [A(bi), U(uni), B(bi)]: costs [1,2,1], cycle cost 4 → 2 cycles = 8.
    const r = driveTabataBlock([
      { id: 'A', symmetry: 'bilateral' },
      { id: 'U', symmetry: 'unilateral' },
      { id: 'B', symmetry: 'bilateral' },
    ]);

    expect(r.intervals).toHaveLength(8);
    expect(r.intervals.map((i) => i.displayed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Sequence: A, U-right, U-left, B  ×2 cycles.
    expect(r.intervals.map((i) => `${i.member}:${i.side ?? 'bi'}`)).toEqual([
      'A:bi', 'U:right', 'U:left', 'B:bi',
      'A:bi', 'U:right', 'U:left', 'B:bi',
    ]);

    // The unilateral member logs ONCE per visit (on the left side), pairing both
    // sides; the deferred right side never logs on its own.
    const uLogs = r.logs.filter((l) => l.member === 'U');
    expect(uLogs).toHaveLength(2); // one per cycle
    expect(uLogs.every((l) => l.sideData?.right === CONFIG.workSec && l.sideData?.left === CONFIG.workSec)).toBe(true);
    expect(uLogs.every((l) => l.targetReps === CONFIG.workSec)).toBe(true); // time-type: min(right,left)
    // bilateral members log without sideData
    expect(r.logs.filter((l) => l.member !== 'U').every((l) => l.sideData === undefined)).toBe(true);

    expect(r.exited).toBe(true);

    // ~240s including the 2 clocked side-rests: 8×20 work + 7×10 rest = 230.
    // rests = 5 between-member + 2 side-rests (after each right side) = 7.
    expect(r.workSeconds).toBe(160);
    expect(r.restCount).toBe(7);
    expect(r.totalSeconds).toBe(TABATA_BLOCK_SECONDS - CONFIG.restSec); // 230
  });

  it('restSec=0 config advances every interval with no rest (still 8, exits last)', () => {
    // Guard the "restSec<=0 → advance immediately" branch of computeTabataStep.
    const zeroRest = { ...CONFIG, restSec: 0 };
    // Re-run the driver logic inline with a zero-rest config on a bilateral pair.
    const members: Member[] = [
      { id: 'A', symmetry: 'bilateral' },
      { id: 'B', symmetry: 'bilateral' },
    ];
    const costs = tabataMemberCosts(
      members.map((m) => ({ id: m.id, symmetry: m.symmetry }) as unknown as Record<string, unknown>),
    );
    let advances = 0;
    for (let interval = 0; interval < CONFIG.rounds; interval++) {
      const exerciseIndex = interval % members.length;
      const setIdx = Math.floor(interval / members.length);
      const step = computeTabataStep({
        reps: zeroRest.workSec,
        isUnilateral: false,
        currentSide: null,
        pendingRightElapsed: null,
        exerciseType: 'time',
        config: zeroRest,
        memberCosts: costs,
        exerciseIndex,
        setIdx,
      });
      expect(step.kind).toBe('logAndContinue');
      if (step.kind === 'logAndContinue') {
        expect(step.next.kind).toBe('advance'); // restSec=0 → never rests
        advances++;
      }
    }
    expect(advances).toBe(8);
  });
});
