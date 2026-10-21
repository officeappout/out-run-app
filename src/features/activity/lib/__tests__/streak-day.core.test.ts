/**
 * streak-day.core — the streak-day policy shared by the app and streakRescueScheduler
 * (owner decisions 21.10.2026). Pins the server mirror and the parity with the app's
 * existing streak rules.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  STREAK_DAY_FALLBACK_STEP_GOAL,
  STREAK_DAY_MIN_MINUTES,
  STREAK_POLICY_OFF,
  dayKeyAdd,
  dayLeftToClose,
  isDayClosed,
  isSaturdayKey,
  isStreakMilestone,
  rescueDue,
  resolveStreakGap,
  shieldsAfterAdvance,
  streakBrokeYesterday,
  streakPushSlotAt,
  streakToday,
} from '../streak-day.core';
import { dayQualifiesForStreak, dayQualifiesByMinutes, dayQualifiesBySteps } from '../streak-rules';
import { STREAK_MINIMUM_MINUTES } from '../../types/activity.types';
import { DAILY_STEP_GOAL } from '@/config/health-goals';

const SAT = { shabbatFree: true, shields: false };
const SHIELDS = { shabbatFree: false, shields: true };
const BOTH = { shabbatFree: true, shields: true };

describe('server mirror + parity with the app', () => {
  it('functions/src/shared/streak-day.core.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const app = readFileSync(path.join(root, 'src/features/activity/lib/streak-day.core.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/streak-day.core.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });

  it('same thresholds as the app constants', () => {
    expect(STREAK_DAY_MIN_MINUTES).toBe(STREAK_MINIMUM_MINUTES);
    expect(STREAK_DAY_FALLBACK_STEP_GOAL).toBe(DAILY_STEP_GOAL);
  });

  it('isDayClosed agrees with the app rules on a fixture grid', () => {
    for (const minutes of [0, 5, 9, 10, 30]) {
      for (const steps of [0, 3000, 7999, 8000, 12000]) {
        for (const stepsGoal of [undefined, 0, 5000, 10000]) {
          const day = { categories: { strength: { minutes: minutes / 2 }, cardio: { minutes: minutes / 2 } }, steps, stepsGoal };
          expect(isDayClosed(day)).toBe(dayQualifiesForStreak(day));
          expect(isDayClosed(day)).toBe(dayQualifiesByMinutes(day) || dayQualifiesBySteps(day));
        }
      }
    }
  });

  it('server extra: saved workouts close the day (max, never the sum)', () => {
    const day = { categories: { strength: { minutes: 6 } }, steps: 0 };
    expect(isDayClosed(day, 4)).toBe(false);
    expect(isDayClosed(day, 10)).toBe(true);
    expect(isDayClosed(null, 12)).toBe(true);
    expect(dayLeftToClose({ categories: {}, steps: 6200, stepsGoal: 8000 }, 3)).toEqual({ minutes: 7, steps: 1800 });
    expect(dayLeftToClose({ categories: {}, steps: 9000 })).toEqual({ minutes: 0, steps: 0 });
  });
});

describe('calendar', () => {
  it('Saturday and day keys', () => {
    expect(isSaturdayKey('2026-10-24')).toBe(true);
    expect(isSaturdayKey('2026-10-25')).toBe(false);
    expect(dayKeyAdd('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('gap: flags off = the streak as before', () => {
  it('a one-day gap breaks it, yesterday keeps it', () => {
    expect(resolveStreakGap({ currentStreak: 5, lastStreakDate: '2026-10-20' }, '2026-10-21', STREAK_POLICY_OFF).alive).toBe(true);
    expect(resolveStreakGap({ currentStreak: 5, lastStreakDate: '2026-10-19', shields: 2 }, '2026-10-21', STREAK_POLICY_OFF).alive).toBe(false);
    expect(resolveStreakGap({ currentStreak: 0, lastStreakDate: '' }, '2026-10-21', BOTH).alive).toBe(false);
  });
});

describe('Saturday rule (enable_shabbat_free_streak)', () => {
  it('a missed Saturday never breaks the streak and adds nothing', () => {
    const g = resolveStreakGap({ currentStreak: 6, lastStreakDate: '2026-10-23' }, '2026-10-25', SAT);
    expect(g).toMatchObject({ alive: true, missed: ['2026-10-24'], freeDays: ['2026-10-24'], shieldDays: [] });
    expect(streakToday({ currentStreak: 6, lastStreakDate: '2026-10-23' }, '2026-10-25', SAT).streak).toBe(6);
  });
  it('a missed Sunday is not free', () => {
    expect(resolveStreakGap({ currentStreak: 6, lastStreakDate: '2026-10-24' }, '2026-10-26', SAT).alive).toBe(false);
  });
  it('Friday + Saturday missed: Saturday is free but Friday still breaks it without a shield', () => {
    expect(resolveStreakGap({ currentStreak: 6, lastStreakDate: '2026-10-22' }, '2026-10-25', SAT).alive).toBe(false);
    expect(resolveStreakGap({ currentStreak: 6, lastStreakDate: '2026-10-22', shields: 1 }, '2026-10-25', BOTH)).toMatchObject({
      alive: true,
      freeDays: ['2026-10-24'],
      shieldDays: ['2026-10-23'],
      shieldsLeft: 0,
    });
  });
});

describe('shields (enable_streak_shields)', () => {
  it('one shield per missed day, then broken', () => {
    expect(resolveStreakGap({ currentStreak: 9, lastStreakDate: '2026-10-19', shields: 1 }, '2026-10-21', SHIELDS)).toMatchObject({
      alive: true,
      shieldDays: ['2026-10-20'],
      shieldsLeft: 0,
    });
    expect(resolveStreakGap({ currentStreak: 9, lastStreakDate: '2026-10-18', shields: 1 }, '2026-10-21', SHIELDS).alive).toBe(false);
    expect(resolveStreakGap({ currentStreak: 9, lastStreakDate: '2026-10-18', shields: 2 }, '2026-10-21', SHIELDS).alive).toBe(true);
    // A stored value above the max is clamped.
    expect(resolveStreakGap({ currentStreak: 9, lastStreakDate: '2026-10-17', shields: 5 }, '2026-10-21', SHIELDS).alive).toBe(false);
  });

  it('earned every 7 streak days, max 2, idempotent, reset with a new streak', () => {
    expect(shieldsAfterAdvance(6, 0, 0)).toEqual({ shields: 0, earnedAt: 0, earned: false });
    expect(shieldsAfterAdvance(7, 0, 0)).toEqual({ shields: 1, earnedAt: 7, earned: true });
    expect(shieldsAfterAdvance(7, 1, 7)).toEqual({ shields: 1, earnedAt: 7, earned: false }); // re-count of day 7
    expect(shieldsAfterAdvance(14, 1, 7)).toEqual({ shields: 2, earnedAt: 14, earned: true });
    expect(shieldsAfterAdvance(21, 2, 14)).toEqual({ shields: 2, earnedAt: 21, earned: false });
    expect(shieldsAfterAdvance(8, 1, 6)).toEqual({ shields: 2, earnedAt: 8, earned: true }); // +2 grace jump over 7
    expect(shieldsAfterAdvance(1, 1, 14)).toEqual({ shields: 1, earnedAt: 0, earned: false });
  });
});

describe('broken / rescue / slots / milestones', () => {
  it('broke yesterday = alive yesterday, not today', () => {
    expect(streakBrokeYesterday({ currentStreak: 9, lastStreakDate: '2026-10-19' }, '2026-10-21', STREAK_POLICY_OFF)).toBe(true);
    expect(streakBrokeYesterday({ currentStreak: 9, lastStreakDate: '2026-10-18' }, '2026-10-21', STREAK_POLICY_OFF)).toBe(false);
    expect(streakBrokeYesterday({ currentStreak: 9, lastStreakDate: '2026-10-20' }, '2026-10-21', STREAK_POLICY_OFF)).toBe(false);
    expect(streakBrokeYesterday({ currentStreak: 9, lastStreakDate: '2026-10-23' }, '2026-10-25', SAT)).toBe(false);
  });

  it('rescue rules', () => {
    const base = { todayKey: '2026-10-21', policy: STREAK_POLICY_OFF, closedByData: false };
    expect(rescueDue({ ...base, slot: 'rescue', snapshot: { currentStreak: 2, lastStreakDate: '2026-10-20' } })).toBe(true);
    expect(rescueDue({ ...base, slot: 'rescue', snapshot: { currentStreak: 1, lastStreakDate: '2026-10-20' } })).toBe(false);
    expect(rescueDue({ ...base, slot: 'rescue', snapshot: { currentStreak: 5, lastStreakDate: '2026-10-21' } })).toBe(false);
    expect(rescueDue({ ...base, closedByData: true, slot: 'rescue', snapshot: { currentStreak: 5, lastStreakDate: '2026-10-20' } })).toBe(false);
    expect(rescueDue({ ...base, slot: 'rescue_late', snapshot: { currentStreak: 6, lastStreakDate: '2026-10-20' } })).toBe(false);
    expect(rescueDue({ ...base, slot: 'rescue_late', snapshot: { currentStreak: 7, lastStreakDate: '2026-10-20' } })).toBe(true);
    expect(rescueDue({ ...base, slot: 'rescue_late', firstOpened: true, snapshot: { currentStreak: 7, lastStreakDate: '2026-10-20' } })).toBe(false);
  });

  it('slots and milestones', () => {
    expect(streakPushSlotAt('10:00')).toBe('broken');
    expect(streakPushSlotAt('19:30')).toBe('rescue');
    expect(streakPushSlotAt('20:00')).toBe('milestone');
    expect(streakPushSlotAt('21:15')).toBe('rescue_late');
    expect(streakPushSlotAt('19:45')).toBeNull();
    expect([3, 7, 14, 30, 50, 100, 365].every(isStreakMilestone)).toBe(true);
    expect(isStreakMilestone(21)).toBe(false);
  });
});
