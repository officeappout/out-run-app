/**
 * Streak celebrations (enable_streak_celebrations_v1, owner approved 22.10.2026; designs
 * ST-1…ST-5) — which ONE celebration to show now, if any. Pure: no React, no store.
 *
 * Variants (priority when today's streak day is closed):
 *   milestone (7 / 30 / 100 / 365) → week (every other multiple of 7) → shield (a shield
 *   covered a missed day, notice dated today) → back (day 1 of a new streak after a real
 *   streak) → day (N-1 → N).
 * Today not closed yet: only the shield variant can show (it is news on open).
 * At most once per day: `lastCelebratedDay === todayKey` → nothing.
 */
import { dayClosedBySteps, dayKeyAdd, dayKeyDiff, type StreakDayCounts } from '@/features/activity/lib/streak-day.core';
import { sortTones, toneFromCategory, type FlameTone } from '@/components/ui/v2/streak';
import type { StreakNotice } from '@/features/activity/store/streak-policy';

export type CelebrationVariant = 'day' | 'week' | 'milestone' | 'shield' | 'back';

/** Big-badge days. 7 / 30 / 100 per the brief; 365 added so a full year is never a "day". */
export const CELEBRATION_MILESTONES: ReadonlyArray<number> = [7, 30, 100, 365];

/** "Back after a break" only when the streak that ended was at least this long. */
export const BACK_MIN_BEST = 2;

export interface CelebrationInput {
  todayKey: string;
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string;
  notice: StreakNotice | null | undefined;
  shieldsLeft: number;
  /** Day key of the last celebration shown on this device (null = never). */
  lastCelebratedDay: string | null;
}

export interface Celebration {
  variant: CelebrationVariant;
  /** The streak after today (the number the overlay lands on). */
  streak: number;
  /** The best streak (back variant). */
  best: number;
  /** Shield variant: shields still held; days the shield covered. */
  shieldsLeft: number;
  shieldDays: string[];
  /** Milestone variant: the milestone reached. */
  milestone?: number;
}

export function isCelebrationMilestone(n: number): boolean {
  return CELEBRATION_MILESTONES.includes(n);
}

export function pickCelebration(i: CelebrationInput): Celebration | null {
  if (i.lastCelebratedDay === i.todayKey) return null;
  const closedToday = i.lastStreakDate === i.todayKey && i.currentStreak >= 1;
  const shieldToday = i.notice?.kind === 'shield_used' && i.notice.on === i.todayKey ? i.notice : null;
  const base = {
    streak: Math.max(0, i.currentStreak),
    best: Math.max(i.longestStreak, i.currentStreak),
    shieldsLeft: Math.max(0, i.shieldsLeft),
    shieldDays: shieldToday?.days ?? [],
  };

  if (!closedToday) return shieldToday && base.streak > 0 ? { variant: 'shield', ...base } : null;

  if (isCelebrationMilestone(base.streak)) return { variant: 'milestone', milestone: base.streak, ...base };
  if (base.streak % 7 === 0) return { variant: 'week', ...base };
  if (shieldToday) return { variant: 'shield', ...base };
  if (base.streak === 1 && base.best >= BACK_MIN_BEST) return { variant: 'back', ...base };
  return { variant: 'day', ...base };
}

// ─── The week strip (Sunday → Saturday, like the home strip) ─────────────────

export type StripCell = 'lit' | 'shield' | 'empty';

export interface StripDay {
  key: string;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  state: StripCell;
  isToday: boolean;
}

/**
 * This week's 7 days: lit inside the current streak run (ending at lastStreakDate), shield
 * on the days a shield covered, empty otherwise (and in the future).
 */
export function weekStrip(
  todayKey: string,
  s: { currentStreak: number; lastStreakDate: string },
  shieldDays: ReadonlyArray<string> = [],
): StripDay[] {
  const todayDow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const sunday = dayKeyAdd(todayKey, -todayDow);
  const runStart = s.currentStreak > 0 && s.lastStreakDate ? dayKeyAdd(s.lastStreakDate, -(s.currentStreak - 1)) : null;
  const shields = new Set(shieldDays);
  return Array.from({ length: 7 }, (_, dow) => {
    const key = dayKeyAdd(sunday, dow);
    let state: StripCell = 'empty';
    if (shields.has(key)) state = 'shield';
    else if (
      runStart &&
      dayKeyDiff(runStart, key) >= 0 &&
      dayKeyDiff(key, s.lastStreakDate) >= 0 &&
      dayKeyDiff(key, todayKey) >= 0
    ) {
      state = 'lit';
    }
    return { key, dow, state, isToday: key === todayKey };
  });
}

// ─── Milestone badge row ─────────────────────────────────────────────────────

export type BadgeState = 'done' | 'current' | 'next';

/** The 7 / 30 / 100 row under the milestone badge (365 joins once 100 is behind). */
export function milestoneBadges(streak: number): Array<{ n: number; state: BadgeState }> {
  const row = streak > 100 ? [30, 100, 365] : [7, 30, 100];
  return row.map((n) => ({ n, state: n === streak ? 'current' : n < streak ? 'done' : 'next' }));
}

/** The next milestone after `streak` (null after a year). */
export function nextMilestone(streak: number): number | null {
  return CELEBRATION_MILESTONES.find((m) => m > streak) ?? null;
}

// ─── Flame tones (the home strip's flame language) ───────────────────────────

/** Today's flame tones: each active category + steps when the goal was met (fallback: steps). */
export function todayTones(day: StreakDayCounts | null | undefined): FlameTone[] {
  const tones = new Set<FlameTone>();
  for (const [cat, v] of Object.entries(day?.categories ?? {})) {
    if ((Number(v?.minutes) || 0) > 0) tones.add(toneFromCategory(cat));
  }
  if (dayClosedBySteps(day)) tones.add('steps');
  return tones.size ? sortTones(tones) : ['steps'];
}
