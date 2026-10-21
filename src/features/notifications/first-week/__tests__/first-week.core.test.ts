import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  FIRST_WEEK_PLAN,
  allowedTones,
  firstWeekCard,
  firstWeekDayIndex,
  kellyProactiveToday,
  planFirstWeekPush,
  reminderHourFrom,
  secondWorkoutDue,
  toneOrder,
  type FirstWeekState,
} from '../first-week.core';
import { selectPushCopy, validatePushCopyDraft, PUSH_CATALOG_BY_TYPE } from '../../push-library/push-library.core';

const H = 3_600_000;
// 2026-10-21 10:00 Israel (UTC+3)
const NOW = Date.parse('2026-10-21T07:00:00Z');

const fresh: FirstWeekState = { hasWorkout: false, isMinor: false, reminderHour: null, sentDays: [] };

describe('server mirror', () => {
  it('functions/src/shared/first-week.core.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const app = readFileSync(path.join(root, 'src/features/notifications/first-week/first-week.core.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/first-week.core.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });
});

describe('the plan', () => {
  it('day 0 and day 6 are in-app only; d1–d5 and d7 push; nothing after day 7', () => {
    expect(FIRST_WEEK_PLAN.filter((d) => !d.push).map((d) => d.day)).toEqual([0, 6]);
    expect(planFirstWeekPush(0, 10, fresh)).toEqual({ skip: 'in_app_only' });
    expect(planFirstWeekPush(6, 10, fresh)).toEqual({ skip: 'in_app_only' });
    expect(planFirstWeekPush(8, 10, fresh)).toEqual({ skip: 'not_first_week' });
    expect(planFirstWeekPush(null, 10, fresh)).toEqual({ skip: 'not_first_week' });
  });

  it('every push day has copy in the push library for each of its tones', () => {
    for (const d of FIRST_WEEK_PLAN.filter((x) => x.push)) {
      for (const tone of d.tones) {
        const rows = PUSH_CATALOG_BY_TYPE.first_week.defaults.filter(
          (r) => r.conditions?.day?.includes(`d${d.day}`) && r.conditions?.tone?.includes(tone),
        );
        expect(rows.length, `d${d.day} ${tone}`).toBeGreaterThan(0);
      }
    }
  });

  it('calendar day index in Israel (signup day = 0)', () => {
    const signup = Date.parse('2026-10-20T20:30:00Z'); // 23:30 Israel on the 20th
    expect(firstWeekDayIndex(signup, NOW)).toBe(1);
    expect(firstWeekDayIndex(NOW - 2 * H, NOW)).toBe(0);
    expect(firstWeekDayIndex(NOW + H, NOW)).toBeNull();
    expect(firstWeekDayIndex(null, NOW)).toBeNull();
  });

  it('sends at the lever hour; day 1 at the reminder hour (clamped 08–21)', () => {
    expect(planFirstWeekPush(1, 18, fresh)).toMatchObject({ candidate: { dayKey: 'd1', lever: 'routine' } });
    expect(planFirstWeekPush(1, 17, fresh)).toEqual({ skip: 'not_this_hour' });
    const r = planFirstWeekPush(1, 8, { ...fresh, reminderHour: reminderHourFrom('06:30') });
    expect(r).toMatchObject({ candidate: { vars: { '@שעה': '08:00' } } });
    expect(reminderHourFrom('23:00')).toBe(21);
    expect(reminderHourFrom('nope')).toBeNull();
    expect(planFirstWeekPush(5, 20, fresh)).toMatchObject({ candidate: { lever: 'evening' } });
    expect(planFirstWeekPush(7, 10, fresh)).toMatchObject({ candidate: { lever: 'fresh_start' } });
  });

  it('stops on the first workout; unknown activity fails safe; once per day', () => {
    expect(planFirstWeekPush(2, 17, { ...fresh, hasWorkout: true })).toEqual({ skip: 'trained' });
    expect(planFirstWeekPush(2, 17, { ...fresh, hasWorkout: null })).toEqual({ skip: 'unknown_activity' });
    expect(planFirstWeekPush(2, 17, { ...fresh, sentDays: ['d2'] })).toEqual({ skip: 'already_sent' });
  });

  it('social: adults only, and only with a real park + count', () => {
    expect(planFirstWeekPush(3, 17, { ...fresh, isMinor: true, parkName: 'גן הבנים', peopleCount: 12 })).toEqual({ skip: 'minor_social' });
    expect(planFirstWeekPush(3, 17, fresh)).toEqual({ skip: 'no_social_data' });
    expect(planFirstWeekPush(3, 17, { ...fresh, parkName: 'גן הבנים', peopleCount: 12 })).toMatchObject({
      candidate: { vars: { '@מקום': 'גן הבנים', '@אנשים': '12' } },
    });
  });

  it('steps: only with a real number left', () => {
    expect(planFirstWeekPush(4, 18, fresh)).toEqual({ skip: 'no_steps_data' });
    expect(planFirstWeekPush(4, 18, { ...fresh, stepsLeft: 0 })).toEqual({ skip: 'no_steps_data' });
    expect(planFirstWeekPush(4, 18, { ...fresh, stepsLeft: 2400 })).toMatchObject({ candidate: { vars: { '@צעדים_שנותרו': '2,400' } } });
  });
});

describe('Kelly coordination (standalone by default)', () => {
  it('no Kelly message today → ours sends', () => {
    expect(kellyProactiveToday(undefined, NOW)).toBe(false);
    expect(kellyProactiveToday({ lastSentDate: '2026-10-20' }, NOW)).toBe(false);
    expect(planFirstWeekPush(2, 17, { ...fresh, kellyToday: false })).toMatchObject({ candidate: { dayKey: 'd2' } });
  });

  it('Kelly already wrote today → our slot is skipped', () => {
    expect(kellyProactiveToday({ lastSentDate: '2026-10-21' }, NOW)).toBe(true);
    expect(planFirstWeekPush(2, 17, { ...fresh, kellyToday: true })).toEqual({ skip: 'kelly_today' });
    expect(secondWorkoutDue({ workoutCount: 1, firstWorkoutMs: NOW - 30 * H, nowMs: NOW, sentForMs: null, kellyToday: true })).toBe(false);
  });
});

describe('tones', () => {
  it('the casual tone needs a known age under 60, never ותיקים or a city broadcast', () => {
    expect(allowedTones({ ageBand: '30_44' })).toContain('friendly');
    expect(allowedTones({ ageBand: 'under_18' })).toContain('friendly');
    expect(allowedTones({ ageBand: '60_plus' })).not.toContain('friendly');
    expect(allowedTones({ ageBand: null })).not.toContain('friendly');
    expect(allowedTones({ ageBand: '30_44', persona: 'vatikim' })).not.toContain('friendly');
    expect(allowedTones({ ageBand: '30_44', cityBroadcast: true })).not.toContain('friendly');
  });

  it('random order among the day tones the segment allows', () => {
    const order = toneOrder(['cute', 'personal', 'curious', 'friendly'], { ageBand: '60_plus' }, () => 0);
    expect(order.sort()).toEqual(['curious', 'cute', 'personal']);
  });

  it('library: a toned row is picked only when the sender asks for that tone; friendly is gendered and age-gated', () => {
    const ctx = { uid: 'u1', audience: { ageBand: '30_44', gender: 'female' as const }, vars: { '@שם': 'דנה' } };
    const friendly = selectPushCopy('first_week', [], { ...ctx, conditions: { day: 'd1', tone: 'friendly' } });
    expect(friendly?.title).toBe('אחותי, האימון מוכן');
    expect(friendly?.conditions?.tone).toEqual(['friendly']);
    const old = selectPushCopy('first_week', [], { ...ctx, audience: { ageBand: '60_plus', gender: 'female' }, conditions: { day: 'd1', tone: 'friendly' } });
    expect(old?.conditions?.tone ?? []).not.toContain('friendly');
    const cute = selectPushCopy('first_week', [], { ...ctx, conditions: { day: 'd2', tone: 'cute' } });
    expect(cute?.title).toBe('הורדנו את הרף. ממש נמוך');
    expect(cute?.deepLinkId).toBe('map_walk');
  });

  it('day 3 "a group is waiting" only when the sender knows a group', () => {
    const ctx = { uid: 'u1', audience: {}, vars: {} };
    const r = selectPushCopy('first_week', [], { ...ctx, conditions: { day: 'd3', tone: 'personal' } });
    expect(r?.title ?? '').not.toBe('לא חייבים לבד');
    const g = selectPushCopy('first_week', [], { ...ctx, conditions: { day: 'd3', tone: 'personal', nearby: 'group' } });
    expect(g?.title).toBe('לא חייבים לבד');
  });

  it('league_overtaken: title verb by who overtook, body by the recipient', () => {
    const r = selectPushCopy('league_overtaken', [], {
      uid: 'u1',
      audience: { ageBand: '18_29', gender: 'female' },
      subjectGender: 'male',
      vars: { '@מתחרה': 'יואב', '@דירוג': '3' },
      conditions: { tone: 'friendly' },
    });
    expect(r?.title).toBe('יואב עקף אותך. מה נסגר?');
    expect(r?.body).toBe('אימון אחד ואת חוזרת למקום 3');
    // Dual gender is allowed only where the catalog says so.
    const base = { title: 'חוזרים?', body: 'אימון קל.', deepLink: 'community', gender: 'male' as const, subjectGender: 'female' as const };
    expect(validatePushCopyDraft({ ...base, pushType: 'league_overtaken' })).toEqual([]);
  });
});

describe('second workout', () => {
  it('exactly one workout, 24–48h ago, once per workout', () => {
    const first = NOW - 30 * H;
    expect(secondWorkoutDue({ workoutCount: 1, firstWorkoutMs: first, nowMs: NOW, sentForMs: null })).toBe(true);
    expect(secondWorkoutDue({ workoutCount: 1, firstWorkoutMs: first, nowMs: NOW, sentForMs: first })).toBe(false);
    expect(secondWorkoutDue({ workoutCount: 2, firstWorkoutMs: first, nowMs: NOW, sentForMs: null })).toBe(false);
    expect(secondWorkoutDue({ workoutCount: 1, firstWorkoutMs: NOW - 10 * H, nowMs: NOW, sentForMs: null })).toBe(false);
    expect(secondWorkoutDue({ workoutCount: 1, firstWorkoutMs: NOW - 50 * H, nowMs: NOW, sentForMs: null })).toBe(false);
  });
});

describe('home cards', () => {
  it('a card for every day 0–7 until the first workout', () => {
    for (let d = 0; d <= 7; d++) expect(firstWeekCard({ dayIndex: d, hasWorkout: false })).not.toBeNull();
    expect(firstWeekCard({ dayIndex: 3, hasWorkout: true })).toBeNull();
    expect(firstWeekCard({ dayIndex: 8, hasWorkout: false })).toBeNull();
    expect(firstWeekCard({ dayIndex: 0, hasWorkout: false, firstName: 'דנה' })?.title).toBe('דנה, הכול מוכן');
  });

  it('card copy obeys the write rules (no slash, dash, emoji; length)', () => {
    for (let d = 0; d <= 7; d++) {
      const c = firstWeekCard({ dayIndex: d, hasWorkout: false })!;
      const issues = validatePushCopyDraft({ pushType: 'first_week', title: c.title, body: c.body, deepLink: 'home' });
      expect(issues, `${c.title} / ${c.body}`).toEqual([]);
    }
  });
});
