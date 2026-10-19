/**
 * Kelly phase 3 — each trigger's pure eligibility, the shared gate (caps, quiet hours,
 * Shabbat, calm return, opt-out), priority, the run slots. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { state } from './fixtures';
import { sharedGate, dailyCapFor, dailyCountFor, isOptedOut, isQuietHour } from '../policy';
import { morningTrigger, morningHourFor, startPassed } from '../triggers/morning';
import { weatherTrigger } from '../triggers/weather';
import { weeklyTrigger } from '../triggers/weekly';
import { assessmentTrigger } from '../triggers/assessment';
import { postWorkoutTrigger } from '../triggers/post-workout';
import { explainAll, selectProactive } from '../select';
import { dueTriggers } from '../slots';
import type { ProactiveUserState } from '../types';

const at = (s: ProactiveUserState, hour: number, minute = 0, dow = s.clock.dow): ProactiveUserState => ({ ...s, clock: { ...s.clock, hour, minute, dow } });
const send = (d: { shouldSend: boolean }) => d.shouldSend;
const reason = (d: { shouldSend: boolean; reason?: string }) => (d as { reason?: string }).reason;

describe('shared gate', () => {
  it('passes a normal active user', () => {
    expect(sharedGate(state(), 'morning')).toBeNull();
  });
  it.each([
    ['no_ai', { hasAi: false }],
    ['opted_out', { optedOut: true }],
    ['push_disabled', { pushEnabled: false }],
    ['already_today', { sentToday: true }],
    ['retention_today', { retentionSentToday: true }],
    ['daily_cap', { dailyCountToday: 3, dailyCap: 3 }],
    ['calm_return', { daysAway: 4 }],
  ] as const)('%s', (r, over) => {
    expect(sharedGate(state(over as Partial<ProactiveUserState>), 'morning')).toBe(r);
  });
  it('quiet hours 22:00-07:00', () => {
    expect(sharedGate(at(state(), 22), 'post_workout')).toBe('quiet_hours');
    expect(sharedGate(at(state(), 6, 59), 'post_workout')).toBe('quiet_hours');
    expect(sharedGate(at(state(), 7), 'post_workout')).toBeNull();
    expect(isQuietHour(21)).toBe(false);
  });
  it('Shabbat blocks observers only', () => {
    expect(sharedGate(state({ inRestWindow: true, shabbatObserver: true }), 'weekly')).toBe('shabbat');
    expect(sharedGate(state({ inRestWindow: true, shabbatObserver: false }), 'weekly')).toBeNull();
  });
  it('calm return: lapsed users get nothing proactive, except "how was it" right after a workout', () => {
    for (const t of ['morning', 'weather', 'weekly', 'assessment'] as const) expect(sharedGate(state({ daysAway: 10 }), t)).toBe('calm_return');
    expect(sharedGate(state({ daysAway: 10 }), 'post_workout')).toBeNull();
    expect(sharedGate(state({ daysAway: null }), 'morning')).toBeNull(); // unknown ≠ lapsed
    expect(sharedGate(state({ daysAway: 3 }), 'morning')).toBeNull();
  });
  it('daily cap mapping matches push.service (min 1, balanced 3, high 6, default balanced)', () => {
    expect(dailyCapFor('min')).toBe(1);
    expect(dailyCapFor('balanced')).toBe(3);
    expect(dailyCapFor('high')).toBe(6);
    expect(dailyCapFor(undefined)).toBe(3);
    expect(dailyCapFor('weird')).toBe(3);
    expect(dailyCountFor({ dailyEngagementDate: '2026-10-20', dailyEngagementCount: 2 }, '2026-10-20')).toBe(2);
    expect(dailyCountFor({ dailyEngagementDate: '2026-10-19', dailyEngagementCount: 5 }, '2026-10-20')).toBe(0);
  });
  it('opt-out: the proactive toggle or the whole coach channel; absent = on', () => {
    expect(isOptedOut(undefined)).toBe(false);
    expect(isOptedOut({ notificationPrefs: {} })).toBe(false);
    expect(isOptedOut({ notificationPrefs: { coach_proactive: false } })).toBe(true);
    expect(isOptedOut({ notificationPrefs: { coach: false } })).toBe(true);
  });
});

describe('a. morning', () => {
  it('sends at the morning hour with today\'s session and the build chip template', () => {
    const d = morningTrigger(state());
    expect(d).toMatchObject({ shouldSend: true, templateKey: 'morning', vars: { label: 'אימון כוח', minutes: 30, time: '18:00', silent: null } });
  });
  it('morning hour: preferred 07-11, else 08', () => {
    expect(morningHourFor(null)).toBe(8);
    expect(morningHourFor(7)).toBe(7);
    expect(morningHourFor(11)).toBe(11);
    expect(morningHourFor(18)).toBe(8);
    expect(morningHourFor(5)).toBe(8);
    expect(send(morningTrigger(at(state({ preferredHour: 9 }), 8)))).toBe(false);
    expect(send(morningTrigger(at(state({ preferredHour: 9 }), 9)))).toBe(true);
  });
  it('skips: no training, done, not the hour, session already started', () => {
    expect(reason(morningTrigger(state({ today: { ...state().today, training: false } })))).toBe('no_training_today');
    expect(reason(morningTrigger(state({ today: { ...state().today, done: true } })))).toBe('done_today');
    expect(reason(morningTrigger(at(state(), 10)))).toBe('not_morning_hour');
    expect(reason(morningTrigger(state({ today: { ...state().today, startTime: '07:30' } })))).toBe('session_started');
    expect(startPassed('08:00', 8, 0)).toBe(true);
    expect(startPassed(null, 8, 0)).toBe(false);
  });
  it('a run or walk opens the schedule instead of building', () => {
    const d = morningTrigger(state({ today: { ...state().today, kind: 'cardio', label: 'ריצה', buildable: false } }));
    expect(d).toMatchObject({ shouldSend: true, templateKey: 'morning_open' });
  });
  it('after the training reminder: silent (no second push about the same session)', () => {
    expect(morningTrigger(state({ trainingReminderToday: true }))).toMatchObject({ shouldSend: true, vars: { silent: 1 } });
  });
  it('admin preview ignores the hour', () => {
    expect(send(morningTrigger(at(state(), 15), { ignoreSlotTime: true }))).toBe(true);
  });
});

describe('d. weather', () => {
  it('rain on any training day → move it home', () => {
    expect(weatherTrigger(state({ weather: 'rain' }))).toMatchObject({ shouldSend: true, templateKey: 'weather_rain' });
  });
  it('heat or uv only on a run / walk day', () => {
    const run = { ...state().today, kind: 'cardio', label: 'ריצה', buildable: false };
    expect(weatherTrigger(state({ weather: 'heat', today: run }))).toMatchObject({ shouldSend: true, templateKey: 'weather_heat' });
    expect(weatherTrigger(state({ weather: 'uv', today: run }))).toMatchObject({ shouldSend: true, templateKey: 'weather_heat' });
    expect(send(weatherTrigger(state({ weather: 'heat' })))).toBe(false); // strength day
  });
  it('no weather data → nothing', () => {
    expect(reason(weatherTrigger(state({ weather: null })))).toBe('no_weather_signal');
  });
  it('wins over the plain morning line (one message a day)', () => {
    expect(selectProactive(state({ weather: 'rain' }))?.trigger).toBe('weather');
    expect(selectProactive(state())?.trigger).toBe('morning');
  });
});

describe('b. weekly', () => {
  const friday = (over: Partial<ProactiveUserState> = {}) =>
    state({ clock: { dateKey: '2026-10-23', hour: 10, minute: 0, dow: 5, ms: Date.parse('2026-10-23T07:00:00Z') }, week: { workouts: 3, activeDays: 3, minutes: 90, streakDays: 4, avgSteps: 6500 }, ...over });
  it('Friday 10:00 with at least one workout', () => {
    expect(weeklyTrigger(friday())).toMatchObject({ shouldSend: true, templateKey: 'weekly', vars: { workouts: 3, streak: 4 } });
  });
  it('not on other days / hours, not twice, not for an empty week', () => {
    expect(reason(weeklyTrigger(at(friday(), 11)))).toBe('not_friday_10');
    expect(reason(weeklyTrigger(friday({ ledger: { ...friday().ledger, weeklySentFor: '2026-10-23' } })))).toBe('already_this_week');
    expect(reason(weeklyTrigger(friday({ week: { workouts: 0, activeDays: 0, minutes: 0, streakDays: null, avgSteps: null } })))).toBe('empty_week');
  });
  it('Friday 10:00 is before the Shabbat window, so observers get it', () => {
    expect(selectProactive(friday({ shabbatObserver: true, inRestWindow: false, today: { ...state().today, training: false } }))?.trigger).toBe('weekly');
  });
});

describe('c. assessment', () => {
  const noon = (over: Partial<ProactiveUserState> = {}) => at(state({ gaps: [{ slug: 'core', name: 'ליבה' }, { slug: 'pull', name: 'משיכה' }], ...over }), 12);
  it('nudges the first gap at 12:00 Sunday-Thursday', () => {
    expect(assessmentTrigger(noon())).toMatchObject({ shouldSend: true, vars: { slug: 'core', name: 'ליבה' } });
    expect(reason(assessmentTrigger(at(noon(), 12, 0, 5)))).toBe('not_midday_weekday');
  });
  it('once per gap per 14 days, and at most one nudge a week overall', () => {
    const now = noon().clock.ms;
    const day = 86_400_000;
    expect(assessmentTrigger(noon({ ledger: { ...state().ledger, assessmentNudges: { core: now - 8 * day }, lastAssessmentAt: now - 8 * day } }))).toMatchObject({ shouldSend: true, vars: { slug: 'pull' } });
    expect(reason(assessmentTrigger(noon({ ledger: { ...state().ledger, lastAssessmentAt: now - 2 * day } })))).toBe('nudged_this_week');
    expect(reason(assessmentTrigger(noon({ ledger: { ...state().ledger, assessmentNudges: { core: now - 8 * day, pull: now - 9 * day }, lastAssessmentAt: now - 8 * day } })))).toBe('all_gaps_cooling_down');
    expect(assessmentTrigger(noon({ ledger: { ...state().ledger, assessmentNudges: { core: now - 15 * day, pull: now - 9 * day }, lastAssessmentAt: now - 9 * day } }))).toMatchObject({ shouldSend: true, vars: { slug: 'core' } });
  });
  it('no gaps → nothing', () => {
    expect(reason(assessmentTrigger(at(state(), 12)))).toBe('no_gaps');
  });
});

describe('e. post-workout', () => {
  const ms = state().clock.ms;
  const w = (agoMin: number, minutes = 30, id = 'w1') => ({ id, endedAtMs: ms - agoMin * 60_000, minutes });
  it('30-75 minutes after a workout of 10+ minutes, once per workout', () => {
    expect(postWorkoutTrigger(state({ recentWorkout: w(45) }))).toMatchObject({ shouldSend: true, templateKey: 'post_workout', vars: { workoutId: 'w1' } });
    expect(reason(postWorkoutTrigger(state({ recentWorkout: w(20) })))).toBe('outside_window');
    expect(reason(postWorkoutTrigger(state({ recentWorkout: w(80) })))).toBe('outside_window');
    expect(reason(postWorkoutTrigger(state({ recentWorkout: w(45, 6) })))).toBe('too_short');
    expect(reason(postWorkoutTrigger(state({ recentWorkout: w(45), ledger: { ...state().ledger, askedWorkoutIds: ['w1'] } })))).toBe('already_asked');
  });
  it('has the highest priority', () => {
    expect(selectProactive(state({ recentWorkout: w(45), weather: 'rain' }))?.trigger).toBe('post_workout');
  });
  it('still asked after a break (they just trained), but never past the daily cap', () => {
    expect(selectProactive(state({ recentWorkout: w(45), daysAway: 12 }))?.trigger).toBe('post_workout');
    expect(selectProactive(state({ recentWorkout: w(45), dailyCountToday: 3 }))).toBeNull();
  });
});

describe('select + slots', () => {
  it('max one: the first eligible trigger in priority order, null when every gate refuses', () => {
    expect(selectProactive(state({ sentToday: true }))).toBeNull();
    const all = explainAll(state({ sentToday: true }));
    expect(all.find((v) => v.trigger === 'morning')?.gate).toBe('already_today');
  });
  it('`only` restricts to the triggers due for this user', () => {
    expect(selectProactive(state({ weather: 'rain' }), { only: ['morning'] })?.trigger).toBe('morning');
    expect(selectProactive(state(), { only: ['post_workout'] })).toBeNull();
  });
  it('dueTriggers: post-workout every run; hour triggers on the first run of their hour; nothing in quiet hours', () => {
    expect(dueTriggers({ hour: 8, minute: 0, dow: 2 })).toEqual(['post_workout', 'weather', 'morning']);
    expect(dueTriggers({ hour: 8, minute: 15, dow: 2 })).toEqual(['post_workout']);
    expect(dueTriggers({ hour: 10, minute: 5, dow: 5 })).toEqual(['post_workout', 'weather', 'morning', 'weekly']);
    expect(dueTriggers({ hour: 12, minute: 0, dow: 3 })).toEqual(['post_workout', 'assessment']);
    expect(dueTriggers({ hour: 12, minute: 0, dow: 5 })).toEqual(['post_workout']);
    expect(dueTriggers({ hour: 23, minute: 0, dow: 2 })).toEqual([]);
    expect(dueTriggers({ hour: 6, minute: 0, dow: 2 })).toEqual([]);
  });
});
