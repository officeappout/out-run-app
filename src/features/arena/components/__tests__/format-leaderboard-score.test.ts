import { describe, it, expect, vi } from 'vitest';

// Stage A requirement: the displayed unit always follows the selected
// metric — never a bare number, never a generic "נקודות" fallback. Before
// this change, 'strength' and non-segment 'running' fell through to a bare
// `value.toLocaleString('he-IL')` with no unit at all.

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  limit: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(), doc: vi.fn(), Timestamp: { fromDate: vi.fn() },
}));

import { formatLeaderboardScore } from '../format-leaderboard-score';

describe('formatLeaderboardScore — dynamic unit per metric, never a bare/generic fallback', () => {
  it('general mode: streak days', () => {
    expect(formatLeaderboardScore(5, 'general')).toBe('5 ימים');
  });

  it('steps mode: localized step count', () => {
    expect(formatLeaderboardScore(12345, 'steps')).toBe('12,345 צעדים');
  });

  it('running + segment mode: formatted pace, not raw seconds', () => {
    expect(formatLeaderboardScore(300, 'running', true)).toBe('5:00 /ק״מ');
  });

  it('running + segment mode with value 0: em dash, not "0:00"', () => {
    expect(formatLeaderboardScore(0, 'running', true)).toBe('—');
  });

  it('strength mode: metric-qualified label, never a bare number', () => {
    const result = formatLeaderboardScore(84, 'strength');
    expect(result).toBe("84 נק' כוח");
    expect(result).not.toBe('84'); // the original bare-number bug
  });

  it('running mode (non-segment): metric-qualified label, never a bare number', () => {
    const result = formatLeaderboardScore(60, 'running', false);
    expect(result).toBe("60 נק' ריצה");
    expect(result).not.toBe('60');
  });

  it('distance mode: real km unit, not a "נק\' X" points label', () => {
    expect(formatLeaderboardScore(12.5, 'distance')).toBe('12.5 ק"מ');
    expect(formatLeaderboardScore(0, 'distance')).toBe('0 ק"מ');
  });

  it('no mode ever produces the literal word "נקודות"', () => {
    const modes: Array<['general' | 'steps' | 'strength' | 'running' | 'distance', boolean | undefined]> = [
      ['general', undefined], ['steps', undefined], ['strength', undefined],
      ['running', true], ['running', false], ['distance', undefined],
    ];
    for (const [mode, seg] of modes) {
      expect(formatLeaderboardScore(42, mode, seg)).not.toContain('נקודות');
    }
  });
});
