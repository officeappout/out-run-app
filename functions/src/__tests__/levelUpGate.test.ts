import { describe, it, expect } from 'vitest';
import { shouldSendLevelUpPush, LEVEL_UP_PUSH_ENABLED } from '../shared/level-up-gate';

describe('shouldSendLevelUpPush: pilot N4 (no XP push while XP is paused)', () => {
  it('XP paused: a steps-driven 1 to 2 level-up sends nothing', () => {
    expect(LEVEL_UP_PUSH_ENABLED).toBe(false);
    expect(shouldSendLevelUpPush(1, 2)).toBe(false);
  });

  it('XP shown: only a real numeric increase above level 1 pushes', () => {
    expect(shouldSendLevelUpPush(1, 2, true)).toBe(true);
    expect(shouldSendLevelUpPush(2, 2, true)).toBe(false);
    expect(shouldSendLevelUpPush(3, 2, true)).toBe(false);
    expect(shouldSendLevelUpPush(0, 1, true)).toBe(false);
    expect(shouldSendLevelUpPush(undefined, 2, true)).toBe(false);
  });
});
