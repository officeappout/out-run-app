/**
 * Home v2 streak card — which ONE streak message the home shows today, and its copy.
 * Pure (no React, no store). Owner decisions 21.10.2026:
 *   - broken: next day, "השיא נשאר" (a push too only for a streak of 7+, server side);
 *   - shield used / shield earned (enable_streak_shields);
 *   - milestones 3 / 7 / 14 / 30 / 50 / 100 / 365, celebrated in the app on the day they
 *     are reached (seen → the 20:00 milestone push skips it).
 * Priority: broken → shield used → milestone → shield earned. Copy rules: no emoji, no
 * slash, no blame, gender-neutral grammar.
 */
import { isStreakMilestone, STREAK_SHIELD_MAX } from '@/features/activity/lib/streak-day.core';
import type { StreakNotice } from '@/features/activity/store/streak-policy';
import { makeLiveT } from '@/lib/i18n/live-t';
import { home, type HomeKey } from '@/messages/ns/home';
import type { HomeT } from '@/features/home/utils/home-run-slot';

export type StreakCardKind = 'broken' | 'shield_used' | 'milestone' | 'shield_earned';

export interface StreakCardModel {
  kind: StreakCardKind;
  /** Dismissal key — the card never comes back once this key was seen. */
  key: string;
  title: string;
  body: string;
  /** milestone only: the milestone reached (stamped as milestoneSeen on streaks/{uid}). */
  milestone?: number;
}

/** Copy: `home` catalog, keys `streakCard.*` (i18n batch al). Pass the caller's `useT(home)`; default Hebrew. */
const MILESTONE_KEYS: Record<number, { title: HomeKey; body: HomeKey }> = {
  3: { title: 'streakCard.milestone.3.title', body: 'streakCard.milestone.3.body' },
  7: { title: 'streakCard.milestone.7.title', body: 'streakCard.milestone.7.body' },
  14: { title: 'streakCard.milestone.14.title', body: 'streakCard.milestone.14.body' },
  30: { title: 'streakCard.milestone.30.title', body: 'streakCard.milestone.30.body' },
  50: { title: 'streakCard.milestone.50.title', body: 'streakCard.milestone.50.body' },
  100: { title: 'streakCard.milestone.100.title', body: 'streakCard.milestone.100.body' },
  365: { title: 'streakCard.milestone.365.title', body: 'streakCard.milestone.365.body' },
};

function days(n: number, t: HomeT): string {
  return t('streakCard.days', { n, count: String(n) });
}

export function noticeCard(n: StreakNotice, t: HomeT = makeLiveT(home)): StreakCardModel {
  switch (n.kind) {
    case 'broken':
      return {
        kind: 'broken',
        key: `broken:${n.on}`,
        title: t('streakCard.broken.title'),
        body: t('streakCard.broken.body', { days: days(n.best, t) }),
      };
    case 'shield_used': {
      const many = n.days.length > 1 ? 'yes' : 'no';
      return {
        kind: 'shield_used',
        key: `shield_used:${n.days.join(',')}`,
        title: t('streakCard.shieldUsed.title', { many }),
        body:
          n.left > 0
            ? t('streakCard.shieldUsed.bodyLeft', { many, left: n.left === 1 ? 'one' : 'other' })
            : t('streakCard.shieldUsed.bodyNoneLeft', { many }),
      };
    }
    case 'shield_earned':
      return {
        kind: 'shield_earned',
        key: `shield_earned:${n.streak}:${n.on}`,
        title: t('streakCard.shieldEarned.title'),
        body: t('streakCard.shieldEarned.body', { streak: String(n.streak), held: String(n.held), max: String(STREAK_SHIELD_MAX) }),
      };
  }
}

export interface StreakCardInput {
  notice: StreakNotice | null | undefined;
  currentStreak: number;
  lastStreakDate: string;
  todayKey: string;
  /** Keys already seen (dismissed) on this device. */
  seen: ReadonlySet<string>;
}

/** The one card to show now, or null. */
export function pickStreakCard(i: StreakCardInput, t: HomeT = makeLiveT(home)): StreakCardModel | null {
  const candidates: StreakCardModel[] = [];
  if (i.notice && i.notice.kind !== 'shield_earned') candidates.push(noticeCard(i.notice, t));
  if (i.lastStreakDate === i.todayKey && isStreakMilestone(i.currentStreak)) {
    const keys = MILESTONE_KEYS[i.currentStreak];
    if (keys) {
      const copy = { title: t(keys.title), body: t(keys.body) };
      candidates.push({ kind: 'milestone', key: `milestone:${i.currentStreak}:${i.todayKey}`, milestone: i.currentStreak, ...copy });
    }
  }
  if (i.notice && i.notice.kind === 'shield_earned') candidates.push(noticeCard(i.notice, t));
  return candidates.find((c) => !i.seen.has(c.key)) ?? null;
}

// ─── Seen keys (this device) ─────────────────────────────────────────────────

export const STREAK_CARD_SEEN_KEY = 'out-streak-card-seen-v1';
const SEEN_MAX = 30;

export function readSeenKeys(): Set<string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(STREAK_CARD_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

// A tiny change signal so every reader (the card, the home page's "is there a card?")
// re-reads the seen keys after a dismiss (useSyncExternalStore in StreakNoticeCard.tsx).
let seenVersion = 0;
const seenListeners = new Set<() => void>();
export function subscribeSeen(fn: () => void): () => void {
  seenListeners.add(fn);
  return () => {
    seenListeners.delete(fn);
  };
}
export function getSeenVersion(): number {
  return seenVersion;
}

export function addSeenKey(key: string): void {
  seenVersion++;
  seenListeners.forEach((fn) => fn());
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const next = [...Array.from(readSeenKeys()), key].filter((k, i, a) => a.indexOf(k) === i).slice(-SEEN_MAX);
    window.localStorage.setItem(STREAK_CARD_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the card may show again, harmless */
  }
}
