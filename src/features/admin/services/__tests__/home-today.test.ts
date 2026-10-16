import { describe, it, expect } from 'vitest';
import { computeWeekPulse, type HomeUser, type HomeWorkout } from '../home-today';

const NOW = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const u = (uid: string, createdDaysAgo: number, p: Partial<HomeUser> = {}): HomeUser => ({
  uid, createdAt: daysAgo(createdDaysAgo), source: null, linkId: null, onboardingDone: false, onboardingCompletedAt: null, ...p,
});
const w = (uid: string, d: number): HomeWorkout => ({ uid, at: daysAgo(d) });

describe('computeWeekPulse', () => {
  const users = [
    u('a', 2, { source: 'instagram' }),
    u('b', 3, { source: 'instagram' }),
    u('c', 5, { source: 'website' }),
    u('d', 9),                                   // last week, activated (trained 2 days after signup)
    u('e', 10),                                  // last week, not activated
    u('f', 6, { onboardingDone: true, onboardingCompletedAt: daysAgo(5) }), // finished 5 days ago, never trained → nudge
    u('g', 1, { onboardingDone: true, onboardingCompletedAt: daysAgo(1) }), // too fresh to nudge
  ];
  const workouts = [
    w('d', 7),          // within d's first week
    w('x', 1), w('x', 9), // active this week and last week
    w('y', 20),         // at risk: trained 20 days ago, nothing since
    w('z', 3), w('z', 16), // active this week → not at risk
  ];
  const p = computeWeekPulse(users, workouts, NOW);

  it('signups this week vs last week', () => {
    expect(p.signupsThisWeek).toBe(5); // a b c f g
    expect(p.signupsLastWeek).toBe(2); // d e
  });
  it('activation over the complete 8–14-day cohort', () => {
    expect(p.activationSample).toBe(2);
    expect(p.activationPct).toBe(50);
  });
  it('weekly active and at-risk', () => {
    expect(p.activeThisWeek).toBe(2); // x z
    expect(p.activeLastWeek).toBe(2); // x d
    expect(p.atRisk).toBe(1);         // y
  });
  it('users to nudge', () => {
    expect(p.toNudge).toBe(1); // f
  });
  it('top known source this week (organic excluded)', () => {
    expect(p.topChannel).toEqual({ key: 'instagram', label: 'אינסטגרם', signups: 2 });
  });
  it('no cohort → activation is null, not 0', () => {
    expect(computeWeekPulse([u('a', 1)], [], NOW).activationPct).toBeNull();
  });
});
