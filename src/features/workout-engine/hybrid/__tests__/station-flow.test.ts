import { describe, it, expect, beforeEach } from 'vitest';
import type { WorkoutExercise } from '../../logic/workout-generator.types';
import type { StrengthBlockResult } from '../../core/pipeline/strength-block.service';
import type { HybridPlan, HybridPlannedSegment } from '../compose-hybrid-session.service';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';
import {
  computeStationContext, countStationExercises, stationMinutes,
  locateStationContentIndex, swapExerciseInStationContent,
} from '../station-flow';
import { formatApproxWalkMinutes } from '../hybrid-intro-format';
import { useHybridRun } from '../useHybridRun';
import { useSessionStore } from '../../core/store/useSessionStore';

/**
 * G2.4 (Sderot field test) — hybrid station flow: end-of-station screen (non-final stations
 * only, run clock paused until the user continues) and the in-station exercise swap.
 */

const we = (id: string, name = id): WorkoutExercise =>
  ({
    exercise: { id, name },
    method: { id: `${id}-m` },
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 60,
    priority: 'compound',
    score: 0,
    reasoning: [],
    tier: 'match',
    exerciseRole: 'main',
  } as unknown as WorkoutExercise);

const block = (exercises: WorkoutExercise[]): StrengthBlockResult =>
  ({ exercises, estimatedDurationSec: 600, totalPlannedSets: exercises.length * 3, isEmpty: false, log: [] } as StrengthBlockResult);

const aero = (index: number, durationSec: number, aerobicType: 'walking' | 'running' = 'walking'): HybridPlannedSegment =>
  ({ index, kind: 'aerobic', aerobicType, durationSec, estCalories: 0 } as HybridPlannedSegment);
const stn = (index: number, parkId: string, content: StrengthBlockResult): HybridPlannedSegment =>
  ({ index, kind: 'strength', parkId, content, durationSec: 600, estCalories: 0 } as HybridPlannedSegment);

describe('computeStationContext', () => {
  const content = block([we('a')]);
  const plan = [aero(0, 300), stn(1, 'p1', content), aero(2, 420), stn(3, 'p2', content), aero(4, 300)];
  const names = { p1: 'גינת הדקל', p2: 'פארק המסילה' };

  it('a station with another station ahead is NOT final, and knows the next park + leg minutes', () => {
    const ctx = computeStationContext(plan, 1, names);
    expect(ctx).toEqual({ isFinalStation: false, nextStationName: 'פארק המסילה', nextWalkSec: 420, nextLegKind: 'walking', parkId: 'p1' });
  });

  it('the LAST station is final (only a closing leg follows) → no completion screen', () => {
    expect(computeStationContext(plan, 3, names).isFinalStation).toBe(true);
  });

  it('unknown park name → null (screen falls back to a generic label)', () => {
    expect(computeStationContext(plan, 1, {}).nextStationName).toBeNull();
  });

  it('formats the leg to the next station as minutes, walking or running', () => {
    expect(formatApproxWalkMinutes(420)).toBe('7 דק׳ הליכה');
    expect(formatApproxWalkMinutes(20, 'running')).toBe('1 דק׳ ריצה');
  });
});

describe('completion-screen numbers', () => {
  it('counts distinct exercises with at least one logged set', () => {
    expect(countStationExercises([
      { exerciseId: 'a', confirmedReps: [10, 10] },
      { exerciseId: 'b', confirmedReps: [] },
      { exerciseId: 'c', confirmedReps: [8] },
    ])).toBe(2);
  });
  it('minutes at the station: whole minutes, ≥1 once time passed, 0 when unknown', () => {
    expect(stationMinutes(0, 7.4 * 60000)).toBe(7);
    expect(stationMinutes(0, 20000)).toBe(1);
    expect(stationMinutes(null, 60000)).toBe(0);
  });
});

describe('swapExerciseInStationContent — the swap lands in the station plan (what the player plays + logs)', () => {
  it('maps the plan position to the block and keeps the prescription', () => {
    const content = block([we('a'), we('b'), we('c')]);
    const plan = strengthBlockToWorkoutPlan(content);
    const replaced = swapExerciseInStationContent(content, plan, 0, 1, { id: 'z', name: 'החלפה' }, { id: 'z-m' })!;
    expect(replaced).not.toBeNull();
    expect(replaced.exercises.map((e) => (e.exercise as { id: string }).id)).toEqual(['a', 'z', 'c']);
    expect(replaced.exercises[1].sets).toBe(3);
    expect(replaced.exercises[1].restSeconds).toBe(60);
    expect(replaced.exercises[1].wasSwapped).toBe(true);
    // The rebuilt plan carries the NEW exercise at that position. useExerciseLog keys every
    // logged set by the plan exercise's id/name, so this is what the station's exerciseLog,
    // the summary and history record from now on.
    const rebuilt = strengthBlockToWorkoutPlan(replaced);
    expect(rebuilt.segments[0].exercises?.[1]).toMatchObject({ id: 'z', name: 'החלפה' });
    expect(content.exercises[1].exercise).toMatchObject({ id: 'b' }); // input untouched
  });

  it('duplicate ids: the k-th occurrence in the plan maps to the k-th in the block', () => {
    const content = block([we('a'), we('dup'), we('dup')]);
    const plan = strengthBlockToWorkoutPlan(content);
    expect(locateStationContentIndex(content, plan, 0, 2)).toBe(2);
    expect(locateStationContentIndex(content, plan, 0, 1)).toBe(1);
  });

  it('an unmappable position → null (plan left unchanged)', () => {
    const content = block([we('a')]);
    const plan = strengthBlockToWorkoutPlan(content);
    expect(swapExerciseInStationContent(content, plan, 0, 5, { id: 'z' }, {})).toBeNull();
    expect(swapExerciseInStationContent(content, plan, 3, 0, { id: 'z' }, {})).toBeNull();
  });
});

describe('useHybridRun — station completion + swap (store level)', () => {
  const content1 = block([we('a'), we('b')]);
  const content2 = block([we('c')]);
  const plan: HybridPlan = {
    segments: [aero(0, 300), stn(1, 'p1', content1), aero(2, 420), stn(3, 'p2', content2), aero(4, 300)],
    totals: { aerobicMin: 17, strengthMin: 20, distanceKm: 2, estCalories: 200, stations: 2 },
    meta: {} as HybridPlan['meta'],
  };

  beforeEach(() => {
    useHybridRun.getState().reset();
    useSessionStore.getState().startSession('walking' as never); // run clock live on the first leg
    useHybridRun.getState().startHybrid(plan, 'walking', false, true, { p1: 'גינה 1', p2: 'גינה 2' });
  });

  it('non-final station: the screen is held, the run clock stays paused, and continuing resumes it', () => {
    useHybridRun.getState().arrive();
    expect(useHybridRun.getState().phase).toBe('station');
    expect(useSessionStore.getState().status).toBe('paused'); // arrive() froze the run clock
    useHybridRun.getState().finishStationWork([{ exerciseId: 'a', exerciseName: 'a', confirmedReps: [10], targetReps: 10 }]);
    const pending = useHybridRun.getState().pendingStationComplete;
    expect(pending).not.toBeNull();
    expect(pending!.exercises).toBe(1);
    expect(useHybridRun.getState().phase).toBe('station'); // still at the station
    expect(useSessionStore.getState().status).toBe('paused'); // still frozen while the screen is up
    useHybridRun.getState().continueAfterStation();
    expect(useHybridRun.getState().pendingStationComplete).toBeNull();
    expect(useHybridRun.getState().phase).toBe('aerobic');
    expect(useSessionStore.getState().status).toBe('active'); // walking clock starts on "המשך במסלול"
  });

  it('FINAL station: no completion screen — goes straight to the existing path', () => {
    useHybridRun.getState().arrive();
    useHybridRun.getState().continueAfterStation(); // no-op: nothing pending
    useHybridRun.getState().finishStationWork([]); // station 1 → held
    useHybridRun.getState().continueAfterStation();
    useHybridRun.getState().arrive(); // station 2 (the last one)
    expect(useHybridRun.getState().stationContext?.isFinalStation).toBe(true);
    useHybridRun.getState().finishStationWork([]);
    expect(useHybridRun.getState().pendingStationComplete).toBeNull();
    expect(useHybridRun.getState().phase).toBe('aerobic'); // closing leg, as before
  });

  it('swap writes the replacement into the live station plan', () => {
    useHybridRun.getState().arrive();
    const ok = useHybridRun.getState().swapStationExercise(0, 0, { id: 'z', name: 'החלפה' }, { id: 'z-m' });
    expect(ok).toBe(true);
    const ex = useHybridRun.getState().stationPlan?.segments[0].exercises?.[0];
    expect(ex).toMatchObject({ id: 'z', name: 'החלפה' });
    expect(useHybridRun.getState().getStationSwapCandidate(0, 0)?.exercise).toMatchObject({ id: 'z' });
  });
});
