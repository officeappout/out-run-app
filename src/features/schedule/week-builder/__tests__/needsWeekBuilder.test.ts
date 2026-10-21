import { describe, expect, it } from 'vitest';
import { isSplitWeek, needsWeekBuilder, shapeOfWeek, weekComplexity, type WeekShape } from '../needsWeekBuilder';
import { OPEN_SUN_FRI, run, strength, walk, week } from './fixtures';

const shape = (sessions: WeekShape['sessions'], trainingDays: number, split: WeekShape['split'] = null): WeekShape => ({ sessions, trainingDays, split });
const fb = { track: 'strength' as const, key: 'full_body' };

describe('needsWeekBuilder — simple', () => {
  it('full body ×3, one track → simple (the days picker is enough)', () => {
    expect(needsWeekBuilder(shape([fb, fb, fb], 3, 'full_body_ab'))).toBe(false);
  });
  it('full body ×2 with the basic split → simple', () => {
    expect(needsWeekBuilder(shape([fb, fb], 2, 'full_body_basic'))).toBe(false);
  });
  it('walks ×3 (one long walk is still a walk) → simple', () => {
    const w = week(OPEN_SUN_FRI, [[0, walk('a')], [2, { ...walk('b'), long: true }], [4, walk('c')]]);
    expect(needsWeekBuilder(shapeOfWeek(w))).toBe(false);
  });
  it('a beginner run week of three identical runs → simple', () => {
    const w = week(OPEN_SUN_FRI, [[0, run('a', 'easy_run')], [2, run('b', 'easy_run')], [4, run('c', 'easy_run')]]);
    expect(needsWeekBuilder(shapeOfWeek(w))).toBe(false);
  });
  it('4 short full-body days (habit builder) → simple', () => {
    expect(needsWeekBuilder(shape([fb, fb, fb, fb], 4, 'habit_builder'))).toBe(false);
  });
});

describe('needsWeekBuilder — complex', () => {
  it('upper / lower ×4 is a split', () => {
    expect(weekComplexity(shape([fb, fb, fb, fb], 4, 'upper_lower'))).toEqual(['split']);
  });
  it('push / pull / legs ×2 on 6 days → split + many days', () => {
    expect(weekComplexity(shape(Array(6).fill(fb), 6, 'push_pull_legs'))).toEqual(['split', 'many_days']);
  });
  it('a rotation split counts as a split', () => {
    expect(isSplitWeek('push_pull_rotation')).toBe(true);
    expect(isSplitWeek('skill_dominance')).toBe(true);
    expect(isSplitWeek('full_body_max')).toBe(false);
    expect(isSplitWeek(null)).toBe(false);
  });
  it('two skills (planche + front lever) → sessions differ', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'planche')], [2, strength('b', 'front_lever')], [4, strength('c', 'planche')]]);
    expect(weekComplexity(shapeOfWeek(w))).toEqual(['mixed_sessions']);
  });
  it('a run week with quality / easy / long → sessions differ', () => {
    const w = week(OPEN_SUN_FRI, [[0, run('a', 'quality_primary')], [2, run('b', 'easy_run')], [4, run('c', 'long_run')]]);
    expect(needsWeekBuilder(shapeOfWeek(w))).toBe(true);
  });
  it('strength + run → two tracks', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')], [2, run('b', 'easy_run')]]);
    expect(weekComplexity(shapeOfWeek(w))).toEqual(['two_tracks']);
  });
  it('walks next to a (locked) strength week → walk with another track', () => {
    const w = week(OPEN_SUN_FRI, [[0, { ...strength('a', 'full_body'), locked: true }], [1, walk('b')], [3, walk('c')]]);
    expect(weekComplexity(shapeOfWeek(w))).toEqual(['walk_with_other']);
  });
  it('5 walks → many days', () => {
    const w = week(OPEN_SUN_FRI, [0, 1, 2, 3, 4].map((d) => [d, walk(`w${d}`)] as [number, ReturnType<typeof walk>]));
    expect(weekComplexity(shapeOfWeek(w))).toEqual(['many_days']);
  });
  it('aliases read as one workout (lower_body = legs)', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'legs')], [2, strength('b', 'lower_body')]]);
    expect(needsWeekBuilder(shapeOfWeek(w))).toBe(false);
  });
});
