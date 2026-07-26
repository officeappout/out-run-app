import { describe, it, expect } from 'vitest';
import { setsToMinutes, FRAGMENTER_MINUTES_PER_SET } from '../setsToMinutes';

/**
 * Daily Strength Ring · Layer A — sets→minutes display conversion.
 * Formula derived from the engine (calculateEstimatedDuration / Fragmenter),
 * not an invented constant. These tests pin the derivation and that it never
 * depends on SessionLog.durationMinutes.
 */

describe('setsToMinutes', () => {
  it('precise formula for a typical level (10 reps, 3s/rep, 60s rest)', () => {
    // per-set = 10*3 + 60 = 90s; 12 sets → 12*90/60 = 18 min
    expect(setsToMinutes(12, { avgReps: 10, secondsPerRep: 3, restSeconds: 60 })).toBe(18);
  });

  it('proxy (no opts) = 2 min/set', () => {
    expect(setsToMinutes(12)).toBe(12 * FRAGMENTER_MINUTES_PER_SET); // 24
  });

  it('0 sets → 0 minutes', () => {
    expect(setsToMinutes(0)).toBe(0);
    expect(setsToMinutes(0, { avgReps: 10 })).toBe(0);
    expect(setsToMinutes(-3)).toBe(0);
  });

  it('partial opts fall back to sane per-field defaults (precise path)', () => {
    // only restSeconds given → avgReps 10, secPerRep 3 defaults → per-set = 30+45 = 75s
    // 8 sets → 8*75/60 = 10 min
    expect(setsToMinutes(8, { restSeconds: 45 })).toBe(10);
  });

  it('is a pure function of its args (no durationMinutes / store dependency)', () => {
    const a = setsToMinutes(6, { avgReps: 8, secondsPerRep: 3, restSeconds: 60 });
    const b = setsToMinutes(6, { avgReps: 8, secondsPerRep: 3, restSeconds: 60 });
    expect(a).toBe(b);
  });
});
