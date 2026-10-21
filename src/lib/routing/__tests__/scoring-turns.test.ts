import { describe, expect, it } from 'vitest';
import { TURNS_FREE_PER_KM, TURNS_SCORE_WEIGHT, ZIGZAG_SCORE_WEIGHT, turnScorePenalty } from '../loops/scoring';

describe('turnScorePenalty (turn-aware loop ranking)', () => {
  it('is 0 for a calm loop (within the free turns allowance, zigzag <= 1.05)', () => {
    expect(turnScorePenalty({ turnsPerKm: TURNS_FREE_PER_KM, zigzagIndex: 1.05 })).toBe(0);
    expect(turnScorePenalty({ turnsPerKm: 1.5, zigzagIndex: 1.0 })).toBe(0);
  });
  it('grows linearly with extra turns/km and zigzag', () => {
    expect(turnScorePenalty({ turnsPerKm: TURNS_FREE_PER_KM + 4, zigzagIndex: 1 })).toBeCloseTo(4 * TURNS_SCORE_WEIGHT, 9);
    expect(turnScorePenalty({ turnsPerKm: 0, zigzagIndex: 1.15 })).toBeCloseTo(ZIGZAG_SCORE_WEIGHT, 9);
  });
  it('stays a tie-breaker: a block staircase costs less than failing a v1 bar (10)', () => {
    expect(turnScorePenalty({ turnsPerKm: 12, zigzagIndex: 1.41 })).toBeLessThan(1.5);
  });
});
