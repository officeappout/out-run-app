import { describe, expect, it } from 'vitest';
import type { FeedPost } from '../../services/feed.service';
import { POST_RING_COLORS, postFromDone, postFromFeed, postKindOf, postKindOfDone } from '../post-model';

const base = { type: 'workout', activityCategory: 'cardio', durationMinutes: 25, activityCredit: 25 } as unknown as FeedPost;
const keys = (p: { rings: { key: string }[] }) => p.rings.map((r) => r.key);

describe('postKindOf (feed)', () => {
  it('hybrid parts → combined, cardio walk → walk, cardio → run, else strength', () => {
    expect(postKindOf({ ...base, hybridParts: { runKm: 0, walkKm: 2, runMinutes: 0, walkMinutes: 20, strengthMinutes: 10, strengthSets: 6 } })).toBe('combined');
    expect(postKindOf({ ...base, activityType: 'walking' })).toBe('walk');
    expect(postKindOf(base)).toBe('run');
    expect(postKindOf({ ...base, activityCategory: 'strength' })).toBe('strength');
  });
});

describe('postFromFeed', () => {
  it('run: km · pace · time, the route kept, widget colours', () => {
    const p = postFromFeed({ ...base, distanceKm: 4.13, paceMinPerKm: 6.2167, routeShape: [0, 0, 10, 10, 20, 5] });
    expect(keys(p)).toEqual(['distance', 'pace', 'time']);
    expect(p.rings.map((r) => r.value)).toEqual(['4.1', '6:13', '25']);
    expect(p.rings[0].color).toBe(POST_RING_COLORS.distance);
    expect(p.route).toHaveLength(6);
  });
  it('ride: speed instead of pace', () => {
    expect(keys(postFromFeed({ ...base, activityType: 'cycling', distanceKm: 10, durationMinutes: 30 }))).toEqual(['distance', 'speed', 'time']);
  });
  it('walk: steps · km · time, never a pace ring', () => {
    const p = postFromFeed({ ...base, activityType: 'walking', distanceKm: 2.8, paceMinPerKm: 10, durationMinutes: 30 });
    expect(keys(p)).toEqual(['steps', 'distance', 'time']);
    expect(p.rings[0].value).toBe('3,640');
  });
  it('strength: sets only when every exercise is listed; exercises · time; no route', () => {
    const ex = [
      { name: 'a', sets: 3, setsDone: 3, unit: 'reps' as const },
      { name: 'b', sets: 3, setsDone: 2, unit: 'reps' as const },
    ];
    const p = postFromFeed({ ...base, activityCategory: 'strength', topExercises: ex, routeShape: [0, 0, 1, 1, 2, 2], levelIndex: 3, levelCount: 8 });
    expect(keys(p)).toEqual(['sets', 'exercises', 'time']);
    expect(p.rings[0]).toMatchObject({ value: '5', pct: 83 });
    expect(p.route).toBe(null);
    expect(p.level).toEqual({ index: 3, count: 8 });
    expect(keys(postFromFeed({ ...base, activityCategory: 'strength', topExercises: ex, moreExercises: 2 }))).toEqual(['exercises', 'time']);
  });
  it('combined: walk km · sets · total', () => {
    const p = postFromFeed({ ...base, hybridParts: { runKm: 0, walkKm: 2.2, runMinutes: 0, walkMinutes: 22, strengthMinutes: 8, strengthSets: 8 }, durationMinutes: 30 });
    expect(keys(p)).toEqual(['walk', 'sets', 'total']);
  });
  it('missing values drop their ring', () => {
    expect(keys(postFromFeed({ ...base, durationMinutes: 0 }))).toEqual([]);
  });
});

describe('postFromDone (home carousel)', () => {
  it('kinds from the saved workout', () => {
    expect(postKindOfDone({ category: 'cardio', workoutType: 'hybrid' })).toBe('combined');
    expect(postKindOfDone({ category: 'steps' })).toBe('walk');
    expect(postKindOfDone({ category: 'cardio', workoutType: 'walking' })).toBe('walk');
    expect(postKindOfDone({ category: 'cardio', workoutType: 'running' })).toBe('run');
    expect(postKindOfDone({ category: 'strength' })).toBe('strength');
  });
  it('run: km · pace · time from the doc; the note is the achievement line', () => {
    const p = postFromDone({ category: 'cardio', workoutType: 'running', title: 'Run', distance: 4.1, pace: 6.2, duration: 1530, note: 'n' });
    expect(keys(p)).toEqual(['distance', 'pace', 'time']);
    expect(p.achievement).toBe('n');
  });
  it('steps goal: steps only', () => {
    expect(keys(postFromDone({ category: 'steps', title: 'Steps', stepsAchieved: 8000 }))).toEqual(['steps']);
  });
  it('strength: sets · time', () => {
    expect(keys(postFromDone({ category: 'strength', title: 'S', setsCompleted: 8, minutes: 18 }))).toEqual(['sets', 'time']);
  });
});
