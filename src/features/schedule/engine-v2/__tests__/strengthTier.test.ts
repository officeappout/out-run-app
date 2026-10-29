import { describe, expect, it } from 'vitest';
import { breaksH6 } from '../rules';
import { strengthTier } from '../strengthTier';
import { makeStrengthUnit } from '../units';

describe('strengthTier (owner 27.10.2026)', () => {
  it('light programs and short sessions are light; full programs, heavy legs and hard skills are hard', () => {
    expect(strengthTier(makeStrengthUnit('core'))).toBe('light');
    expect(strengthTier(makeStrengthUnit('push'))).toBe('hard');
    expect(strengthTier({ ...makeStrengthUnit('push'), sessionMinutes: 15 })).toBe('light');
    expect(strengthTier({ ...makeStrengthUnit('legs'), sessionMinutes: 15 })).toBe('hard');
    expect(strengthTier({ ...makeStrengthUnit('muscle_up'), sessionMinutes: 15 })).toBe('hard');
  });

  it('a light session may follow a same-pattern hard session the next day (H6)', () => {
    const hard = makeStrengthUnit('push', 'a');
    expect(breaksH6(hard, 0, makeStrengthUnit('push', 'b'), 1)).toBe(true);
    expect(breaksH6(hard, 0, { ...makeStrengthUnit('push', 'b'), sessionMinutes: 15 }, 1)).toBe(false);
  });
});
