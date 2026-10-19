import { describe, expect, it } from 'vitest';
import { buildDoneWorkoutRows, doneRowMeta } from '../done-workout-rows';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

const card = (over: Partial<TodayActivityCardData>): TodayActivityCardData => ({
  key: 'w1', category: 'strength', title: 'כל הגוף', minutes: 42, streak: 1, ...over,
});

describe('doneRowMeta', () => {
  it('strength: minutes + sets', () => expect(doneRowMeta(card({}), { setsCompleted: 18 })).toBe('42 דק׳ · 18 סטים'));
  it('run: minutes + km (one decimal)', () =>
    expect(doneRowMeta(card({ category: 'cardio', workoutType: 'running', minutes: 35 }), { distance: 5.234 })).toBe('35 דק׳ · 5.2 ק״מ'));
  it('strength ignores a stray distance', () => expect(doneRowMeta(card({}), { distance: 3 })).toBe('42 דק׳'));
  it('no doc data → minutes only', () => expect(doneRowMeta(card({}))).toBe('42 דק׳'));
  it('nothing real → null', () => expect(doneRowMeta(card({ minutes: 0 }), { distance: 0, setsCompleted: 0 })).toBeNull());
  it('steps card', () => expect(doneRowMeta(card({ category: 'steps', minutes: 0, stepsAchieved: 8400 }))).toBe('8,400 צעדים'));
});

describe('buildDoneWorkoutRows', () => {
  it('one row per workout, each with its own doc; steps not tappable', () => {
    const rows = buildDoneWorkoutRows(
      [
        card({ key: 'run', category: 'cardio', workoutType: 'running', minutes: 35 }),
        card({ key: 'str' }),
        card({ key: 'steps', category: 'steps', minutes: 0, stepsAchieved: 10000 }),
      ],
      [{ id: 'str', setsCompleted: 18 }, { id: 'run', distance: 5.2 }],
    );
    expect(rows.map((r) => r.meta)).toEqual(['35 דק׳ · 5.2 ק״מ', '42 דק׳ · 18 סטים', '10,000 צעדים']);
    expect(rows.map((r) => r.tappable)).toEqual([true, true, false]);
  });
  it('empty in → empty out', () => expect(buildDoneWorkoutRows([], [])).toEqual([]));
});
