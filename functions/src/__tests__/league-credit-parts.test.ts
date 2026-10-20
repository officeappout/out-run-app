import { describe, expect, it } from 'vitest';
import { workoutCreditParts } from '../lib/league-scope-stats';

const seg = (kind: string, sec: number, extra: Record<string, unknown> = {}) => ({ kind, actual: { durationSec: sec }, ...extra });

describe('workoutCreditParts', () => {
  it('a solo workout is one part, exactly as before (minutes × multiplier)', () => {
    expect(workoutCreditParts({ category: 'strength', duration: 1800 })).toEqual([{ activity: 'strength', credit: 60 }]);
    expect(workoutCreditParts({ category: 'cardio', workoutType: 'running', duration: 1800 })).toEqual([{ activity: 'cardio', credit: 30 }]);
    expect(workoutCreditParts({ category: 'cardio', duration: 10 })).toEqual([]);
  });

  it('a combined workout counts per part: legs as cardio ×1, done stations as strength ×2', () => {
    const parts = workoutCreditParts({
      category: 'hybrid',
      workoutType: 'hybrid',
      duration: 3000,
      segments: [
        seg('aerobic', 600, { aerobicType: 'running' }),
        seg('strength', 900),
        seg('aerobic', 600, { aerobicType: 'walking' }),
        seg('strength', 600, { skipped: true }), // skipped → not strength time
        { kind: 'aerobic', actual: null },       // never started
      ],
    });
    expect(parts).toEqual([
      { activity: 'cardio', credit: 20 },
      { activity: 'strength', credit: 30 },
    ]);
  });

  it('drops a 0-point part and falls back to one part for a hybrid doc without segments', () => {
    expect(workoutCreditParts({ category: 'hybrid', segments: [seg('aerobic', 1200)] })).toEqual([{ activity: 'cardio', credit: 20 }]);
    expect(workoutCreditParts({ category: 'hybrid', duration: 1200 })).toEqual([{ activity: 'strength', credit: 40 }]);
  });
});
