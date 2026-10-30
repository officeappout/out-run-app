import { describe, it, expect } from 'vitest';
import { formatClock, homeDonePostStats, donePostTime } from '../home-done-post';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

const card = (o: Partial<TodayActivityCardData>): TodayActivityCardData => ({ key: 'w1', category: 'strength', title: 'כוח', minutes: 0, streak: 0, ...o });
const values = (s: { value: string; label: string }[]) => s.map((x) => `${x.value} ${x.label}`);

describe('formatClock', () => {
  it('m:ss and h:mm:ss', () => {
    expect(formatClock(1530)).toBe('25:30');
    expect(formatClock(3912)).toBe('1:05:12');
    expect(formatClock(59.6)).toBe('1:00');
  });
});

describe('homeDonePostStats', () => {
  it('strength: minutes and sets', () => {
    expect(values(homeDonePostStats(card({ minutes: 18 }), { setsCompleted: 8 }))).toEqual(['18 דקות', '8 סטים']);
  });

  it('run: km, time, pace', () => {
    const run = card({ category: 'cardio', workoutType: 'running', minutes: 26 });
    expect(values(homeDonePostStats(run, { distance: 4.12, duration: 1530, pace: 6.2167 }))).toEqual(['4.1 ק״מ', '25:30 זמן', '6:13 דק׳ לק״מ']);
  });

  it('run without a duration falls back to the card minutes, no pace', () => {
    const run = card({ category: 'cardio', workoutType: 'running', minutes: 26 });
    expect(values(homeDonePostStats(run, { distance: 4 }))).toEqual(['4 ק״מ', '26 דקות']);
  });

  it('hybrid: sets after the run numbers, at most 3', () => {
    const h = card({ category: 'strength', workoutType: 'hybrid', minutes: 40 });
    expect(values(homeDonePostStats(h, { distance: 3, duration: 2400, setsCompleted: 6 }))).toEqual(['3 ק״מ', '40:00 זמן', '6 סטים']);
    expect(homeDonePostStats(h, { distance: 3, duration: 2400, pace: 13, setsCompleted: 6 })).toHaveLength(3);
  });

  it('steps goal', () => {
    expect(values(homeDonePostStats(card({ key: 'stepgoal-x', category: 'steps', stepsAchieved: 8400 }), undefined))).toEqual(['8,400 צעדים']);
  });

  it('nothing known: no numbers', () => {
    expect(homeDonePostStats(card({}), undefined)).toEqual([]);
  });
});

describe('donePostTime', () => {
  it('Date or a Firestore-like Timestamp; null otherwise', () => {
    const d = new Date(2026, 9, 30, 18, 10);
    expect(donePostTime({ date: d })).toBe('18:10');
    expect(donePostTime({ date: { toDate: () => d } })).toBe('18:10');
    expect(donePostTime({ date: 'x' })).toBeNull();
    expect(donePostTime(undefined)).toBeNull();
  });
});
