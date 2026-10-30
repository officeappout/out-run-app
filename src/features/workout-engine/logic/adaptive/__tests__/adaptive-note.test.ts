import { describe, it, expect } from 'vitest';
import { nextAdaptiveState, type AdaptiveState, type SessionResultInput } from '../double-progression';
import { describeAdaptiveChange } from '../adaptive-change';
import { adaptiveNoteFor, withLastChange } from '../adaptive-note';

const NOW = 1_800_000_000_000;
const R = { min: 6, max: 10 };
const s = (values: number[], target: number): SessionResultInput => ({ values, target, range: R, isHold: false });
const ids = { exerciseId: 'pushup', exerciseName: 'שכיבות סמיכה' };

/** Save one session the way exercise-history does, return the stored state. */
function save(prev: AdaptiveState | null, input: SessionResultInput): AdaptiveState {
  const next = nextAdaptiveState(prev, input, NOW)!;
  return next === prev ? next : withLastChange(next, describeAdaptiveChange(prev, next, input, ids, NOW));
}
const note = (states: Record<string, AdaptiveState>, over: Partial<Parameters<typeof adaptiveNoteFor>[0]> = {}) =>
  adaptiveNoteFor({ exerciseId: 'pushup', states, reasoning: [], reps: 9, isHold: false, extraApplied: false, nowMs: NOW + 1000, ...over });

describe('withLastChange', () => {
  it('keeps the change on the saved state, drops an old one when nothing changed', () => {
    const up = save(null, s([8, 8, 8], 8));
    expect(up.lastChange).toEqual({ kind: 'up', from: 8, doneMin: 8, doneMax: 8, name: 'שכיבות סמיכה' });
    const held = save(up, s([9, 8, 7], 9)); // neutral → no change
    expect('lastChange' in held).toBe(false);
  });
});

describe('adaptiveNoteFor (next workout)', () => {
  it('up: tag with today\'s target', () => {
    const st = save(null, s([8, 8, 8], 8));
    expect(note({ pushup: st })).toEqual({ kind: 'up', to: 9, doneMin: 8, doneMax: 8, isHold: false });
  });
  it('no tag when today\'s target did not actually go up (volume cut)', () => {
    const st = save(null, s([8, 8, 8], 8));
    expect(note({ pushup: st }, { reps: 8 })).toBeUndefined();
  });
  it('extra set only when it was really added', () => {
    let st = save(null, s([10, 10, 10], 10));
    st = save(st, s([10, 10, 10], 10));
    expect(st.lastChange?.kind).toBe('extra_set');
    expect(note({ pushup: st }, { reps: 10 })).toBeUndefined();
    expect(note({ pushup: st }, { reps: 10, extraApplied: true })?.kind).toBe('extra_set');
  });
  it('harder variation: the new exercise carries the source\'s numbers and name', () => {
    const st = save(null, s([15, 14, 13], 7));
    const n = note({ pushup: st }, { exerciseId: 'diamond', reps: 6, reasoning: ['adaptive:dp_harder:+40(from=pushup)'] });
    expect(n).toEqual({ kind: 'harder_variation', to: 6, doneMin: 13, doneMax: 15, isHold: false, prevName: 'שכיבות סמיכה' });
  });
  it('a variation the user already has a progression for gets no variation tag', () => {
    const src = save(null, s([15, 14, 13], 7));
    const own = save(null, s([6, 6, 6], 6));
    const n = note({ pushup: src, diamond: { ...own, lastChange: undefined } }, { exerciseId: 'diamond', reps: 6, reasoning: ['adaptive:dp_harder:+40(from=pushup)'] });
    expect(n).toBeUndefined();
  });
  it('the source picked again (no variation available) gets no tag', () => {
    const st = save(null, s([15, 14, 13], 7));
    expect(note({ pushup: st }, { reps: 10 })).toBeUndefined();
  });
});
