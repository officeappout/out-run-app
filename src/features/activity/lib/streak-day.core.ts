/**
 * streak-day.core — the ONE streak-day policy shared by the app and Cloud Functions
 * (streak pushes, owner decisions 21.10.2026).
 *
 * KEEP THIS FILE IMPORT-FREE AND PURE: it is mirrored byte for byte into
 * functions/src/shared/streak-day.core.ts by functions/scripts/vendor-copy-geo-discovery.js
 * (COMMITTED_MIRRORS) and lib/__tests__/streak-day.core.test.ts pins the copy, so the
 * client streak (useActivityStore via streak-rules.ts) and the server
 * (streakRescueScheduler) can never disagree on what a streak day is.
 *
 * ── A closed day ────────────────────────────────────────────────────────────
 * A day counts toward the streak when EITHER the day's active minutes (all categories,
 * walking included) reach 10, OR the day's steps reach the day's step goal. The server
 * also sees the workouts saved that day: it takes the larger of the two minute counts
 * (never their sum — a saved workout is also in dailyActivity once the app syncs).
 *
 * ── A missed day (what keeps a streak alive) ────────────────────────────────
 * Days strictly between the last counted day and today, in order:
 *   - Saturday, when policy.shabbatFree (flag enable_shabbat_free_streak, for EVERYONE):
 *     a free day — never breaks the streak, never adds to it (an active Saturday still
 *     counts as a normal day);
 *   - otherwise a shield, when policy.shields (flag enable_streak_shields) and one is
 *     left: used automatically, keeps the streak, doesn't add to it;
 *   - otherwise the streak is broken.
 * Shields: +1 for every 7 streak days (7, 14, 21, ...), at most 2 held.
 *
 * ── Streak pushes (server) ──────────────────────────────────────────────────
 * 10:00 broken (yesterday broke it; push only if it was ≥7 — the in-app card is for all),
 * 19:30 rescue (streak ≥2, today not closed), 20:00 milestone (reached today and not
 * seen in the app), 21:15 second rescue (streak ≥7, first rescue not opened).
 *
 * Dates are 'YYYY-MM-DD' local-day keys (Israel on the server). Both parse as UTC
 * midnight, so differences are whole days and the weekday is the calendar weekday.
 */

// ─── A closed day ────────────────────────────────────────────────────────────

/** Minutes that close a day. Must equal STREAK_MINIMUM_MINUTES (activity.types.ts) — pinned by a test. */
export const STREAK_DAY_MIN_MINUTES = 10;
/** Step goal for a day doc without stepsGoal. Must equal DAILY_STEP_GOAL (health-goals.ts) — pinned. */
export const STREAK_DAY_FALLBACK_STEP_GOAL = 8000;

/** The parts of a dailyActivity day the rules read (a DailyActivity or a raw doc satisfies it). */
export interface StreakDayCounts {
  categories?: Record<string, { minutes?: number } | null | undefined> | null;
  steps?: number | null;
  stepsGoal?: number | null;
}

export function dayActiveMinutes(day: StreakDayCounts | null | undefined): number {
  return Object.values(day?.categories ?? {}).reduce<number>(
    (sum, cat) => sum + (Number(cat?.minutes) || 0),
    0,
  );
}

/** The step goal the user saw for this day (the day's snapshot, else the fallback). */
export function dayStepGoal(day: Pick<StreakDayCounts, 'stepsGoal'> | null | undefined): number {
  const goal = Number(day?.stepsGoal);
  return Number.isFinite(goal) && goal > 0 ? goal : STREAK_DAY_FALLBACK_STEP_GOAL;
}

export function dayClosedByMinutes(day: StreakDayCounts | null | undefined, workoutMinutes = 0): boolean {
  return Math.max(dayActiveMinutes(day), Number(workoutMinutes) || 0) >= STREAK_DAY_MIN_MINUTES;
}

export function dayClosedBySteps(day: StreakDayCounts | null | undefined): boolean {
  const steps = Number(day?.steps) || 0;
  return steps > 0 && steps >= dayStepGoal(day);
}

/** Is this day closed (counts toward the streak)? `workoutMinutes`: the day's saved workouts (server). */
export function isDayClosed(day: StreakDayCounts | null | undefined, workoutMinutes = 0): boolean {
  return dayClosedByMinutes(day, workoutMinutes) || dayClosedBySteps(day);
}

/** What is left to close the day: active minutes OR steps (0 when closed). For push copy. */
export function dayLeftToClose(
  day: StreakDayCounts | null | undefined,
  workoutMinutes = 0,
): { minutes: number; steps: number } {
  if (isDayClosed(day, workoutMinutes)) return { minutes: 0, steps: 0 };
  const minutes = Math.max(dayActiveMinutes(day), Number(workoutMinutes) || 0);
  return {
    minutes: Math.max(0, Math.ceil(STREAK_DAY_MIN_MINUTES - minutes)),
    steps: Math.max(0, Math.ceil(dayStepGoal(day) - (Number(day?.steps) || 0))),
  };
}

// ─── Calendar ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function keyMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

export function dayKeyAdd(key: string, n: number): string {
  return new Date(keyMs(key) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `fromKey` to `toKey` (negative when toKey is earlier). */
export function dayKeyDiff(fromKey: string, toKey: string): number {
  return Math.round((keyMs(toKey) - keyMs(fromKey)) / DAY_MS);
}

export function isSaturdayKey(key: string): boolean {
  return new Date(keyMs(key)).getUTCDay() === 6;
}

// ─── Missed days: Saturday + shields ─────────────────────────────────────────

export interface StreakPolicy {
  /** enable_shabbat_free_streak: a missed Saturday never breaks the streak (everyone). */
  shabbatFree: boolean;
  /** enable_streak_shields: earned shields cover missed days automatically. */
  shields: boolean;
}

/** Both flags off — exactly the streak as it was before (no free day, no shield). */
export const STREAK_POLICY_OFF: StreakPolicy = { shabbatFree: false, shields: false };

export const STREAK_SHIELD_EVERY = 7;
export const STREAK_SHIELD_MAX = 2;

export function clampShields(n: unknown): number {
  const v = Math.floor(Number(n) || 0);
  return Math.max(0, Math.min(STREAK_SHIELD_MAX, v));
}

export interface StreakSnapshot {
  currentStreak: number;
  /** Last counted day ('' = none). */
  lastStreakDate: string;
  /** Shields held (streaks/{uid}.shields). Ignored while policy.shields is off. */
  shields?: number;
}

export interface StreakGap {
  /** The streak is still alive today (today itself may still be open). */
  alive: boolean;
  /** Days strictly between the last counted day and today. */
  missed: string[];
  /** Missed Saturdays covered by the Shabbat rule. */
  freeDays: string[];
  /** Missed days covered by a shield (in order). */
  shieldDays: string[];
  /** Shields left after covering the gap (policy.shields off → 0). */
  shieldsLeft: number;
}

/** No streak can bridge more than this many missed days (2 shields + a Saturday per week). */
const MAX_BRIDGEABLE_GAP = 31;

/** Is the streak alive on `todayKey`, and which missed days were free / covered by a shield? */
export function resolveStreakGap(s: StreakSnapshot, todayKey: string, policy: StreakPolicy): StreakGap {
  let left = policy.shields ? clampShields(s.shields) : 0;
  const out: StreakGap = { alive: false, missed: [], freeDays: [], shieldDays: [], shieldsLeft: left };
  if (!s.lastStreakDate || !(s.currentStreak > 0)) return out;
  const diff = dayKeyDiff(s.lastStreakDate, todayKey);
  if (diff <= 1) return { ...out, alive: true };
  if (diff - 1 > MAX_BRIDGEABLE_GAP) return out;
  for (let i = 1; i < diff; i++) {
    const d = dayKeyAdd(s.lastStreakDate, i);
    out.missed.push(d);
    if (policy.shabbatFree && isSaturdayKey(d)) {
      out.freeDays.push(d);
    } else if (left > 0) {
      out.shieldDays.push(d);
      left--;
    } else {
      out.shieldsLeft = left;
      return out;
    }
  }
  return { ...out, alive: true, shieldsLeft: left };
}

/** The streak as the user sees it today: the count (0 when broken) and the shields left. */
export function streakToday(s: StreakSnapshot, todayKey: string, policy: StreakPolicy): {
  streak: number;
  alive: boolean;
  closedToday: boolean;
  shieldsLeft: number;
  gap: StreakGap;
} {
  const gap = resolveStreakGap(s, todayKey, policy);
  return {
    streak: gap.alive ? s.currentStreak : 0,
    alive: gap.alive,
    closedToday: !!s.lastStreakDate && s.lastStreakDate === todayKey,
    shieldsLeft: gap.alive ? gap.shieldsLeft : 0,
    gap,
  };
}

/** The streak was alive yesterday and is broken today (yesterday was the day that broke it). */
export function streakBrokeYesterday(s: StreakSnapshot, todayKey: string, policy: StreakPolicy): boolean {
  if (!(s.currentStreak > 0) || !s.lastStreakDate) return false;
  return !resolveStreakGap(s, todayKey, policy).alive && resolveStreakGap(s, dayKeyAdd(todayKey, -1), policy).alive;
}

/**
 * Shield accounting on an advance to `newStreak`: one shield per STREAK_SHIELD_EVERY days
 * (crossing 7, 14, 21, ...), at most STREAK_SHIELD_MAX held. `earnedAt` (the streak value
 * that last earned one) makes it idempotent: undoing today and re-counting it never earns
 * twice. A streak that restarts at 1 resets `earnedAt`.
 */
export function shieldsAfterAdvance(
  newStreak: number,
  shields: number | undefined,
  earnedAt: number | undefined,
): { shields: number; earnedAt: number; earned: boolean } {
  let held = clampShields(shields);
  let at = newStreak <= 1 ? 0 : Math.max(0, Math.floor(Number(earnedAt) || 0));
  let earned = false;
  if (Math.floor(newStreak / STREAK_SHIELD_EVERY) > Math.floor(at / STREAK_SHIELD_EVERY)) {
    at = newStreak;
    if (held < STREAK_SHIELD_MAX) {
      held++;
      earned = true;
    }
  }
  return { shields: held, earnedAt: at, earned };
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export const STREAK_MILESTONES: ReadonlyArray<number> = [3, 7, 14, 30, 50, 100, 365];

export function isStreakMilestone(n: number): boolean {
  return STREAK_MILESTONES.includes(n);
}

// ─── Streak pushes (server schedule) ─────────────────────────────────────────

export type StreakPushSlot = 'broken' | 'rescue' | 'milestone' | 'rescue_late';

/** Israel local time of each slot ('HH:MM'). */
export const STREAK_PUSH_SLOTS: Readonly<Record<StreakPushSlot, string>> = {
  broken: '10:00',
  rescue: '19:30',
  milestone: '20:00',
  rescue_late: '21:15',
};

/** Rescue at 19:30 from a streak of this many days. */
export const STREAK_RESCUE_MIN = 2;
/** The second rescue (21:15) only from this many days. */
export const STREAK_RESCUE_LATE_MIN = 7;
/** "The streak broke" as a push only from this many days (the in-app card shows from 2). */
export const STREAK_BROKEN_PUSH_MIN = 7;
export const STREAK_BROKEN_CARD_MIN = 2;

/** 'HH:MM' (Israel) → the slot that runs then, or null. */
export function streakPushSlotAt(hhmm: string): StreakPushSlot | null {
  for (const [slot, at] of Object.entries(STREAK_PUSH_SLOTS) as Array<[StreakPushSlot, string]>) {
    if (at === hhmm) return slot;
  }
  return null;
}

export interface RescueInput {
  slot: 'rescue' | 'rescue_late';
  todayKey: string;
  snapshot: StreakSnapshot;
  policy: StreakPolicy;
  /** Today is closed by the day's data (dailyActivity / workouts), even if the app hasn't counted it. */
  closedByData: boolean;
  /** rescue_late only: the 19:30 rescue was opened. */
  firstOpened?: boolean;
}

/** Should this user get the rescue push now? */
export function rescueDue(i: RescueInput): boolean {
  const t = streakToday(i.snapshot, i.todayKey, i.policy);
  if (!t.alive || t.closedToday || i.closedByData) return false;
  // A free Saturday can't break anything — nothing to rescue.
  if (i.policy.shabbatFree && isSaturdayKey(i.todayKey)) return false;
  if (i.slot === 'rescue') return t.streak >= STREAK_RESCUE_MIN;
  return t.streak >= STREAK_RESCUE_LATE_MIN && !i.firstOpened;
}
