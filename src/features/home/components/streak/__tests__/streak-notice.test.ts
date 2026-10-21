/** Home v2 streak card — which one message shows, and its copy rules. */
import { describe, it, expect } from 'vitest';
import { noticeCard, pickStreakCard } from '../streak-notice';

const T = '2026-10-21';
const base = { currentStreak: 4, lastStreakDate: '2026-10-20', todayKey: T, seen: new Set<string>() };

describe('pickStreakCard', () => {
  it('nothing to say → null', () => {
    expect(pickStreakCard({ ...base, notice: null })).toBeNull();
  });

  it('broken: "the record stays", keyed so it never comes back once seen', () => {
    const notice = { kind: 'broken' as const, previous: 5, best: 23, on: '2026-10-19' };
    const card = pickStreakCard({ ...base, notice })!;
    expect(card.title).toBe('הרצף נעצר. השיא נשאר');
    expect(card.body).toContain('23 ימים');
    expect(pickStreakCard({ ...base, notice, seen: new Set([card.key]) })).toBeNull();
  });

  it('milestone reached today; the shield earned the same day comes after it', () => {
    const notice = { kind: 'shield_earned' as const, held: 1, streak: 7, on: T };
    const first = pickStreakCard({ ...base, currentStreak: 7, lastStreakDate: T, notice })!;
    expect(first).toMatchObject({ kind: 'milestone', milestone: 7, title: 'שבוע שלם' });
    const second = pickStreakCard({ ...base, currentStreak: 7, lastStreakDate: T, notice, seen: new Set([first.key]) })!;
    expect(second.kind).toBe('shield_earned');
  });

  it('no milestone on a day not counted yet', () => {
    expect(pickStreakCard({ ...base, currentStreak: 7, lastStreakDate: '2026-10-20', notice: null })).toBeNull();
  });

  it('copy: no emoji, no slash, no dash', () => {
    const cards = [
      noticeCard({ kind: 'broken', previous: 9, best: 9, on: T }),
      noticeCard({ kind: 'shield_used', days: [T], left: 1, on: T }),
      noticeCard({ kind: 'shield_used', days: [T, T], left: 0, on: T }),
      noticeCard({ kind: 'shield_earned', held: 2, streak: 14, on: T }),
    ];
    for (const c of cards) {
      expect(`${c.title} ${c.body}`).not.toMatch(/[\/\u2013\u2014\uD800-\uDFFF]/);
    }
  });
});
