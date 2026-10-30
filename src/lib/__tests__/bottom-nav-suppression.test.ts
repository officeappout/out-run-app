import { describe, it, expect, beforeEach } from 'vitest';
import { useBottomNavSuppression } from '../bottom-nav-suppression';

const s = () => useBottomNavSuppression.getState();

describe('bottom-nav suppression counter', () => {
  beforeEach(() => useBottomNavSuppression.setState({ count: 0 }));

  it('stays hidden until the last suppressor releases', () => {
    s().suppress();
    s().suppress();
    s().release();
    expect(s().count > 0).toBe(true);
    s().release();
    expect(s().count).toBe(0);
  });

  it('never goes below zero on an extra release', () => {
    s().release();
    expect(s().count).toBe(0);
    s().suppress();
    expect(s().count).toBe(1);
  });
});
