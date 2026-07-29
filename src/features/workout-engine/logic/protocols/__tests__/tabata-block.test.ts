import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTabataBlock, partitionByTabataBlock } from '../tabata.block';
import { TABATA_CLASSIC, TABATA_BLOCK_SECONDS } from '../tabata.constants';
import { calculateEstimatedDuration } from '../../workout-budgeting.utils';
import { enforceVolumeCap } from '@/features/workout-engine/core/presentation/PresentationFormatter';
import type { WorkoutExercise } from '../../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// Raw pool exercise (as loaded from Firestore) for the pool-injection path.
const poolEx = (id: string, level?: number, symmetry: 'bilateral' | 'unilateral' = 'bilateral'): Exercise =>
  ({
    id,
    name: { he: id },
    symmetry,
    movementGroup: 'squat',
    tags: ['hiit_friendly'],
    targetPrograms: level != null ? [{ programId: 'p', level }] : [], // level-less = []
  } as unknown as Exercise);

const mainEx = (id: string, score: number, over: Record<string, unknown> = {}): WorkoutExercise => {
  const ex = {
    exercise: { id, name: { he: id }, movementGroup: 'horizontal_push', secondsPerRep: 3, symmetry: 'bilateral' },
    exerciseRole: 'main',
    sets: 3,
    reps: 8,
    restSeconds: 120,
    isTimeBased: false,
    score,
    priority: 'compound',
    tier: 'match',
    reasoning: [],
    ...over,
  } as Record<string, any>;
  // Every mock defaults into the tabata pool (hiit_friendly) unless a test sets
  // tags explicitly — mirrors the 109 tagged exercises in prod.
  if (!ex.exercise.tags) ex.exercise = { ...ex.exercise, tags: ['hiit_friendly'] };
  return ex as never;
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('buildTabataBlock', () => {
  it('picks the top-scored ≤4 non-elite mains, stamps them, returns classic config', () => {
    const exs = [
      mainEx('a', 50), mainEx('b', 90), mainEx('c', 70),
      mainEx('elite-1', 99, { tier: 'elite' }), // excluded: elite
      mainEx('d', 60), mainEx('e', 40),
      mainEx('warm', 80, { exerciseRole: 'warmup' }), // excluded: not main
    ];
    const block = buildTabataBlock('tabata', exs, {});
    expect(block).toBeDefined();
    expect(block!.config).toEqual(TABATA_CLASSIC);
    expect(block!.exerciseIds).toEqual(['b', 'c', 'd', 'a']); // score desc, max 4
    for (const id of block!.exerciseIds) {
      const member = exs.find((e) => e.exercise.id === id)!;
      expect(member.protocolBlock).toBe('tabata');
    }
    expect(exs.find((e) => e.exercise.id === 'elite-1')!.protocolBlock).toBeUndefined();
    expect(exs.find((e) => e.exercise.id === 'e')!.protocolBlock).toBeUndefined();
  });

  it('returns undefined (stamping nothing) when setType is not tabata', () => {
    const exs = [mainEx('a', 50), mainEx('b', 60)];
    expect(buildTabataBlock('straight', exs, {})).toBeUndefined();
    expect(exs.every((e) => !e.protocolBlock)).toBe(true);
  });

  it('blast intent takes precedence — no block', () => {
    const exs = [mainEx('a', 50), mainEx('b', 60)];
    expect(buildTabataBlock('tabata', exs, { intentMode: 'blast' })).toBeUndefined();
    expect(exs.every((e) => !e.protocolBlock)).toBe(true);
  });

  it('fewer than 2 eligible mains → undefined (caller reverts to straight)', () => {
    expect(buildTabataBlock('tabata', [mainEx('a', 50)], {})).toBeUndefined();
    expect(buildTabataBlock('tabata', [mainEx('a', 50), mainEx('b', 60, { tier: 'elite' })], {})).toBeUndefined();
  });

  it("ELIGIBILITY (David 12.07): max-effort skills are OUT via the engine's isometric cap", () => {
    // Corpus-faithful shapes: planche is spelled פלאנץ׳ and filed under
    // horizontal_push; one-arm holds are mislabeled bilateral — only the
    // name heuristic in getIsometricTimeCap catches them (cap 15 < 20).
    const planche = mainEx('planche-tuck', 95, {
      isTimeBased: true,
      exercise: { id: 'planche-tuck', name: { he: 'פלאנץ׳ בטאק' }, movementGroup: 'horizontal_push', symmetry: 'bilateral' },
    });
    const frontLeverRaise = mainEx('fl-raise', 90, {
      exercise: { id: 'fl-raise', name: { he: 'הרמות פרונט לבר' }, movementGroup: 'horizontal_pull', symmetry: 'bilateral' },
    });
    const oneArmHold = mainEx('oa-90', 85, {
      isTimeBased: true,
      exercise: { id: 'oa-90', name: { he: 'החזקת מתח יד אחת ב-90°' }, movementGroup: 'vertical_pull', symmetry: 'bilateral' },
    });
    const plank = mainEx('plank', 60, {
      isTimeBased: true,
      tier: 'easy',
      exercise: { id: 'plank', name: { he: 'פלאנק' }, movementGroup: 'core', symmetry: 'bilateral' },
    });
    const pushups = mainEx('pushups', 55, {
      exercise: { id: 'pushups', name: { he: 'שכיבות סמיכה' }, movementGroup: 'horizontal_push', symmetry: 'bilateral' },
    });

    const block = buildTabataBlock('tabata', [planche, frontLeverRaise, oneArmHold, plank, pushups], {});
    expect(block).toBeDefined();
    // The three skills are OUT despite outscoring everyone; plank+pushups IN.
    expect(block!.exerciseIds.sort()).toEqual(['plank', 'pushups']);
  });

  it('ELIGIBILITY: a hard-tier HOLD is out (5-10s prescription), hard-tier REPS stay in', () => {
    const hardHold = mainEx('hard-hold', 90, {
      isTimeBased: true, tier: 'hard',
      exercise: { id: 'hard-hold', name: { he: 'החזקת ליבה' }, movementGroup: 'core', symmetry: 'bilateral' },
    });
    const hardReps = mainEx('hard-reps', 80, { tier: 'hard' });
    const easyA = mainEx('easy-a', 70);
    const block = buildTabataBlock('tabata', [hardHold, hardReps, easyA], {});
    expect(block).toBeDefined();
    expect(block!.exerciseIds.sort()).toEqual(['easy-a', 'hard-reps']);
  });

  it('ELIGIBILITY (David 25.07): untagged mains (not hiit_friendly) are OUT', () => {
    const untagged = mainEx('b', 80, {
      exercise: { id: 'b', name: { he: 'b' }, movementGroup: 'squat', symmetry: 'bilateral', tags: [] },
    });
    // one tagged + one untagged → only 1 eligible → no block
    expect(buildTabataBlock('tabata', [mainEx('a', 90), untagged], {})).toBeUndefined();
    // both tagged → block forms
    expect(buildTabataBlock('tabata', [mainEx('a', 90), mainEx('b', 80)], {})).toBeDefined();
  });

  it('ELIGIBILITY (David 25.07): over-level mains are OUT; level-less passes (default IN)', () => {
    const over = mainEx('b', 95, { isOverLevel: true });
    expect(buildTabataBlock('tabata', [mainEx('a', 90), over], {})).toBeUndefined(); // only 1 at-level
    // isOverLevel absent ⇒ level-less pool entry passes
    expect(buildTabataBlock('tabata', [mainEx('a', 90), mainEx('c', 70)], {})).toBeDefined();
  });

  it('COMPOSITION: interval costs must tile rounds — unilateral counts double', () => {
    const uni = (id: string, score: number) =>
      mainEx(id, score, { exercise: { id, name: { he: id }, movementGroup: 'core', symmetry: 'unilateral' } });

    // [bi(90), uni(80), bi(70)]: best subset = all three (cycle cost 4 | 8).
    const b1 = buildTabataBlock('tabata', [mainEx('a', 90), uni('u', 80), mainEx('b', 70)], {});
    expect(b1!.exerciseIds.sort()).toEqual(['a', 'b', 'u']);

    // [bi(90), uni(80)] alone: cycle cost 3 ∤ 8 and no smaller valid subset → revert.
    expect(buildTabataBlock('tabata', [mainEx('a', 90), uni('u', 80)], {})).toBeUndefined();

    // Two unilaterals: cycle cost 4 | 8 → valid pair.
    const b2 = buildTabataBlock('tabata', [uni('u1', 90), uni('u2', 80)], {});
    expect(b2!.exerciseIds.sort()).toEqual(['u1', 'u2']);
  });
});

describe('partitionByTabataBlock (mapper side)', () => {
  const ui = (id: string) => ({ id, name: id });

  it('splits by exerciseIds, order preserved on both sides', () => {
    const mains = [ui('a'), ui('b'), ui('c'), ui('d')];
    const { tabata, rest } = partitionByTabataBlock(mains, {
      config: TABATA_CLASSIC, exerciseIds: ['b', 'd'],
    });
    expect(tabata.map((e) => e.id)).toEqual(['b', 'd']);
    expect(rest.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('no block → everything stays in rest', () => {
    const mains = [ui('a'), ui('b')];
    expect(partitionByTabataBlock(mains, undefined)).toEqual({ tabata: [], rest: mains });
  });

  it('degenerate block (<2 survivors after swap) dissolves back into main', () => {
    const mains = [ui('a'), ui('swapped-in')];
    const { tabata, rest } = partitionByTabataBlock(mains, {
      config: TABATA_CLASSIC, exerciseIds: ['a', 'gone-after-swap'],
    });
    expect(tabata).toEqual([]);
    expect(rest.map((e) => e.id)).toEqual(['a', 'swapped-in']);
  });
});

describe('duration pricing — block is a fixed constant', () => {
  it('members cost (work+rest)×rounds once, NOT sets×reps×rest each', () => {
    // Two heavy mains as straight sets: 2 × (3×8×3s + 3×120s) = 864s ≈ 15min
    const straight = [mainEx('a', 50), mainEx('b', 60)];
    const straightMin = calculateEstimatedDuration(straight);

    // The same two as tabata members: fixed 240s = 4min + no per-set math
    const blocked = [
      mainEx('a', 50, { protocolBlock: 'tabata' }),
      mainEx('b', 60, { protocolBlock: 'tabata' }),
    ];
    const blockedMin = calculateEstimatedDuration(blocked);

    expect(blockedMin).toBe(Math.ceil(TABATA_BLOCK_SECONDS / 60)); // 4
    expect(straightMin).toBeGreaterThan(blockedMin + 8); // per-set math is gone
  });

  it('block + straight mains: block adds exactly its fixed cost + one transition unit', () => {
    const straightOnly = [mainEx('a', 50), mainEx('b', 60)];
    const withBlock = [
      mainEx('a', 50), mainEx('b', 60),
      mainEx('t1', 70, { protocolBlock: 'tabata' }),
      mainEx('t2', 80, { protocolBlock: 'tabata' }),
    ];
    const delta = calculateEstimatedDuration(withBlock) - calculateEstimatedDuration(straightOnly);
    // fixed 240s + one 30s transition into the block = 270s = 4.5 → ±rounding
    expect(delta).toBeGreaterThanOrEqual(4);
    expect(delta).toBeLessThanOrEqual(5);
  });
});

describe('volume guard — block members are untouchable', () => {
  it('Phases A/B/C never remove or trim block members even at an impossible cap', () => {
    const workout = {
      exercises: [
        mainEx('t1', 10, { protocolBlock: 'tabata' }), // lowest scores — prime drop targets
        mainEx('t2', 20, { protocolBlock: 'tabata' }),
        mainEx('s1', 90), mainEx('s2', 80), mainEx('s3', 70),
      ],
      estimatedDuration: 0,
      totalPlannedSets: 0,
    } as never;
    const result = enforceVolumeCap(workout, { durationCap: 5 }) as {
      exercises: Array<{ exercise: { id: string }; protocolBlock?: string; sets: number }>;
    };
    const members = result.exercises.filter((e) => e.protocolBlock === 'tabata');
    expect(members.map((e) => e.exercise.id).sort()).toEqual(['t1', 't2']); // survived
    expect(members.every((e) => e.sets === 3)).toBe(true); // sets untouched (Phase B skip)
  });
});

describe('buildTabataBlock — pool-injection (David 25.07)', () => {
  it('selects conditioning members from the dedicated pool and INJECTS them as a finisher', () => {
    const target = [mainEx('strength1', 50), mainEx('strength2', 60)];
    const before = target.length;
    const pool = [poolEx('burpee', 2), poolEx('squat-jump', 3), poolEx('crawl', 1), poolEx('bicycle', 1)];
    const block = buildTabataBlock('tabata', target, { tabataPool: pool, userLevel: 4 });

    expect(block).toBeDefined();
    expect(block!.config).toEqual(TABATA_CLASSIC);
    // members ADDED (finisher), all sourced from the pool, stamped protocolBlock
    expect(target.length).toBeGreaterThan(before);
    const injected = target.filter((e) => e.protocolBlock === 'tabata');
    expect(injected.length).toBe(block!.exerciseIds.length);
    expect(injected.every((e) => pool.some((p) => p.id === e.exercise.id))).toBe(true);
    // original strength mains untouched (added, not replaced)
    expect(target.filter((e) => !e.protocolBlock).map((e) => e.exercise.id).sort())
      .toEqual(['strength1', 'strength2']);
  });

  it('LEVEL: over-level pool members excluded; level-less gems default IN', () => {
    // one level-less gem (→1, IN) + one over-level (L9 > 4, OUT) ⇒ <2 eligible ⇒ revert
    const t1: WorkoutExercise[] = [];
    expect(buildTabataBlock('tabata', t1, {
      tabataPool: [poolEx('gem-burpee'), poolEx('too-hard', 9)],
      userLevel: 4,
    })).toBeUndefined();
    expect(t1.length).toBe(0); // nothing injected on revert

    // two level-less gems (both →1, IN) ⇒ block forms FROM the gems — the exact
    // behaviour that keeps burpees/crawls reachable for any user.
    const t2: WorkoutExercise[] = [];
    const block = buildTabataBlock('tabata', t2, {
      tabataPool: [poolEx('gem-burpee'), poolEx('gem-crawl')],
      userLevel: 4,
    });
    expect(block).toBeDefined();
    expect(t2.filter((e) => e.protocolBlock === 'tabata').map((e) => e.exercise.id).sort())
      .toEqual(['gem-burpee', 'gem-crawl']);
  });

  it('empty / too-small pool → undefined (revert to straight), nothing injected', () => {
    const t: WorkoutExercise[] = [mainEx('s', 50)];
    expect(buildTabataBlock('tabata', t, { tabataPool: [], userLevel: 4 })).toBeUndefined();
    expect(buildTabataBlock('tabata', t, { tabataPool: [poolEx('lonely', 1)], userLevel: 4 })).toBeUndefined();
    expect(t.filter((e) => e.protocolBlock === 'tabata').length).toBe(0);
  });
});

// ── Method resolution on the injected members (David 29.07) ────────────────
// The pool is raw Firestore data that never passed the ContextualEngine, so the
// block resolves each member's method itself. Before the fix members carried an
// empty `{}` and the media resolver fell back to executionMethods[0] — authored
// home-first — which rendered HOME images inside a PARK workout.
describe('buildTabataBlock — pool-injection method resolution', () => {
  /** Pool exercise with explicit authored methods (home first, park second —
   *  the real corpus ordering that caused the bug). */
  const poolExWithMethods = (
    id: string,
    methods: Array<Partial<{ location: string; methodName: string; equipmentIds: string[]; media: unknown }>>,
  ): Exercise =>
    ({
      id,
      name: { he: id },
      symmetry: 'bilateral',
      movementGroup: 'squat',
      tags: ['hiit_friendly'],
      targetPrograms: [],
      executionMethods: methods,
    } as unknown as Exercise);

  const homeThenPark = (id: string) =>
    poolExWithMethods(id, [
      { location: 'home', methodName: 'home', media: { imageUrl: `${id}-HOME.jpg` } },
      { location: 'park', methodName: 'park', media: { imageUrl: `${id}-PARK.jpg` } },
    ]);

  it('attaches the PARK method (not executionMethods[0] = home) at a park session', () => {
    const target: WorkoutExercise[] = [];
    const block = buildTabataBlock('tabata', target, {
      tabataPool: [homeThenPark('burpee'), homeThenPark('bicycle')],
      userLevel: 4,
      location: 'park',
      availableEquipment: [],
    });

    expect(block).toBeDefined();
    const injected = target.filter((e) => e.protocolBlock === 'tabata');
    expect(injected.length).toBeGreaterThanOrEqual(2);
    // THE REGRESSION LOCK: a real, park-tagged method — never the empty `{}`
    // that let the media resolver fall through to the home-first method.
    for (const m of injected) {
      expect(m.method).toBeTruthy();
      expect(Object.keys(m.method as object).length).toBeGreaterThan(0);
      expect((m.method as { location?: string }).location).toBe('park');
      expect((m.method as { media?: { imageUrl?: string } }).media?.imageUrl).toContain('-PARK');
    }
  });

  it('attaches the HOME method at a home session', () => {
    const target: WorkoutExercise[] = [];
    buildTabataBlock('tabata', target, {
      tabataPool: [homeThenPark('burpee'), homeThenPark('bicycle')],
      userLevel: 4,
      location: 'home',
      availableEquipment: [],
    });
    const injected = target.filter((e) => e.protocolBlock === 'tabata');
    expect(injected.length).toBeGreaterThanOrEqual(2);
    for (const m of injected) {
      expect((m.method as { location?: string }).location).toBe('home');
    }
  });

  it('drops location-gated members (park method needs absent gear) before composition', () => {
    // Gated: its ONLY park method requires gear the park does not have →
    // selectMethodForContext returns null → must not reach the block.
    const gated = poolExWithMethods('needs-trx', [
      { location: 'park', methodName: 'trx', equipmentIds: ['trx'], media: { imageUrl: 'trx-PARK.jpg' } },
    ]);
    const target: WorkoutExercise[] = [];
    const block = buildTabataBlock('tabata', target, {
      tabataPool: [homeThenPark('burpee'), homeThenPark('bicycle'), gated],
      userLevel: 4,
      location: 'park',
      availableEquipment: [],
    });

    expect(block).toBeDefined();
    expect(block!.exerciseIds).not.toContain('needs-trx');
    expect(target.some((e) => e.exercise.id === 'needs-trx')).toBe(false);
  });

  it('too few survivors after gating → undefined (revert to straight), nothing injected', () => {
    const gated = (id: string) =>
      poolExWithMethods(id, [{ location: 'park', methodName: 'trx', equipmentIds: ['trx'] }]);
    const target: WorkoutExercise[] = [];
    expect(
      buildTabataBlock('tabata', target, {
        tabataPool: [homeThenPark('burpee'), gated('g1'), gated('g2')],
        userLevel: 4,
        location: 'park',
        availableEquipment: [],
      }),
    ).toBeUndefined();
    expect(target.length).toBe(0);
  });
});
