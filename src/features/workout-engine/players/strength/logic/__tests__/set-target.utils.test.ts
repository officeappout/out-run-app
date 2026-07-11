import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolvePyramidStep,
  resolveSetTarget,
  effectiveSetsForExercise,
  stripRoundPrefix,
} from '../set-target.utils';

/** 5-step up-down pyramid with DISTINCT media per step — the wrong-video family fixture. */
const fivePyramid = {
  id: 'ex-1',
  sets: 5,
  reps: '5x8',
  pyramidSequence: [1, 2, 3, 4, 5].map((i) => ({
    setIndex: i - 1,
    exerciseId: `variant-${i}`,
    name: `שלב ${i}`,
    targetReps: [8, 5, 3, 5, 8][i - 1],
    videoSrc: `https://cdn/video-step-${i}.mp4`,
    imageUrl: `https://cdn/img-step-${i}.jpg`,
  })),
};

afterEach(() => vi.restoreAllMocks());

describe('resolvePyramidStep — the single per-step lookup', () => {
  it('returns the FULL step per index — targets AND media, in order (stuck-video regression)', () => {
    for (let i = 0; i < 5; i++) {
      const step = resolvePyramidStep(fivePyramid, i)!;
      expect(step.name).toBe(`שלב ${i + 1}`);
      expect(step.videoSrc).toBe(`https://cdn/video-step-${i + 1}.mp4`);
      expect(step.imageUrl).toBe(`https://cdn/img-step-${i + 1}.jpg`);
      expect(step.targetReps).toBe([8, 5, 3, 5, 8][i]);
    }
  });
  it('null out of range / no sequence', () => {
    expect(resolvePyramidStep(fivePyramid, 5)).toBeNull();
    expect(resolvePyramidStep({ id: 'x' }, 0)).toBeNull();
    expect(resolvePyramidStep(null, 0)).toBeNull();
  });
});

describe('resolveSetTarget — unified precedence', () => {
  it('pyramid step wins, exposes reps + the step object', () => {
    const t = resolveSetTarget(fivePyramid, 2);
    expect(t).toMatchObject({ reps: 3, hold: null, source: 'pyramid' });
    expect(t.step?.videoSrc).toBe('https://cdn/video-step-3.mp4');
  });
  it('hold-step (unilateral/isometric pyramid) resolves targetHold', () => {
    const holdEx = { pyramidSequence: [{ setIndex: 0, exerciseId: 'v', name: 'hold', targetHold: 12 }] };
    expect(resolveSetTarget(holdEx, 0)).toMatchObject({ reps: null, hold: 12, source: 'pyramid' });
  });
  it('REGRESSION (the logging bug): repsSequence is consulted when no pyramidSequence', () => {
    const repPyramid = { reps: '5x8', repsSequence: [8, 10, 12, 10, 8] };
    expect(resolveSetTarget(repPyramid, 1)).toMatchObject({ reps: 10, source: 'repsSequence' });
    expect(resolveSetTarget(repPyramid, 4)).toMatchObject({ reps: 8, source: 'repsSequence' });
  });
  it('falls back to the stripped reps string ("3x8" → 8, "3x6-8" → 6)', () => {
    expect(resolveSetTarget({ reps: '3x8' }, 0)).toMatchObject({ reps: 8, source: 'repsString' });
    expect(resolveSetTarget({ reps: '3x6-8' }, 0)).toMatchObject({ reps: 6, source: 'repsString' });
  });
  it('none when nothing resolvable', () => {
    expect(resolveSetTarget({}, 0)).toMatchObject({ reps: null, hold: null, source: 'none' });
  });
});

describe('effectiveSetsForExercise — sequence authoritative + legacy preserved', () => {
  it('legacy behavior byte-identical for non-sequence exercises', () => {
    expect(effectiveSetsForExercise({ sets: 4 })).toBe(4);          // sets>1
    expect(effectiveSetsForExercise({ sets: 1, reps: '3x8' })).toBe(3); // "Nx" parse
    expect(effectiveSetsForExercise({ reps: '8-12' })).toBe(1);     // default
    expect(effectiveSetsForExercise(null)).toBe(1);
  });
  it('sequence length wins on desync + warns (orphaned-tail / truncation guard)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(effectiveSetsForExercise({ ...fivePyramid, sets: 3 })).toBe(5);
    expect(warn).toHaveBeenCalledOnce();
    expect(effectiveSetsForExercise({ repsSequence: [8, 10, 12], sets: 5 })).toBe(3);
  });
  it('no warn when sets and sequence agree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(effectiveSetsForExercise(fivePyramid)).toBe(5);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('stripRoundPrefix', () => {
  it('strips only the round multiplier', () => {
    expect(stripRoundPrefix('3x8')).toBe('8');
    expect(stripRoundPrefix('3 X 6-8')).toBe('6-8');
    expect(stripRoundPrefix('8-12')).toBe('8-12');
    expect(stripRoundPrefix(undefined)).toBe('');
  });
});
