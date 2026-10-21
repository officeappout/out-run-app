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

const MILESTONE_COPY: Record<number, { title: string; body: string }> = {
  3: { title: '3 ימים ברצף', body: 'ההתחלה הכי קשה כבר מאחור. ממשיכים מחר.' },
  7: { title: 'שבוע שלם', body: '7 ימים ברצף. ככה נראה הרגל שנולד.' },
  14: { title: 'שבועיים ברצף', body: '14 ימים. הגוף כבר מחכה לזה.' },
  30: { title: 'חודש. וואו', body: '30 ימים ברצף. זה כבר לא ניסיון, זה הרגל.' },
  50: { title: '50 ימים ברצף', body: 'חצי הדרך למאה. ממשיכים בקצב שלך.' },
  100: { title: '100. מישהו פה רציני', body: '100 ימים ברצף. השכנים מדברים.' },
  365: { title: 'שנה שלמה ברצף', body: '365 ימים. אין מילים, רק כבוד.' },
};

function days(n: number): string {
  return n === 1 ? 'יום אחד' : `${n} ימים`;
}

export function noticeCard(n: StreakNotice): StreakCardModel {
  switch (n.kind) {
    case 'broken':
      return {
        kind: 'broken',
        key: `broken:${n.on}`,
        title: 'הרצף נעצר. השיא נשאר',
        body: `${days(n.best)} זה שלך לתמיד. מתחילים רצף חדש היום?`,
      };
    case 'shield_used':
      return {
        kind: 'shield_used',
        key: `shield_used:${n.days.join(',')}`,
        title: n.days.length > 1 ? 'המגנים שמרו על הרצף' : 'המגן שמר על הרצף',
        body:
          n.left > 0
            ? `${n.days.length > 1 ? 'הימים בלי פעילות לא שברו' : 'היום בלי פעילות לא שבר'} את הרצף. נשאר עוד מגן ${n.left === 1 ? 'אחד' : 'שניים'}.`
            : `${n.days.length > 1 ? 'הימים בלי פעילות לא שברו' : 'היום בלי פעילות לא שבר'} את הרצף. כל 7 ימי רצף מביאים מגן חדש.`,
      };
    case 'shield_earned':
      return {
        kind: 'shield_earned',
        key: `shield_earned:${n.streak}:${n.on}`,
        title: 'מגן רצף חדש',
        body: `${n.streak} ימים ברצף שווים מגן. ביום שלא נסגר הוא שומר על הרצף לבד. ${n.held} מתוך ${STREAK_SHIELD_MAX}.`,
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
export function pickStreakCard(i: StreakCardInput): StreakCardModel | null {
  const candidates: StreakCardModel[] = [];
  if (i.notice && i.notice.kind !== 'shield_earned') candidates.push(noticeCard(i.notice));
  if (i.lastStreakDate === i.todayKey && isStreakMilestone(i.currentStreak)) {
    const copy = MILESTONE_COPY[i.currentStreak];
    if (copy) {
      candidates.push({ kind: 'milestone', key: `milestone:${i.currentStreak}:${i.todayKey}`, milestone: i.currentStreak, ...copy });
    }
  }
  if (i.notice && i.notice.kind === 'shield_earned') candidates.push(noticeCard(i.notice));
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

export function addSeenKey(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const next = [...Array.from(readSeenKeys()), key].filter((k, i, a) => a.indexOf(k) === i).slice(-SEEN_MAX);
    window.localStorage.setItem(STREAK_CARD_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the card may show again, harmless */
  }
}
