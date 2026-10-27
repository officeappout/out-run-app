import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { plannedSessionMinutes, programStartOf, storedSessionMinutes, weeklyActiveTargetOf } from '../plannedSessionMinutes';

const NOW = new Date('2026-10-27T10:00:00');
const beginner = (over: Record<string, unknown> = {}) => ({
  lifestyle: { sessionMinutes: 45 },
  progression: { tracks: { push: { currentLevel: 3 } }, activePrograms: [{ startDate: '2026-10-26T08:00:00.000Z' }] },
  ...over,
});

describe('plannedSessionMinutes', () => {
  it('null without a saved length: existing users keep their defaults', () => {
    expect(plannedSessionMinutes({ lifestyle: {}, progression: {} }, NOW)).toBeNull();
    expect(plannedSessionMinutes(null, NOW)).toBeNull();
    expect(storedSessionMinutes('30')).toBeNull();
    expect(storedSessionMinutes(500)).toBeNull();
  });

  it('a beginner in week 1 gets the ramp cap, a level 6+ user the choice', () => {
    expect(plannedSessionMinutes(beginner(), NOW)).toBe(20);
    expect(plannedSessionMinutes(beginner({ progression: { tracks: { push: { currentLevel: 8 } }, activePrograms: [] } }), NOW)).toBe(45);
  });

  it('the earliest program start is week 0', () => {
    const p = { progression: { activePrograms: [{ startDate: '2026-10-20' }, { startDate: new Date('2026-09-01') }, { startDate: 'bad' }] } };
    expect(programStartOf(p)?.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('weekly target follows the level', () => {
    expect(weeklyActiveTargetOf(beginner(), NOW)).toBeLessThanOrEqual(90);
    expect(weeklyActiveTargetOf({ progression: { tracks: { pull: { currentLevel: 9 } } } }, NOW)).toBe(150);
  });
});
