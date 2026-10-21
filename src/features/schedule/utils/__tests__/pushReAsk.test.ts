import { describe, expect, it } from 'vitest';
import {
  EARLY_SOFT_ASK_COPY,
  PUSH_SOFTASK_DEFERRED_KEY,
  pickPostWorkoutReAsk,
  PUSH_SOFT_ASK_COPY,
  parsePrefTimestamp,
  pushReAskShownKey,
  shouldShowPushReAsk,
} from '../pushReAsk';

describe('parsePrefTimestamp', () => {
  it('reads epoch ms, rejects missing / garbage', () => {
    expect(parsePrefTimestamp('1760000000000')).toBe(1760000000000);
    expect(parsePrefTimestamp(null)).toBeNull();
    expect(parsePrefTimestamp(undefined)).toBeNull();
    expect(parsePrefTimestamp('')).toBeNull();
    expect(parsePrefTimestamp('abc')).toBeNull();
    expect(parsePrefTimestamp('0')).toBeNull();
  });
});

describe('keys + copy', () => {
  it('stable device-pref keys', () => {
    expect(PUSH_SOFTASK_DEFERRED_KEY).toBe('push_softask_deferred_at');
    expect(pushReAskShownKey('first_workout')).toBe('push_reask_first_workout_at');
  });
  it('owner copy', () => {
    expect(PUSH_SOFT_ASK_COPY.accept).toBe('כן, תזכירו לי');
    expect(PUSH_SOFT_ASK_COPY.body).toBe('נזכיר לך רק לפני אימון ונשמור על הרצף');
  });
});

describe('shouldShowPushReAsk — settings', () => {
  const base = { moment: 'settings' as const, shownAt: null };
  it('OS permission still "prompt" → show', () => {
    expect(shouldShowPushReAsk({ ...base, permission: 'prompt' })).toBe(true);
  });
  it('granted but push or training reminders off → show', () => {
    expect(shouldShowPushReAsk({ ...base, permission: 'granted', pushEnabled: false })).toBe(true);
    expect(shouldShowPushReAsk({ ...base, permission: 'granted', pushEnabled: true, trainingReminder: false })).toBe(true);
  });
  it('granted and on (or defaults) → hide', () => {
    expect(shouldShowPushReAsk({ ...base, permission: 'granted', pushEnabled: true, trainingReminder: true })).toBe(false);
    expect(shouldShowPushReAsk({ ...base, permission: 'granted' })).toBe(false);
  });
  it('denied / unsupported → hide (cannot prompt)', () => {
    expect(shouldShowPushReAsk({ ...base, permission: 'denied', pushEnabled: false })).toBe(false);
    expect(shouldShowPushReAsk({ ...base, permission: 'unsupported' })).toBe(false);
  });
  it('settings is not frequency-capped (the user opened it)', () => {
    expect(shouldShowPushReAsk({ ...base, permission: 'prompt', shownAt: 123 })).toBe(true);
  });
});

describe('shouldShowPushReAsk — first_workout', () => {
  const base = { moment: 'first_workout' as const, permission: 'prompt' as const, shownAt: null };
  it('first workout, permission still "prompt", never shown → show', () => {
    expect(shouldShowPushReAsk({ ...base, workoutCount: 0 })).toBe(true);
    expect(shouldShowPushReAsk({ ...base, workoutCount: 1 })).toBe(true);
    expect(shouldShowPushReAsk({ ...base })).toBe(true);
  });
  it('at most once', () => {
    expect(shouldShowPushReAsk({ ...base, shownAt: 1760000000000, workoutCount: 0 })).toBe(false);
  });
  it('only after the first workout', () => {
    expect(shouldShowPushReAsk({ ...base, workoutCount: 2 })).toBe(false);
  });
  it('never when the OS already answered or cannot prompt', () => {
    for (const permission of ['granted', 'denied', 'unsupported'] as const) {
      expect(shouldShowPushReAsk({ ...base, permission, workoutCount: 0 })).toBe(false);
    }
  });
});

describe('shouldShowPushReAsk — signup_start (early ask after the track pick)', () => {
  const base = { moment: 'signup_start' as const, permission: 'prompt' as const, shownAt: null };
  it('OS can still prompt, never answered here → show', () => {
    expect(shouldShowPushReAsk(base)).toBe(true);
  });
  it('skipped when already granted / denied / unsupported', () => {
    for (const permission of ['granted', 'denied', 'unsupported'] as const) {
      expect(shouldShowPushReAsk({ ...base, permission })).toBe(false);
    }
  });
  it('skipped on iOS Safari outside a PWA, and once answered', () => {
    expect(shouldShowPushReAsk({ ...base, iosWebBlocked: true })).toBe(false);
    expect(shouldShowPushReAsk({ ...base, shownAt: 1 })).toBe(false);
  });
  it('owner copy', () => {
    expect(EARLY_SOFT_ASK_COPY.body).toBe('נזכיר לך להמשיך מאיפה שעצרת ונשמור לך את הרצף. עד 2 ביום');
  });
});

describe('shouldShowPushReAsk — streak_3', () => {
  const base = { moment: 'streak_3' as const, permission: 'prompt' as const, shownAt: null };
  it('3+ day streak, permission still "prompt", never shown → show', () => {
    expect(shouldShowPushReAsk({ ...base, streakDays: 3 })).toBe(true);
    expect(shouldShowPushReAsk({ ...base, streakDays: 5 })).toBe(true);
  });
  it('below 3 / already shown / OS answered → hide', () => {
    expect(shouldShowPushReAsk({ ...base, streakDays: 2 })).toBe(false);
    expect(shouldShowPushReAsk({ ...base })).toBe(false);
    expect(shouldShowPushReAsk({ ...base, streakDays: 3, shownAt: 9 })).toBe(false);
    expect(shouldShowPushReAsk({ ...base, streakDays: 3, permission: 'granted' })).toBe(false);
  });
});

describe('pickPostWorkoutReAsk', () => {
  const base = { permission: 'prompt' as const, firstWorkoutShownAt: null, streakShownAt: null };
  it('first workout wins; never two on one summary', () => {
    expect(pickPostWorkoutReAsk({ ...base, workoutCount: 0, streakDays: 3 })).toBe('first_workout');
  });
  it('streak ask once the first-workout moment is used or past', () => {
    expect(pickPostWorkoutReAsk({ ...base, firstWorkoutShownAt: 1, workoutCount: 1, streakDays: 3 })).toBe('streak_3');
    expect(pickPostWorkoutReAsk({ ...base, workoutCount: 4, streakDays: 3 })).toBe('streak_3');
  });
  it('nothing when both used, streak short, or OS answered', () => {
    expect(pickPostWorkoutReAsk({ ...base, firstWorkoutShownAt: 1, streakShownAt: 2, workoutCount: 4, streakDays: 3 })).toBeNull();
    expect(pickPostWorkoutReAsk({ ...base, workoutCount: 4, streakDays: 2 })).toBeNull();
    expect(pickPostWorkoutReAsk({ ...base, permission: 'denied', workoutCount: 0, streakDays: 3 })).toBeNull();
  });
});
