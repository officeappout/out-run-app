import { describe, it, expect } from 'vitest';
import { aggregateJourneyActivation, type ActivationUser, type ActivationEvent } from '../journey-activation';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-15T12:00:00Z');

const u = (p: Partial<ActivationUser> & { uid: string }): ActivationUser => ({
  name: p.uid,
  createdAt: at('2026-10-05T10:00:00Z'),
  onboardingStatus: 'ONBOARDING',
  onboardingStep: null,
  onboardingCompletedAt: null,
  hasRealWorkout: false,
  ...p,
});

describe('aggregateJourneyActivation', () => {
  const users: ActivationUser[] = [
    u({ uid: 'a', onboardingStep: 'LOCATION' }),
    u({ uid: 'b', onboardingStep: 'LOCATION' }),
    u({ uid: 'c', onboardingStep: 'EQUIPMENT' }),
    u({ uid: 'd', onboardingStatus: 'COMPLETED', onboardingStep: 'COMPLETED', onboardingCompletedAt: at('2026-10-06T10:00:00Z') }), // 9 days, no workout → nudge
    u({ uid: 'e', onboardingStatus: 'COMPLETED', onboardingCompletedAt: at('2026-10-14T10:00:00Z') }), // 1 day → too fresh
    u({ uid: 'f', onboardingStatus: 'COMPLETED', onboardingCompletedAt: at('2026-10-06T10:00:00Z'), hasRealWorkout: true }),
  ];
  const events: ActivationEvent[] = [
    { userId: 'd', eventName: 'recommendation_shown', at: at('2026-10-06T11:00:00Z') },
    { userId: 'd', eventName: 'recommendation_shown', at: at('2026-10-07T11:00:00Z') }, // same user twice → counted once
    { userId: 'f', eventName: 'recommendation_shown', at: at('2026-10-06T11:00:00Z') },
    { userId: 'f', eventName: 'workout_detail_viewed', at: at('2026-10-06T11:05:00Z') },
    { userId: 'f', eventName: 'workout_complete', at: at('2026-10-06T11:40:00Z') },
    { userId: 'e', eventName: 'workout_complete', at: at('2026-10-14T11:00:00Z') }, // day 9 after signup → outside the first week
    { userId: 'zz', eventName: 'workout_complete', at: at('2026-10-06T11:00:00Z') }, // not a signup in range
    { userId: 'a', eventName: 'permission_location_status', at: at('2026-10-05T10:01:00Z'), status: 'denied' },
    { userId: 'a', eventName: 'permission_location_status', at: at('2026-10-05T10:02:00Z'), status: 'granted' }, // first answer wins
    { userId: 'f', eventName: 'permission_location_status', at: at('2026-10-05T10:02:00Z'), status: 'granted' },
  ];
  const r = aggregateJourneyActivation(users, events, NOW);

  it('stuck mid-onboarding, by current step, most first, in Hebrew', () => {
    expect(r.stuck).toEqual([
      { step: 'LOCATION', label: 'מיקום', count: 2 },
      { step: 'EQUIPMENT', label: 'ציוד', count: 1 },
    ]);
    expect(r.stuckTotal).toBe(3);
  });

  it('first-week road: distinct users per step, only signups in range, only within 7 days', () => {
    const by = Object.fromEntries(r.firstWorkout.map((s) => [s.event, s.users]));
    expect(by).toEqual({
      recommendation_shown: 2,
      workout_detail_viewed: 1,
      workout_start_pressed: 0,
      workout_session_started: 0,
      workout_complete: 1,
    });
  });

  it('location permission: one answer per user (the first)', () => {
    expect(r.locationPermission).toEqual({ granted: 1, denied: 1 });
  });

  it('nudge list: finished onboarding ≥3 days ago and never trained', () => {
    expect(r.nudge.count).toBe(1);
    expect(r.nudge.sample).toEqual([{ uid: 'd', name: 'd', daysSince: 9 }]);
  });

  it('signups = all users passed in', () => {
    expect(r.signups).toBe(6);
  });
});
