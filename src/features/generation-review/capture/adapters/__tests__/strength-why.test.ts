/**
 * strengthParts (PR 5): the log carries the split day as its focus ('full' is no focus)
 * and the overview's "why this workout" line, so the review panel can show both.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { lifestyle: { scheduleDays: ['א', 'ג', 'ה'] } } }) },
}));
vi.mock('../profile', () => ({ profileInput: () => ({}), userGear: () => null }));
vi.mock('../workout', () => ({ summarizeExercises: () => [] }));

import { strengthParts } from '../strength';

const w = (extra: Record<string, unknown>) => ({ title: 'אימון', estimatedDuration: 30, exercises: [], ...extra }) as never;

describe('strengthParts — focus + why', () => {
  it('a split day becomes the focus and gets a why line', () => {
    const { input, output } = strengthParts(w({ dayFocus: 'upper' }), { location: 'home' });
    expect(input.focus).toBe('upper');
    expect(output.whyHe).toMatch(/^היום יום/);
  });
  it("a full-body day is not a focus (STRENGTH_SINGLE_PATTERN still applies)", () => {
    const { input, output } = strengthParts(w({ dayFocus: 'full' }), {});
    expect(input.focus).toBeNull();
    expect(output.whyHe).toMatch(/^יום כל הגוף/);
  });
  it('a requested focus wins; no stamp ⇒ no why', () => {
    const { input, output } = strengthParts(w({}), { focus: 'pull' });
    expect(input.focus).toBe('pull');
    expect(output.whyHe).toBeNull();
  });
});
