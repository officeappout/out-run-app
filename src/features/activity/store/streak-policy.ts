/**
 * streak-policy — the activity store's side of the Saturday rule and the streak shields
 * (owner decisions 21.10.2026). Pure helpers, kept out of useActivityStore.ts (a 1,400-line
 * file) so the store only calls in.
 *
 * Flags (panel, live values — no super-admin override):
 *   enable_shabbat_free_streak  a missed Saturday keeps the streak (everyone)
 *   enable_streak_shields       +1 shield per 7 streak days (max 2), auto-used on a missed day
 * Both off → every helper here returns exactly what the store did before (no extra fields).
 *
 * The rules themselves: ../lib/streak-day.core.ts (shared with streakRescueScheduler).
 *
 * ── Writing a bridged gap (no firestore.rules change) ──────────────────────
 * streaks/{uid} accepts only: unchanged, +1 with the date +1 day, restart at 1, or −1 with
 * the date unchanged. A kept gap (free Saturday / shield day) must move the date forward
 * WITHOUT adding a day, so each bridged day is written as +1 (date → that day) followed by
 * −1 (same date): two writes the rule already accepts. Today's write is then the plain +1.
 * longestStreak may read one higher between the two writes; today's +1 settles it to
 * max(longest, streak) — the same value the store holds.
 *
 * Data (additive, optional, on streaks/{uid} — no backfill; absent = 0 / none):
 *   shields          number 0..2  shields held
 *   shieldsEarnedAt  number       streak value that last earned a shield (idempotency)
 *   shieldUsedOn     string[]     the days shields covered most recently (for the in-app card)
 *   milestoneSeen    number       last streak milestone the user saw in the app (the 20:00
 *                                 milestone push skips it)
 */
import { readLiveFlag } from '@/lib/feature-flag-live';
import {
  STREAK_BROKEN_CARD_MIN,
  STREAK_POLICY_OFF,
  clampShields,
  resolveStreakGap,
  shieldsAfterAdvance,
  streakBrokeYesterday,
  type StreakPolicy,
} from '../lib/streak-day.core';
import type { StreakCounters } from '../lib/streak-rules';

export function readStreakPolicy(): StreakPolicy {
  return {
    shabbatFree: readLiveFlag('enableShabbatFreeStreak'),
    shields: readLiveFlag('enableStreakShields'),
  };
}

export function policyActive(p: StreakPolicy): boolean {
  return p.shabbatFree || p.shields;
}

/** A bridged gap waiting to be written by syncToServer (cleared after). */
export interface PendingStreakBridge {
  days: string[];
  prevStreak: number;
  prevLongest: number;
}

/** What the home card says about the streak after a load (enable_home_v2 renders it). */
export type StreakNotice =
  | { kind: 'broken'; previous: number; best: number; on: string }
  | { kind: 'shield_used'; days: string[]; left: number; on: string }
  | { kind: 'shield_earned'; held: number; streak: number; on: string };

export interface ShieldState {
  streakShields?: number;
  streakShieldsEarnedAt?: number;
}

export interface PolicyAdvance {
  /** null = the policy doesn't apply here (caller keeps the old path). */
  currentStreak: number;
  lastStreakDate: string;
  bridge: PendingStreakBridge | null;
  shields: { streakShields: number; streakShieldsEarnedAt: number; earned: boolean } | null;
  shieldDays: string[];
}

/**
 * Advance to `todayStr` under the policy. Returns null when the gap rules don't change
 * anything (no gap, or no kept day) — the caller then uses its existing advance (and still
 * calls shieldsOnAdvance for the shield count).
 */
export function advanceKeptGap(
  counters: StreakCounters,
  todayStr: string,
  shields: ShieldState,
  longestStreak: number,
  policy: StreakPolicy,
): PolicyAdvance | null {
  if (!policyActive(policy) || counters.lastStreakDate === todayStr) return null;
  const gap = resolveStreakGap(
    { currentStreak: counters.currentStreak, lastStreakDate: counters.lastStreakDate, shields: shields.streakShields },
    todayStr,
    policy,
  );
  if (!gap.alive || gap.missed.length === 0) return null;
  const next = counters.currentStreak + 1;
  return {
    currentStreak: next,
    lastStreakDate: todayStr,
    bridge: { days: gap.missed, prevStreak: counters.currentStreak, prevLongest: longestStreak },
    shields: policy.shields
      ? (() => {
          const s = shieldsAfterAdvance(next, gap.shieldsLeft, shields.streakShieldsEarnedAt);
          return { streakShields: s.shields, streakShieldsEarnedAt: s.earnedAt, earned: s.earned };
        })()
      : null,
    shieldDays: gap.shieldDays,
  };
}

/** Shield count after a plain advance (no kept gap). null while shields are off. */
export function shieldsOnAdvance(
  newStreak: number,
  shields: ShieldState,
  policy: StreakPolicy,
): { streakShields: number; streakShieldsEarnedAt: number; earned: boolean } | null {
  if (!policy.shields) return null;
  const s = shieldsAfterAdvance(newStreak, shields.streakShields, shields.streakShieldsEarnedAt);
  return { streakShields: s.shields, streakShieldsEarnedAt: s.earnedAt, earned: s.earned };
}

/** Undo of today's advance: give back a shield that exactly this advance earned. */
export function shieldsOnReverse(
  oldStreak: number,
  shields: ShieldState,
  policy: StreakPolicy,
): { streakShields: number; streakShieldsEarnedAt: number } | null {
  if (!policy.shields) return null;
  const at = Number(shields.streakShieldsEarnedAt) || 0;
  const held = clampShields(shields.streakShields);
  if (at !== oldStreak || held === 0) return null;
  return { streakShields: held - 1, streakShieldsEarnedAt: Math.max(0, at - 7) };
}

export interface LoadedStreak {
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string;
  shields: number;
  shieldsEarnedAt: number;
}

/**
 * On load: is a streak with a gap kept by the policy, and what should the home card say?
 * `keptByPolicy` false → the caller's existing broken/alive decision stands.
 */
export function restoreOnLoad(
  s: LoadedStreak,
  todayStr: string,
  policy: StreakPolicy,
): { keptByPolicy: boolean; notice: StreakNotice | null; shieldsLeft: number } {
  const gap = resolveStreakGap(
    { currentStreak: s.currentStreak, lastStreakDate: s.lastStreakDate, shields: s.shields },
    todayStr,
    policy,
  );
  const kept = policyActive(policy) && gap.alive && gap.missed.length > 0;
  if (kept && gap.shieldDays.length > 0) {
    return { keptByPolicy: true, notice: { kind: 'shield_used', days: gap.shieldDays, left: gap.shieldsLeft, on: todayStr }, shieldsLeft: gap.shieldsLeft };
  }
  if (kept) return { keptByPolicy: true, notice: null, shieldsLeft: gap.shieldsLeft };
  return { keptByPolicy: false, notice: null, shieldsLeft: policy.shields ? clampShields(s.shields) : 0 };
}

/**
 * The "streak stopped, the record stays" card after a load that found the streak broken —
 * only on the day after the day that broke it (a stale streak doc days later stays quiet).
 * `on` is the last counted day, so the card's key is the same on every load that day.
 */
export function brokenNotice(
  s: { currentStreak: number; longestStreak: number; lastStreakDate: string; shields?: number },
  todayStr: string,
  policy: StreakPolicy,
): StreakNotice | null {
  if (s.currentStreak < STREAK_BROKEN_CARD_MIN) return null;
  if (!streakBrokeYesterday({ currentStreak: s.currentStreak, lastStreakDate: s.lastStreakDate, shields: s.shields }, todayStr, policy)) return null;
  return { kind: 'broken', previous: s.currentStreak, best: Math.max(s.longestStreak, s.currentStreak), on: s.lastStreakDate };
}

/** Shield fields for the streaks/{uid} write (empty while shields are off — byte-identical doc). */
export function shieldDocFields(
  state: ShieldState & { streakShieldUsedOn?: string[] },
  policy: StreakPolicy,
): Record<string, unknown> {
  if (!policy.shields) return {};
  return {
    shields: clampShields(state.streakShields),
    shieldsEarnedAt: Math.max(0, Number(state.streakShieldsEarnedAt) || 0),
    ...(state.streakShieldUsedOn && state.streakShieldUsedOn.length ? { shieldUsedOn: state.streakShieldUsedOn } : {}),
  };
}

/** The two-writes-per-day bridge: the exact docs, in order (see the module header). */
export function bridgeWrites(b: PendingStreakBridge): Array<{ currentStreak: number; longestStreak: number; lastActivityDate: string }> {
  const up = b.prevStreak + 1;
  const longest = Math.max(b.prevLongest, up);
  const out: Array<{ currentStreak: number; longestStreak: number; lastActivityDate: string }> = [];
  for (const d of b.days) {
    out.push({ currentStreak: up, longestStreak: longest, lastActivityDate: d });
    out.push({ currentStreak: b.prevStreak, longestStreak: longest, lastActivityDate: d });
  }
  return out;
}

export { STREAK_POLICY_OFF };
