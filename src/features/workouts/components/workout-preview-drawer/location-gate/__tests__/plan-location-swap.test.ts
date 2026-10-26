import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));

import { planLocationSwap, type SwapPlanDeps } from '../plan-location-swap';

const VIDEO = { media: { mainVideoUrl: 'https://cdn/v.mp4' } };
const NO_MEDIA = { media: {} };

const exercise = (id: string, over: Record<string, unknown> = {}): any => ({
  id, name: { he: id }, primaryMuscle: 'chest', movementGroup: 'push', base_movement_id: 'fam', type: 'reps',
  targetPrograms: [{ programId: 'push', level: 5 }],
  execution_methods: [{ location: 'park', ...VIDEO }],
  ...over,
});
const entry = (id: string, over: Record<string, unknown> = {}, exOver: Record<string, unknown> = {}): any => ({
  exercise: exercise(id, exOver), method: { location: 'park', ...VIDEO }, mechanicalType: 'bent_arm',
  sets: 3, reps: 10, isTimeBased: false, restSeconds: 60, priority: 'compound', score: 1, reasoning: [],
  programLevel: 5, exerciseRole: 'main', ...over,
});

/** Fake deps: `home` methods by exercise id, replacements by original id. */
function deps(opts: {
  homeMethod?: Record<string, any>;
  replacements?: Record<string, Array<{ ex: any; level: number; method?: any }>>;
  pool?: any[];
}): SwapPlanDeps {
  const home = opts.homeMethod ?? {};
  return {
    pool: opts.pool ?? [],
    hasLocation: (ex) => ex.id in home,
    selectMethod: (ex) => home[ex.id] ?? null,
    findCandidates: async (we, rules, exclude, filter) =>
      (opts.replacements?.[we.exercise.id] ?? [])
        .filter((r) => !exclude.has(r.ex.id) && filter({ exercise: r.ex, method: r.method ?? { location: 'home', ...VIDEO }, level: r.level }))
        .map((r) => ({
          exercise: r.ex,
          selectedExecutionMethod: r.method ?? { location: 'home', ...VIDEO },
          levelComparison: r.level === rules.level ? 'same' : r.level < rules.level ? 'lower' : 'higher',
          resolvedLevel: r.level,
        })) as any,
  };
}

describe('planLocationSwap', () => {
  it('own method with a video swaps in place and counts as resolved', async () => {
    const plan = await planLocationSwap([entry('a'), entry('b')], 'home', deps({ homeMethod: { a: { location: 'home', ...VIDEO }, b: { location: 'home', media: { imageUrl: 'https://cdn/i.jpg' } } } }));
    expect(plan.counts).toMatchObject({ swappedMethod: 2, swappedExercise: 0, keptMarked: 0 });
    expect(plan.coverage.allowed).toBe(true);
    expect(plan.entries.every((e) => e.exerciseRole === 'main')).toBe(true);
  });

  it('a home method without any media is NOT used: the slot is replaced instead', async () => {
    const repl = exercise('r');
    const plan = await planLocationSwap([entry('a')], 'home', deps({
      homeMethod: { a: { location: 'home', ...NO_MEDIA } },
      replacements: { a: [{ ex: repl, level: 5 }] },
    }));
    expect(plan.entries[0].exercise.id).toBe('r');
    expect(plan.systemSwaps).toHaveLength(1);
    expect(plan.counts.swappedExercise).toBe(1);
  });

  it('never swaps to a media-less method: unresolved main is kept, marked and uncovered', async () => {
    const plan = await planLocationSwap([entry('a')], 'home', deps({ homeMethod: { a: { location: 'home', ...NO_MEDIA } } }));
    expect(plan.entries[0].exercise.id).toBe('a');
    expect((plan.entries[0] as any).dimensionUnavailable).toEqual({ dimension: 'location', value: 'home' });
    expect(plan.slots[0].resolved).toBe(false);
  });

  it('a replacement already used by an earlier slot is not reused', async () => {
    const repl = exercise('r');
    const plan = await planLocationSwap([entry('a'), entry('b')], 'home', deps({
      replacements: { a: [{ ex: repl, level: 5 }], b: [{ ex: repl, level: 5 }] },
    }));
    expect(plan.entries[0].exercise.id).toBe('r');
    expect(plan.entries[1].exercise.id).toBe('b'); // kept, uncovered
    expect(plan.slots.map((s) => s.resolved)).toEqual([true, false]);
  });

  it('a candidate that is already in the workout is excluded', async () => {
    const plan = await planLocationSwap([entry('a'), entry('b')], 'home', deps({
      replacements: { a: [{ ex: exercise('b'), level: 5 }] },
    }));
    expect(plan.entries[0].exercise.id).toBe('a');
  });

  it('goal/skill slot without a same-level family member is uncovered and disables the switch', async () => {
    const goal = entry('skill', { isGoalExercise: true });
    const plan = await planLocationSwap(
      [entry('a'), entry('b'), entry('c'), goal],
      'home',
      deps({
        homeMethod: { a: { location: 'home', ...VIDEO }, b: { location: 'home', ...VIDEO }, c: { location: 'home', ...VIDEO } },
        replacements: { skill: [{ ex: exercise('easier'), level: 4 }] },
      }),
    );
    expect(plan.coverage).toMatchObject({ allowed: false, reason: 'pinnedUncovered' });
  });

  it('one level easier is used for a non-pinned slot only when no same-level exists', async () => {
    const plan = await planLocationSwap([entry('a')], 'home', deps({
      replacements: { a: [{ ex: exercise('easier'), level: 4 }, { ex: exercise('same'), level: 5 }] },
    }));
    expect(plan.entries[0].exercise.id).toBe('same');
    const plan2 = await planLocationSwap([entry('a')], 'home', deps({
      replacements: { a: [{ ex: exercise('easier'), level: 4 }] },
    }));
    expect(plan2.entries[0].exercise.id).toBe('easier');
  });

  it('unresolved warm-up and cool-down never block the switch; they are omitted (collapse-guard restores a lone one)', async () => {
    const warm = entry('w', { exerciseRole: 'warmup' });
    const cool = entry('c', { exerciseRole: 'cooldown' });
    const mains = ['a', 'b', 'c2', 'd'].map((id) => entry(id));
    const home = Object.fromEntries(['a', 'b', 'c2', 'd'].map((id) => [id, { location: 'home', ...VIDEO }]));
    const plan = await planLocationSwap([warm, ...mains, cool], 'home', deps({ homeMethod: home }));
    expect(plan.slots.filter((s) => s.kind !== 'main' && !s.resolved)).toHaveLength(2);
    expect(plan.coverage.ratio).toBe(1);
    expect(plan.coverage).toMatchObject({ allowed: true, reason: null });
    // collapse guard: each role block still has its (restored) exercise
    expect(plan.entries.filter((e) => e.exerciseRole === 'warmup')).toHaveLength(1);
    expect(plan.entries.filter((e) => e.exerciseRole === 'cooldown')).toHaveLength(1);
  });

  it('a follow-along guide that does not cover the location is re-picked from the pool, with media', async () => {
    const guide = exercise('g', { isFollowAlong: true, execution_methods: [{ location: 'park', ...VIDEO }] });
    const homeGuide = exercise('hg', { isFollowAlong: true, exerciseRole: 'warmup', execution_methods: [{ location: 'home', ...VIDEO }] });
    const plan = await planLocationSwap([entry('g', { exerciseRole: 'warmup' }, { isFollowAlong: true })], 'home', deps({
      pool: [homeGuide],
      homeMethod: { hg: { location: 'home', ...VIDEO } },
    }));
    expect(plan.entries[0].exercise.id).toBe('hg');
    expect(plan.slots[0].resolved).toBe(true);
    void guide;
  });

  it('a follow-along re-pick never takes a guide of another role (recovery session) or a test doc', async () => {
    const recovery = exercise('rec', { isFollowAlong: true, exerciseRole: 'recovery', execution_methods: [{ location: 'home', ...VIDEO }] });
    const testDoc = exercise('t', { name: { he: 'חימום לבדיקה' }, isFollowAlong: true, exerciseRole: 'warmup', execution_methods: [{ location: 'home', ...VIDEO }] });
    const plan = await planLocationSwap([entry('g', { exerciseRole: 'warmup' }, { isFollowAlong: true })], 'home', deps({
      pool: [recovery, testDoc],
      homeMethod: { rec: { location: 'home', ...VIDEO }, t: { location: 'home', ...VIDEO } },
    }));
    expect(plan.entries[0].exercise.id).toBe('g'); // kept as-is
  });

  it('home -> park: the cool-down stretches become the park cool-down video (one slot), switch allowed', async () => {
    const video = exercise('cv', {
      name: { he: 'שחרור פלג גוף עליון' }, isFollowAlong: true, exerciseRole: 'cooldown', type: 'time',
      execution_methods: [{ location: 'park', locationMapping: ['park', 'street'], media: { mainVideoUrl: 'https://youtu.be/x', videoDurationSeconds: 210 } }],
    });
    const stretch = (id: string) => entry(id, { exerciseRole: 'cooldown', isTimeBased: true, reps: 30 }, { type: 'time' });
    const mains = ['a', 'b', 'c'].map((id) => entry(id));
    const park = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, { location: 'park', ...VIDEO }]));
    const plan = await planLocationSwap([...mains, stretch('s1'), stretch('s2'), stretch('s3')], 'park', deps({ homeMethod: park, pool: [video] }));
    const cool = plan.entries.filter((e) => e.exerciseRole === 'cooldown');
    expect(cool).toHaveLength(1);
    expect(cool[0].exercise.id).toBe('cv');
    expect(plan.coverage.allowed).toBe(true);
  });

  it('no cool-down video at the location: stretches go through the normal ladder', async () => {
    const parkOnly = exercise('cv', { isFollowAlong: true, exerciseRole: 'cooldown', execution_methods: [{ location: 'park', ...VIDEO }] });
    const plan = await planLocationSwap([entry('a'), entry('s1', { exerciseRole: 'cooldown' })], 'home', deps({
      homeMethod: { a: { location: 'home', ...VIDEO }, s1: { location: 'home', ...VIDEO } },
      pool: [parkOnly],
    }));
    expect(plan.entries.map((e) => e.exercise.id)).toEqual(['a', 's1']);
  });

  it('pyramids are out of scope: kept, marked, not counted in coverage', async () => {
    const pyr = entry('p', { pyramidSequence: [{}, {}] });
    const plan = await planLocationSwap([pyr], 'home', deps({}));
    expect(plan.slots).toHaveLength(0);
    expect(plan.counts.keptMarked).toBe(1);
    expect(plan.coverage.allowed).toBe(true);
  });

  it('heals superset links to a replaced partner', async () => {
    const a = entry('a', { pairedWith: 'b' });
    const b = entry('b', { pairedWith: 'a' });
    const plan = await planLocationSwap([a, b], 'home', deps({ replacements: { b: [{ ex: exercise('r'), level: 5 }] } }));
    expect(plan.entries[0].pairedWith).toBe('r');
  });
});
