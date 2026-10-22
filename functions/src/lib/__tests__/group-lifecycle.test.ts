import { describe, it, expect } from 'vitest';
import { isPendingActivation, shouldAutoActivate, isZombieGroup, isEphemeralGroup } from '../group-lifecycle';
import { keepBoardGroups } from '../apply-league-stats';

describe('group lifecycle (group audit P1-5)', () => {
  const pending = { isActive: false, minimumMembers: 3, memberCount: 1 };

  it('a pending group (min > 1, never activated) auto-activates at its minimum', () => {
    expect(isPendingActivation(pending)).toBe(true);
    expect(shouldAutoActivate(pending, 2)).toBe(false);
    expect(shouldAutoActivate(pending, 3)).toBe(true);
  });

  it('an admin-deactivated group is never re-activated by member writes', () => {
    expect(shouldAutoActivate({ isActive: false }, 10)).toBe(false); // min defaults to 1
    expect(shouldAutoActivate({ isActive: false, minimumMembers: 1 }, 10)).toBe(false);
    expect(shouldAutoActivate({ ...pending, activatedAt: { seconds: 1 } }, 10)).toBe(false);
  });

  it('a moderation-removed group is never re-activated or swept', () => {
    const removed = { ...pending, moderationState: 'removed' };
    expect(shouldAutoActivate(removed, 10)).toBe(false);
    expect(isZombieGroup(removed)).toBe(false);
  });

  it('only a pending group below its minimum is a zombie', () => {
    expect(isZombieGroup(pending)).toBe(true);
    expect(isZombieGroup({ isActive: false })).toBe(false); // deactivated, kept
    expect(isZombieGroup({ ...pending, memberCount: 3 })).toBe(false); // reached min before (legacy, no stamp)
    expect(isZombieGroup({ ...pending, isActive: true })).toBe(false);
    expect(isZombieGroup({ ...pending, type: 'ephemeral' })).toBe(false);
  });
});

describe('ephemeral groups (P1-13 / P1-14)', () => {
  it('isEphemeralGroup', () => {
    expect(isEphemeralGroup({ type: 'ephemeral' })).toBe(true);
    expect(isEphemeralGroup({})).toBe(false);
    expect(isEphemeralGroup(undefined)).toBe(false);
  });
  it('keepBoardGroups drops ephemeral run groups, keeps the rest in order', () => {
    expect(keepBoardGroups(['a', 'run1', 'b', 'gone'], [{ name: 'A' }, { type: 'ephemeral' }, {}, undefined])).toEqual(['a', 'b', 'gone']);
  });
});
