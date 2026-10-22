import { describe, expect, it } from 'vitest';
import {
  milestoneBadges,
  nextMilestone,
  pickCelebration,
  todayTones,
  weekStrip,
  type CelebrationInput,
} from '../core/celebration.core';
import { celebrationCopy } from '../core/celebration-copy';

// 2026-10-22 is a Thursday.
const TODAY = '2026-10-22';
const base: CelebrationInput = {
  todayKey: TODAY,
  currentStreak: 6,
  longestStreak: 6,
  lastStreakDate: TODAY,
  notice: null,
  shieldsLeft: 0,
  lastCelebratedDay: null,
};

describe('pickCelebration — once per day', () => {
  it('shows the day variant when today closed', () => {
    expect(pickCelebration(base)?.variant).toBe('day');
  });
  it('never twice for the same day', () => {
    expect(pickCelebration({ ...base, lastCelebratedDay: TODAY })).toBeNull();
  });
  it('a celebration yesterday does not block today', () => {
    expect(pickCelebration({ ...base, lastCelebratedDay: '2026-10-21' })?.variant).toBe('day');
  });
  it('nothing while today is not closed (no shield news)', () => {
    expect(pickCelebration({ ...base, lastStreakDate: '2026-10-21' })).toBeNull();
    expect(pickCelebration({ ...base, currentStreak: 0 })).toBeNull();
  });
});

describe('pickCelebration — priority', () => {
  const shield = { kind: 'shield_used' as const, days: ['2026-10-21'], left: 1, on: TODAY };

  it('milestones 7 / 30 / 100 win', () => {
    for (const n of [7, 30, 100]) {
      const c = pickCelebration({ ...base, currentStreak: n, longestStreak: n, notice: shield });
      expect(c?.variant).toBe('milestone');
      expect(c?.milestone).toBe(n);
    }
  });
  it('other multiples of 7 are a full week', () => {
    expect(pickCelebration({ ...base, currentStreak: 14 })?.variant).toBe('week');
    expect(pickCelebration({ ...base, currentStreak: 21, notice: shield })?.variant).toBe('week');
  });
  it('shield beats back and day when today closed', () => {
    const c = pickCelebration({ ...base, currentStreak: 12, notice: shield, shieldsLeft: 1 });
    expect(c?.variant).toBe('shield');
    expect(c?.shieldsLeft).toBe(1);
    expect(c?.shieldDays).toEqual(['2026-10-21']);
  });
  it('shield shows on open even before today closes', () => {
    expect(pickCelebration({ ...base, currentStreak: 11, lastStreakDate: '2026-10-20', notice: shield })?.variant).toBe('shield');
  });
  it('an old shield notice is ignored', () => {
    expect(pickCelebration({ ...base, notice: { ...shield, on: '2026-10-20' } })?.variant).toBe('day');
  });
  it('back after a break: day 1 with a real best streak', () => {
    const c = pickCelebration({ ...base, currentStreak: 1, longestStreak: 14 });
    expect(c?.variant).toBe('back');
    expect(c?.best).toBe(14);
  });
  it('a first-ever day is a plain day', () => {
    expect(pickCelebration({ ...base, currentStreak: 1, longestStreak: 1 })?.variant).toBe('day');
  });
});

describe('weekStrip', () => {
  it('lights the streak run inside this week, marks shields, leaves the future empty', () => {
    const strip = weekStrip(TODAY, { currentStreak: 3, lastStreakDate: TODAY }, ['2026-10-19']);
    expect(strip.map((d) => d.state)).toEqual(['empty', 'shield', 'lit', 'lit', 'lit', 'empty', 'empty']);
    expect(strip[4].isToday).toBe(true);
    expect(strip[0].key).toBe('2026-10-18');
  });
  it('no streak → all empty', () => {
    expect(weekStrip(TODAY, { currentStreak: 0, lastStreakDate: '' }).every((d) => d.state === 'empty')).toBe(true);
  });
});

describe('milestones + tones + copy', () => {
  it('badge row', () => {
    expect(milestoneBadges(30)).toEqual([
      { n: 7, state: 'done' },
      { n: 30, state: 'current' },
      { n: 100, state: 'next' },
    ]);
    expect(nextMilestone(30)).toBe(100);
    expect(nextMilestone(365)).toBeNull();
  });
  it('tones from today', () => {
    expect(todayTones({ categories: { strength: { minutes: 20 } }, steps: 9000, stepsGoal: 8000 })).toEqual(['strength', 'steps']);
    expect(todayTones(null)).toEqual(['steps']);
  });
  it('copy is gendered with a neutral fallback', () => {
    const c = pickCelebration({ ...base, currentStreak: 30, longestStreak: 30 })!;
    expect(celebrationCopy(c, 'male').sub).toContain('אתה בדרך ל-100');
    expect(celebrationCopy(c, 'female').sub).toContain('את בדרך ל-100');
    expect(celebrationCopy(c, null).sub).toContain('הבא בתור: 100');
    const s = pickCelebration({ ...base, notice: { kind: 'shield_used', days: ['2026-10-21'], left: 1, on: TODAY }, shieldsLeft: 1 })!;
    expect(celebrationCopy(s, 'male').headline).toBe('המגן שמר לך על הרצף');
  });
});
