/** Running-plan catch-up rules (enable_week_builder_v1, owner 22.10). */
import { describe, expect, it } from 'vitest';
import {
  canResumeWhereStopped,
  catchUpDue,
  catchUpLineHe,
  catchUpWhyHe,
  isBeginnerRunPlan,
  resolveRunCatchUp,
  RUN_CATCH_UP,
  type CatchUpReason,
} from '../run-catch-up';
import type { FreshWeekScheduleEntry } from '../running';

/** `done[w]` runs completed of 3 in each week 1..n. */
function plan(done: number[], weeks = 8): FreshWeekScheduleEntry[] {
  const out: FreshWeekScheduleEntry[] = [];
  for (let w = 1; w <= weeks; w++)
    for (let d = 1; d <= 3; d++) out.push({ week: w, day: d, status: d <= (done[w - 1] ?? 0) ? 'completed' : 'pending' });
  return out;
}

describe('resolveRunCatchUp — no long gap (the week that just ended)', () => {
  it('one run missed → the plan advances (just re-arrange)', () => {
    const d = resolveRunCatchUp({ schedule: plan([3, 2]), planWeek: 3, daysAway: 1, beginner: false });
    expect(d).toMatchObject({ reason: 'advance', targetWeek: 3, ask: false });
  });

  it('< 50% done → that plan week repeats', () => {
    const d = resolveRunCatchUp({ schedule: plan([3, 1]), planWeek: 3, daysAway: 3, beginner: false });
    expect(d).toMatchObject({ reason: 'repeat_week', targetWeek: 2 });
  });

  it('a full plan week with no runs → repeat the last completed week', () => {
    const d = resolveRunCatchUp({ schedule: plan([3, 3, 0]), planWeek: 4, daysAway: 9, beginner: false });
    expect(d).toMatchObject({ reason: 'repeat_last_completed', targetWeek: 2 });
  });

  it('week 1 has nothing to judge', () => {
    expect(resolveRunCatchUp({ schedule: plan([]), planWeek: 1, daysAway: 0, beginner: true }).reason).toBe('advance');
  });
});

describe('resolveRunCatchUp — gaps', () => {
  const reached5 = plan([3, 3, 3, 3, 1]);

  it('2–3 weeks → back 1 week; beginner plans back 2; no question', () => {
    expect(resolveRunCatchUp({ schedule: reached5, planWeek: 7, daysAway: 15, beginner: false })).toMatchObject({ reason: 'step_back', targetWeek: 4, ask: false });
    expect(resolveRunCatchUp({ schedule: reached5, planWeek: 7, daysAway: 25, beginner: true })).toMatchObject({ reason: 'step_back', targetWeek: 3 });
  });

  it('4+ weeks → beginner restarts at week 1; others go back to about half + level check; both ask first', () => {
    expect(resolveRunCatchUp({ schedule: reached5, planWeek: 9, daysAway: 30, beginner: true })).toMatchObject({ reason: 'restart', targetWeek: 1, ask: true, offerLevelCheck: false });
    expect(resolveRunCatchUp({ schedule: reached5, planWeek: 9, daysAway: 40, beginner: false })).toMatchObject({ reason: 'half_back', targetWeek: 3, ask: true, offerLevelCheck: true });
  });

  it('never below week 1', () => {
    expect(resolveRunCatchUp({ schedule: plan([1]), planWeek: 4, daysAway: 20, beginner: true }).targetWeek).toBe(1);
  });

  it('"להמשיך מאיפה שעצרתי" only inside safe limits', () => {
    expect(canResumeWhereStopped({ reachedWeek: 5 }, 30)).toBe(false);
    expect(canResumeWhereStopped({ reachedWeek: RUN_CATCH_UP.resumeSafeMaxWeek }, 30)).toBe(true);
    expect(canResumeWhereStopped({ reachedWeek: 5 }, 5)).toBe(true);
  });
});

describe('catchUpDue', () => {
  it('judges a plan week once, and a gap once', () => {
    expect(catchUpDue({ marker: undefined, planWeekStartKey: '2026-10-18', todayKey: '2026-10-22', daysAway: 3 })).toBe(true);
    expect(catchUpDue({ marker: { appliedOn: '2026-10-18' }, planWeekStartKey: '2026-10-18', todayKey: '2026-10-22', daysAway: 3 })).toBe(false);
    // Applied 7 days ago, no workout since (away 20 days): the same break — not again.
    expect(catchUpDue({ marker: { appliedOn: '2026-10-15' }, planWeekStartKey: '2026-10-18', todayKey: '2026-10-22', daysAway: 20 })).toBe(false);
    // Trained since the last catch-up: a new week is judged.
    expect(catchUpDue({ marker: { appliedOn: '2026-10-11' }, planWeekStartKey: '2026-10-18', todayKey: '2026-10-22', daysAway: 2 })).toBe(true);
  });
});

describe('copy', () => {
  const reasons: CatchUpReason[] = ['repeat_week', 'repeat_last_completed', 'step_back', 'restart', 'half_back'];
  it('is calm: no missed / failed wording, a line for every change, none for advance', () => {
    expect(catchUpLineHe({ reason: 'advance', targetWeek: 3 })).toBeNull();
    expect(catchUpLineHe({ reason: 'restart', targetWeek: 1 })).toBe('מתחילים מחדש מהשבוע הראשון, בקצב שמתאים לך');
    expect(catchUpLineHe({ reason: 'step_back', targetWeek: 3 })).toBe('ממשיכים מהשבוע ה-3, בקצב שמתאים לך');
    for (const r of reasons) {
      const all = `${catchUpLineHe({ reason: r, targetWeek: 2 })} ${catchUpWhyHe({ reason: r }, true)}`;
      expect(all).not.toMatch(/פספס|פוספס|נכשל/);
    }
  });

  it('beginner plans: couch_to_5k / profile 3 / beginner level', () => {
    expect(isBeginnerRunPlan({ currentGoal: 'couch_to_5k' })).toBe(true);
    expect(isBeginnerRunPlan({ paceProfile: { profileType: 3 } })).toBe(true);
    expect(isBeginnerRunPlan({}, 'beginner')).toBe(true);
    expect(isBeginnerRunPlan({ paceProfile: { profileType: 1 } }, 'advanced')).toBe(false);
  });
});
