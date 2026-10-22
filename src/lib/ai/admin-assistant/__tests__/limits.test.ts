import { describe, it, expect } from 'vitest';
import { ADMIN_AI_MAX_MODEL_CALLS, ADMIN_AI_PER_QUESTION_CAP_USD, nextToolRound } from '../limits';

describe('nextToolRound (per-question caps)', () => {
  it('allows a tool round while under both caps', () => {
    expect(nextToolRound(0, 0)).toEqual({ allowed: true });
    expect(nextToolRound(1, 0.01)).toEqual({ allowed: true });
  });
  it('the last allowed call is reserved for the final answer → no tool round at calls = max-1', () => {
    expect(nextToolRound(ADMIN_AI_MAX_MODEL_CALLS - 1, 0)).toEqual({ allowed: false, reason: 'max_calls' });
  });
  it('per-question cap stops another tool round ($0.05)', () => {
    expect(ADMIN_AI_PER_QUESTION_CAP_USD).toBe(0.05);
    expect(nextToolRound(1, 0.05)).toEqual({ allowed: false, reason: 'question_cap' });
    expect(nextToolRound(0, 0.2)).toEqual({ allowed: false, reason: 'question_cap' });
  });
});
