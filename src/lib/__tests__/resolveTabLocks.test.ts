import { describe, it, expect } from 'vitest';
import { resolveTabLocks } from '../resolveTabLocks';

const strengthOnly = { progression: { domains: { upper_body: { currentLevel: 1 } } } };
const runningOnly = { running: { isUnlocked: true } };
const both = {
  progression: { domains: { upper_body: { currentLevel: 1 } } },
  running: { isUnlocked: true },
};
const neither = {};

describe('resolveTabLocks', () => {
  it('strength only: running and mixed are locked, strength is not', () => {
    expect(resolveTabLocks(strengthOnly)).toEqual({ strength: false, running: true, mixed: true });
  });

  it('running only: strength and mixed are locked, running is not', () => {
    expect(resolveTabLocks(runningOnly)).toEqual({ strength: true, running: false, mixed: true });
  });

  it('both tracks owned: nothing is locked', () => {
    expect(resolveTabLocks(both)).toEqual({ strength: false, running: false, mixed: false });
  });

  it('neither track owned: everything is locked', () => {
    expect(resolveTabLocks(neither)).toEqual({ strength: true, running: true, mixed: true });
  });

  it('does not throw for null profile — locks everything, same as neither-owned', () => {
    expect(() => resolveTabLocks(null)).not.toThrow();
    expect(resolveTabLocks(null)).toEqual({ strength: true, running: true, mixed: true });
  });

  it('does not throw for undefined profile — locks everything, same as neither-owned', () => {
    expect(() => resolveTabLocks(undefined)).not.toThrow();
    expect(resolveTabLocks(undefined)).toEqual({ strength: true, running: true, mixed: true });
  });
});
