/**
 * enable_swap_fixes_v1 — the pure swap helpers. Every helper is a no-op / today's value
 * while the flag is off.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  collectWorkoutExerciseIds,
  isSwapBlockedNow,
  replaceAtSlot,
  swapOptionImageMethod,
  swapWindowLevel,
} from '../swap-fixes';
import { applyCheckpointSwaps, clearCheckpointSwaps, saveSwapToCheckpoint } from '../../hooks/swap-checkpoint';
import { swapPyramidStep } from '../pyramid-step-swap';
import { withSwappedTag } from '@/features/workout-engine/components/strength/utils/summary-v2.mapping';
import { deriveRunnerSwapVolume } from '@/app/workouts/[id]/active/runner-swap-volume';

describe('collectWorkoutExerciseIds', () => {
  it('every slot (generated + runner shapes) and every pyramid step, deduped', () => {
    expect(
      collectWorkoutExerciseIds([
        { exercise: { id: 'a' } },
        { id: 'b' },
        { exercise: { id: 'a' }, pyramidSequence: [{ exerciseId: 'c' }, { exerciseId: 'a' }] },
        null,
      ]),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('replaceAtSlot', () => {
  it('replaces only the given index — a duplicate elsewhere keeps its exercise', () => {
    const list = [{ id: 'x' }, { id: 'x' }, { id: 'y' }];
    const out = replaceAtSlot(list, 1, () => ({ id: 'z' }));
    expect(out.map((e) => e.id)).toEqual(['x', 'z', 'y']);
    expect(out[0]).toBe(list[0]);
  });
});

describe('swapWindowLevel', () => {
  it('flag off → the caller’s level (today)', () => {
    expect(swapWindowLevel(false, { userDomainLevel: 3 }, 8)).toBe(8);
  });
  it('flag on → the exercise’s own domain level, then its level, then programLevel', () => {
    expect(swapWindowLevel(true, { userDomainLevel: 3, exerciseLevel: 5 }, 8)).toBe(3);
    expect(swapWindowLevel(true, { exerciseLevel: 5, programLevel: 6 }, 8)).toBe(5);
    expect(swapWindowLevel(true, { programLevel: 6 }, 8)).toBe(6);
    expect(swapWindowLevel(true, {}, 8)).toBe(8);
  });
});

describe('isSwapBlockedNow / swapOptionImageMethod', () => {
  it('blocks only a tabata work interval, only with the flag', () => {
    expect(isSwapBlockedNow(true, { isTabata: true, isWorkPhase: true })).toBe(true);
    expect(isSwapBlockedNow(true, { isTabata: true, isWorkPhase: false })).toBe(false);
    expect(isSwapBlockedNow(true, { isTabata: false, isWorkPhase: true })).toBe(false);
    expect(isSwapBlockedNow(false, { isTabata: true, isWorkPhase: true })).toBe(false);
  });
  it('image follows the chosen method only with the flag', () => {
    expect(swapOptionImageMethod(true, 'chosen', () => 'lookup')).toBe('chosen');
    expect(swapOptionImageMethod(false, 'chosen', () => 'lookup')).toBe('lookup');
    expect(swapOptionImageMethod(true, null, () => 'lookup')).toBe('lookup');
  });
});

describe('swap checkpoint (resume keeps swaps)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubStorage = () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
      },
    });
    return store;
  };

  it('a saved swap is put back into its slot on resume; other workouts / cleared → untouched', () => {
    stubStorage();
    const plan = { segments: [{ exercises: [{ id: 'a' }, { id: 'b' }] }, { exercises: [{ id: 'c' }] }] };
    expect(applyCheckpointSwaps('w1', plan)).toBe(plan);
    saveSwapToCheckpoint('w1', 0, 1, { id: 'B2', wasSwapped: true });
    const resumed = applyCheckpointSwaps('w1', plan);
    expect(resumed.segments[0].exercises.map((e) => e.id)).toEqual(['a', 'B2']);
    expect(resumed.segments[1]).toBe(plan.segments[1]);
    expect(applyCheckpointSwaps('other', plan)).toBe(plan);
    clearCheckpointSwaps();
    expect(applyCheckpointSwaps('w1', plan)).toBe(plan);
  });

  it('an expired record is ignored', () => {
    stubStorage();
    const plan = { segments: [{ exercises: [{ id: 'a' }] }] };
    saveSwapToCheckpoint('w1', 0, 0, { id: 'z' }, 1_000);
    expect(applyCheckpointSwaps('w1', plan, 1_000 + 3 * 60 * 60 * 1000)).toBe(plan);
  });
});

describe('swapPyramidStep (hybrid overview)', () => {
  const seq = [
    { exerciseId: 'tuck', name: 'Tuck', targetReps: 8 },
    { exerciseId: 'tuck', name: 'Tuck', targetReps: 4 },
  ];
  it('replaces only the tapped step (not its twin), keeps the shape rep', () => {
    const out = swapPyramidStep(seq, 1, { id: 'adv', name: { he: 'מתקדם' } } as any, null);
    expect(out[0]).toBe(seq[0]);
    expect(out[1]).toMatchObject({ exerciseId: 'adv', name: 'מתקדם', targetReps: 4, isSwapped: true });
  });
  it('a hold variant turns the shape rep into seconds (×2.5)', () => {
    const out = swapPyramidStep(seq, 0, { id: 'h', name: { he: 'החזקה' }, metric: 'hold' } as any, null);
    expect(out[0]).toMatchObject({ exerciseId: 'h', targetHold: 20, targetReps: undefined });
  });
});

describe('withSwappedTag (summary)', () => {
  const rows = [{ key: 'a', name: 'A', subtitle: 'יעד 8 חזרות', tiles: [] }, { key: 'b', name: 'B', subtitle: 'יעד 30 שנ׳', tiles: [] }];
  const exs = [{ swapped: true }, {}] as any;
  it('flag on → swapped rows get the tag; off → same rows', () => {
    expect(withSwappedTag(rows, exs, true, 'הוחלף').map((r) => r.subtitle)).toEqual(['הוחלף · יעד 8 חזרות', 'יעד 30 שנ׳']);
    expect(withSwappedTag(rows, exs, false, 'הוחלף')).toBe(rows);
  });
});

describe('deriveRunnerSwapVolume (active player, like the preview)', () => {
  it('reps → hold resets to the hold default', () => {
    const v = deriveRunnerSwapVolume({ exerciseType: 'reps', sets: 3, repsRange: { min: 8, max: 10 }, exerciseLevel: 5 }, true, 5, false);
    expect(v).toMatchObject({ exerciseType: 'time', repsRange: { min: 20, max: 45 }, duration: '3×20-45 שניות', reps: undefined });
  });
  it('a harder variant trims the range (−10%/level)', () => {
    const v = deriveRunnerSwapVolume({ exerciseType: 'reps', sets: 3, repsRange: { min: 10, max: 10 }, exerciseLevel: 5 }, false, 7, true);
    expect(v).toMatchObject({ exerciseType: 'reps', repsRange: { min: 8, max: 8 }, reps: '3×8 חזרות (לכל צד)' });
  });
  it('no range and the same metric → the old strings', () => {
    expect(deriveRunnerSwapVolume({ exerciseType: 'reps', reps: '12 חזרות' }, false, 9, false)).toEqual({
      exerciseType: 'reps',
      reps: '12 חזרות',
      duration: undefined,
    });
  });
});
