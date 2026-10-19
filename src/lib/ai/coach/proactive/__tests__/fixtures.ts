import { EMPTY_LEDGER, type ProactiveUserState } from '../types';

/** 2026-10-20 is a Tuesday (dow 2). Synthetic data only. */
export function state(over: Partial<ProactiveUserState> = {}): ProactiveUserState {
  return {
    uid: 'u1',
    gender: 'male',
    firstName: 'דני',
    clock: { dateKey: '2026-10-20', hour: 8, minute: 0, dow: 2, ms: Date.parse('2026-10-20T05:00:00Z') },
    hasAi: true,
    pushEnabled: true,
    optedOut: false,
    shabbatObserver: false,
    inRestWindow: false,
    dailyCap: 3,
    dailyCountToday: 0,
    retentionSentToday: false,
    trainingReminderToday: false,
    daysAway: 1,
    sentToday: false,
    preferredHour: null,
    today: { training: true, done: false, kind: 'strength', label: 'אימון כוח', startTime: '18:00', minutes: 30, buildable: true },
    weather: null,
    week: null,
    gaps: [],
    recentWorkout: null,
    ledger: { ...EMPTY_LEDGER, assessmentNudges: {}, askedWorkoutIds: [] },
    ...over,
  };
}
