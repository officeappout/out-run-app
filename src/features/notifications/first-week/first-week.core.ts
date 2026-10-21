/**
 * First-week sequence — the pure planner (owner-approved 21.10.2026).
 *
 * Mirrored into functions/src/shared/first-week.core.ts by
 * functions/scripts/vendor-copy-geo-discovery.js (COMMITTED_MIRRORS), so the
 * home card (app) and firstWorkoutScheduler (server) share one plan. Must
 * stay import-free.
 *
 *   day 0  welcome         in-app card only (Kelly's welcome lives in Kelly's own chat)
 *   day 1  routine         push at the user's reminder hour (else 18:00)
 *   day 2  low_bar         push 17:00 — a 10-minute walk
 *   day 3  social          push 17:00 — only with a real park + count, adults only
 *   day 4  steps           push 18:00 — only with a real steps-left number
 *   day 5  evening         push 20:00
 *   day 6  in_app          in-app card only
 *   day 7  fresh_start     push 10:00, then quiet
 *
 * The sequence STOPS on the first workout; a "second workout" push follows
 * 24–48 hours after it. At most one push a day (the sent log is per day).
 * Tones: random among the tones the user's segment allows and the day has
 * copy for; the casual Israeli tone ('friendly') never goes to 60+, ותיקים,
 * an unknown age, or a city broadcast.
 */

export type FirstWeekLever =
  | 'welcome'
  | 'routine'
  | 'low_bar'
  | 'social'
  | 'steps'
  | 'evening'
  | 'in_app'
  | 'fresh_start';

export type PushTone = 'cute' | 'personal' | 'curious' | 'friendly';

export const PUSH_TONES: ReadonlyArray<{ id: PushTone; label: string }> = [
  { id: 'cute', label: 'חמוד ומצחיק' },
  { id: 'personal', label: 'אישי ורגשי' },
  { id: 'curious', label: 'מסקרן' },
  { id: 'friendly', label: 'ישראלי-חברי (ביחיד, לפי מגדר)' },
];

export interface FirstWeekDay {
  day: number;
  lever: FirstWeekLever;
  /** false = in-app card only. */
  push: boolean;
  /** Israel hour the push goes out (day 1 uses the user's reminder hour when set). */
  hour: number;
  /** Tones the push library has copy for on this day. */
  tones: ReadonlyArray<PushTone>;
}

export const FIRST_WEEK_PLAN: ReadonlyArray<FirstWeekDay> = [
  { day: 0, lever: 'welcome', push: false, hour: 0, tones: [] },
  { day: 1, lever: 'routine', push: true, hour: 18, tones: ['cute', 'personal', 'curious', 'friendly'] },
  { day: 2, lever: 'low_bar', push: true, hour: 17, tones: ['cute', 'personal', 'curious', 'friendly'] },
  { day: 3, lever: 'social', push: true, hour: 17, tones: ['cute', 'personal', 'curious', 'friendly'] },
  { day: 4, lever: 'steps', push: true, hour: 18, tones: ['cute', 'curious'] },
  { day: 5, lever: 'evening', push: true, hour: 20, tones: ['personal', 'cute', 'friendly'] },
  { day: 6, lever: 'in_app', push: false, hour: 0, tones: [] },
  { day: 7, lever: 'fresh_start', push: true, hour: 10, tones: ['personal', 'curious'] },
];

export const SECOND_WORKOUT_TONES: ReadonlyArray<PushTone> = ['personal', 'cute'];

/** Day-1 reminder hour is clamped into the proactive window (08:00–21:00). */
const MIN_HOUR = 8;
const MAX_HOUR = 21;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** 'YYYY-MM-DD' in Israel. */
function israelDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

/**
 * Calendar day index in Israel since signup (signup day = 0), or null when
 * unknown / in the future.
 */
export function firstWeekDayIndex(signupMs: number | null | undefined, nowMs: number): number | null {
  if (typeof signupMs !== 'number' || !Number.isFinite(signupMs) || signupMs > nowMs) return null;
  const a = Date.parse(`${israelDateKey(signupMs)}T00:00:00Z`);
  const b = Date.parse(`${israelDateKey(nowMs)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function firstWeekDay(dayIndex: number | null): FirstWeekDay | null {
  if (dayIndex === null) return null;
  return FIRST_WEEK_PLAN.find((d) => d.day === dayIndex) ?? null;
}

/** 'HH:MM' → hour clamped to the proactive window, or null. */
export function reminderHourFrom(runningTime: unknown): number | null {
  if (typeof runningTime !== 'string') return null;
  const m = runningTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return Math.min(MAX_HOUR, Math.max(MIN_HOUR, h));
}

// ─── Segment → tones ──────────────────────────────────────────────────────────

export interface ToneSegment {
  /** push-library age band ('under_18' … '60_plus'), null = unknown. */
  ageBand?: string | null;
  /** canonical persona ('vatikim' = ותיקים). */
  persona?: string | null;
  /** A city / authority broadcast — never the casual tone. */
  cityBroadcast?: boolean;
}

/** Tones a segment may receive. The casual tone needs a KNOWN age under 60. */
export function allowedTones(segment: ToneSegment): PushTone[] {
  const casualOk =
    !segment.cityBroadcast &&
    segment.persona !== 'vatikim' &&
    !!segment.ageBand &&
    segment.ageBand !== '60_plus';
  return casualOk ? ['cute', 'personal', 'curious', 'friendly'] : ['cute', 'personal', 'curious'];
}

/** Random order of `tones` (rand() in [0,1), injectable for tests). */
export function shuffleTones(tones: ReadonlyArray<PushTone>, rand: () => number = Math.random): PushTone[] {
  const out = [...tones];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Candidate tones for a push: the day's tones ∩ the segment's, in random order. */
export function toneOrder(
  dayTones: ReadonlyArray<PushTone>,
  segment: ToneSegment,
  rand: () => number = Math.random,
): PushTone[] {
  const allowed = new Set(allowedTones(segment));
  return shuffleTones(dayTones.filter((t) => allowed.has(t)), rand);
}

// ─── The planner ──────────────────────────────────────────────────────────────

export interface FirstWeekState {
  /** Any workout ever (null = unknown → fail safe, no push). */
  hasWorkout: boolean | null;
  /** Under 18, or age unknown (the social lever needs a confirmed adult). */
  isMinor: boolean;
  /** lifestyle.reminders.runningTime → hour, or null. */
  reminderHour: number | null;
  /** Day keys ('d1'…'d7') already sent. */
  sentDays: ReadonlyArray<string>;
  /** Social lever values, when the server really knows them. */
  parkName?: string | null;
  peopleCount?: number | null;
  /** Steps left to today's goal (null = unknown). */
  stepsLeft?: number | null;
  /** A Kelly proactive message was already written for this user today. */
  kellyToday?: boolean;
}

export type FirstWeekSkip =
  | 'not_first_week'
  | 'in_app_only'
  | 'not_this_hour'
  | 'already_sent'
  | 'trained'
  | 'unknown_activity'
  | 'minor_social'
  | 'no_social_data'
  | 'no_steps_data'
  | 'kelly_today';

export interface FirstWeekCandidate {
  pushType: 'first_week';
  /** 'd1' … 'd7' — the push library condition `day`. */
  dayKey: string;
  lever: FirstWeekLever;
  /** Extra variables the sender fills (beyond @שם). */
  vars: Record<string, string>;
}

/** The hour the day's push goes out for this user. */
export function firstWeekSendHour(day: FirstWeekDay, reminderHour: number | null): number {
  return day.lever === 'routine' && reminderHour !== null ? reminderHour : day.hour;
}

/**
 * Day index × state × lever → the push to send now, or why not. Pure.
 */
export function planFirstWeekPush(
  dayIndex: number | null,
  hourNow: number,
  state: FirstWeekState,
): { candidate: FirstWeekCandidate } | { skip: FirstWeekSkip } {
  const day = firstWeekDay(dayIndex);
  if (!day) return { skip: 'not_first_week' };
  if (!day.push) return { skip: 'in_app_only' };
  if (firstWeekSendHour(day, state.reminderHour) !== hourNow) return { skip: 'not_this_hour' };
  const dayKey = `d${day.day}`;
  if (state.sentDays.includes(dayKey)) return { skip: 'already_sent' };
  if (state.hasWorkout === null) return { skip: 'unknown_activity' };
  if (state.hasWorkout) return { skip: 'trained' };
  if (state.kellyToday) return { skip: 'kelly_today' };

  const vars: Record<string, string> = {};
  if (day.lever === 'social') {
    if (state.isMinor) return { skip: 'minor_social' };
    const count = state.peopleCount ?? 0;
    if (!state.parkName || count < 2) return { skip: 'no_social_data' };
    vars['@מקום'] = state.parkName;
    vars['@אנשים'] = String(count);
  }
  if (day.lever === 'steps') {
    const left = state.stepsLeft;
    if (typeof left !== 'number' || !Number.isFinite(left) || left <= 0) return { skip: 'no_steps_data' };
    vars['@צעדים_שנותרו'] = left.toLocaleString('en-US');
  }
  if (day.lever === 'routine' && state.reminderHour !== null) {
    vars['@שעה'] = `${String(state.reminderHour).padStart(2, '0')}:00`;
  }
  return { candidate: { pushType: 'first_week', dayKey, lever: day.lever, vars } };
}

// ─── Second workout ───────────────────────────────────────────────────────────

/**
 * The "second workout" push is due when the user has exactly ONE workout,
 * done 24–48 hours ago, and it wasn't sent for that workout yet.
 */
export function secondWorkoutDue(input: {
  workoutCount: number;
  firstWorkoutMs: number | null;
  nowMs: number;
  sentForMs: number | null;
  kellyToday?: boolean;
}): boolean {
  const { workoutCount, firstWorkoutMs, nowMs, sentForMs, kellyToday } = input;
  if (workoutCount !== 1 || firstWorkoutMs === null || !Number.isFinite(firstWorkoutMs)) return false;
  if (sentForMs === firstWorkoutMs) return false;
  if (kellyToday) return false;
  const h = (nowMs - firstWorkoutMs) / HOUR_MS;
  return h >= 24 && h < 48;
}

// ─── Kelly coordination (read-only) ───────────────────────────────────────────

/**
 * Whether Kelly already wrote a proactive message for this user today:
 * ai_coach_proactive/{uid}.lastSentDate is today's Israel date. Absent /
 * unreadable → false, so OUR push sends (Kelly is not available to everyone).
 */
export function kellyProactiveToday(ledger: Record<string, unknown> | undefined | null, nowMs: number): boolean {
  const d = ledger?.lastSentDate;
  return typeof d === 'string' && d === israelDateKey(nowMs);
}

// ─── In-app home cards (days 0–7) ─────────────────────────────────────────────

export type CardGender = 'male' | 'female' | 'other' | null | undefined;

export interface FirstWeekCard {
  day: number;
  lever: FirstWeekLever;
  title: string;
  body: string;
  /** In-app route for the card's button; null = the workout card right below is the action. */
  href: string | null;
  ctaLabel: string | null;
}

/**
 * The home card for day 0–7 while the user hasn't trained yet (null after the
 * first workout or outside the first week). Neutral grammar (plural / impersonal),
 * from the owner-approved push copy.
 */
export function firstWeekCard(input: { dayIndex: number | null; hasWorkout: boolean; firstName?: string | null }): FirstWeekCard | null {
  const { dayIndex, hasWorkout } = input;
  if (hasWorkout) return null;
  const day = firstWeekDay(dayIndex);
  if (!day) return null;
  const name = (input.firstName ?? '').trim();
  switch (day.lever) {
    case 'welcome':
      return {
        day: day.day,
        lever: day.lever,
        title: name ? `${name}, הכול מוכן` : 'הכול מוכן',
        body: 'בנינו לך אימון ראשון של 12 דקות. בלי ציוד, בלי לחץ.',
        href: null,
        ctaLabel: null,
      };
    case 'routine':
      return { day: day.day, lever: day.lever, title: 'האימון שלך מחכה בכניסה', body: 'הוא כבר חימם את עצמו. 12 דקות ואתם חברים', href: null, ctaLabel: null };
    case 'low_bar':
      return { day: day.day, lever: day.lever, title: 'הורדנו את הרף. ממש נמוך', body: '10 דקות הליכה. זה הכול. גם זה נספר', href: '/map?openRun=walking', ctaLabel: 'יוצאים להליכה' };
    case 'social':
      return { day: day.day, lever: day.lever, title: 'לא חייבים לבד', body: 'בגינות ליד הבית יש אנשים שמתאמנים. בואו לראות מי', href: '/map', ctaLabel: 'למפה' };
    case 'steps':
      return { day: day.day, lever: day.lever, title: 'הרגליים עשו עבודה יפה היום', body: 'כל צעד נספר. סיבוב קצר מסביב לבניין סוגר יום', href: '/activity/steps', ctaLabel: 'לצעדים של היום' };
    case 'evening':
      return { day: day.day, lever: day.lever, title: 'היום היה של כולם', body: '10 הדקות הבאות יכולות להיות רק שלך', href: null, ctaLabel: null };
    case 'in_app':
      return { day: day.day, lever: day.lever, title: 'עוד יום והשבוע הראשון מאחורינו', body: 'אימון קצר של 10 דקות, ומתחילים אותו ברגל ימין', href: null, ctaLabel: null };
    case 'fresh_start':
      return { day: day.day, lever: day.lever, title: 'שבוע חדש, דף חדש', body: 'בלי להסתכל אחורה. אימון של 10 דקות ומתחילים', href: null, ctaLabel: null };
    default:
      return null;
  }
}
