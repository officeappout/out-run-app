/**
 * Kelly round 4 — "program run" card tap: today's run of the user's plan, by slot type under
 * enable_home_v2 (resolveRunningDayState with runPlacementOf — the run home shows today),
 * the k-th run on the k-th day otherwise (unchanged).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayProgramRunHref } from '../services/round4-actions';
import { mapRunWeekFromLetters, runPlacementOf } from '@/features/schedule/utils/runWeekByType';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const SUNDAY = new Date(2026, 9, 11, 12, 0, 0); // Sunday 11.10.2026, local noon

const schedule = [1, 2].flatMap((week) => [
  { week, day: 1, category: 'short_intervals', slotType: 'quality_primary', isQualityWorkout: true, workoutId: `q1_w${week}`, status: 'pending' },
  { week, day: 2, category: 'long_run', slotType: 'long_run', isQualityWorkout: false, workoutId: `long_w${week}`, status: 'pending' },
  { week, day: 3, category: 'tempo', slotType: 'quality_secondary', isQualityWorkout: true, workoutId: `q2_w${week}`, status: 'pending' },
]);
const running = {
  isUnlocked: true,
  scheduleDays: ['א', 'ג', 'ה'],
  longRunDay: 0,
  activeProgram: { startDate: new Date(2026, 9, 11, 0, 0, 0), currentWeek: 1, schedule },
};
const profile = { running } as unknown as UserFullProfile;

const idOf = (href: string | null) => (href ? new URLSearchParams(href.split('?')[1]).get('workoutId') : null);

describe('todayProgramRunHref — runsByType', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SUNDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('on: Sunday is the long run (running.longRunDay) — the same entry home shows today', async () => {
    const home = mapRunWeekFromLetters(schedule.filter((e) => e.week === 1), running.scheduleDays, { byType: true, ...runPlacementOf(running) });
    expect(home.get(0)?.workoutId).toBe('long_w1');
    expect(idOf(await todayProgramRunHref(profile, { runsByType: true }))).toBe('long_w1');
  });

  it('off: unchanged — the 1st run of the week on the 1st run day', async () => {
    expect(idOf(await todayProgramRunHref(profile))).toBe('q1_w1');
    expect(idOf(await todayProgramRunHref(profile, { runsByType: false }))).toBe('q1_w1');
  });
});
