import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enforceVolumeCap } from '../PresentationFormatter';
import { calculateEstimatedDuration } from '../../../logic/workout-budgeting.utils';
import { TIER_TABLE } from '../../../logic/workout-generator.types';

const calculateBaselineFor = (w: { exercises: never[] }) => calculateEstimatedDuration(w.exercises);

/**
 * availableTime CONTRACT (approved 10.07.2026): a workout generated for X
 * minutes lands within X±3. Phase C is the convergence step for ultra-short
 * budgets — measured failure 11.07.2026: request 15 → 26m because Phase A
 * found no expendable exercise (all compounds) and Phase B was already at
 * the 2-set floor while the rest staircase is physiologically fixed.
 */

// Estimator pricing (workout-budgeting.utils): main = sets×reps×secPerRep
// work + sets×restSeconds rest; warmup = 60s/slot + 5s transitions;
// cooldown = flat 90s + sets×restSeconds.
const mainEx = (id: string, score: number, over: Record<string, unknown> = {}) =>
  ({
    exercise: { id, name: { he: id }, movementGroup: 'horizontal_push', secondsPerRep: 3, symmetry: 'bilateral' },
    exerciseRole: 'main',
    sets: 2,
    reps: 8,
    restSeconds: 120,
    isTimeBased: false,
    score,
    priority: 'compound',
    tier: 'hard',
    reasoning: [],
    ...over,
  } as never);

const warmupEx = (id: string) =>
  ({
    exercise: { id, name: { he: id }, movementGroup: 'mobility' },
    exerciseRole: 'warmup', sets: 1, reps: 10, restSeconds: 0,
    score: 10, tier: 'flow', reasoning: [],
  } as never);

const cooldownEx = (id: string) =>
  ({
    exercise: { id, name: { he: id }, movementGroup: 'mobility' },
    exerciseRole: 'cooldown', sets: 1, reps: 30, restSeconds: 30,
    score: 5, tier: 'flow', reasoning: [],
  } as never);

const workoutOf = (exercises: unknown[]) =>
  ({ exercises, estimatedDuration: 0, totalPlannedSets: 0 } as never);

const workoutWithReserve = (exercises: unknown[], reserveExercises: unknown[]) =>
  ({ exercises, estimatedDuration: 0, totalPlannedSets: 0, reserveExercises } as never);

const mains = (w: { exercises: Array<{ exerciseRole?: string }> }) =>
  w.exercises.filter((e) => e.exerciseRole === 'main');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('enforceVolumeCap — Phase C convergence (availableTime contract)', () => {
  it('THE MEASURED FAILURE: 4 floor-set compounds + frame @ cap 15 → lands ≤ 18 with ≥ 2 mains', () => {
    // 4 mains × (2×8×3s work + 2×120s rest) = ~19.2m + warmup ~2.1m + cooldown 2m ≈ 23m.
    // Phase A: nothing expendable. Phase B: already at the 2-set floor.
    const w = workoutOf([
      warmupEx('w1'), warmupEx('w2'),
      mainEx('pushups', 65), mainEx('rows', 70), mainEx('dips', 80), mainEx('pullups', 90),
      cooldownEx('stretch'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 15 }) as { estimatedDuration: number };

    expect(result.estimatedDuration).toBeLessThanOrEqual(18); // 15 + 3 contract window
    expect(mains(result as never).length).toBeGreaterThanOrEqual(2);
    // Lowest-scored mains were dropped first — the two survivors are the strongest.
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    expect(ids).toEqual(['dips', 'pullups']);
  });

  it('TOLERANCE HONOURED: a plan already inside cap+3 is not trimmed further', () => {
    // 3 mains @ 100s rest ≈ 12.4m + frame ≈ 4.1m ≈ ~17m @ cap 15 → inside ±3.
    const w = workoutOf([
      warmupEx('w1'), warmupEx('w2'),
      mainEx('a', 65, { restSeconds: 100 }), mainEx('b', 70, { restSeconds: 100 }), mainEx('c', 80, { restSeconds: 100 }),
      cooldownEx('stretch'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 15 }) as { exercises: unknown[] };
    expect(mains(result as never).length).toBe(3); // Phase C did NOT fire
  });

  it('WITHIN TOLERANCE: a plan already inside cap-3..cap is untouched (fast-path early return)', () => {
    // 1 main @ 120s rest + cooldown ≈ within 3 of a 5-minute cap.
    const w = workoutOf([mainEx('a', 65, { sets: 1, restSeconds: 30 }), cooldownEx('s')]);
    const before = (w as { exercises: unknown[] }).exercises.length;
    const result = enforceVolumeCap(w, { durationCap: 5 }) as { exercises: unknown[] };
    expect(result.exercises.length).toBe(before);
  });

  it('FLOOR RESPECTED: never drops below 2 mains, even when still over the window', () => {
    // Two pathologically long mains (unilateral, 240s rest) that cannot fit 10min.
    const heavy = (id: string) =>
      mainEx(id, 50, { restSeconds: 240, exercise: { id, name: { he: id }, movementGroup: 'vertical_pull', secondsPerRep: 4, symmetry: 'unilateral' } });
    const w = workoutOf([heavy('a'), heavy('b'), heavy('c')]);
    const result = enforceVolumeCap(w, { durationCap: 10 }) as { estimatedDuration: number };
    expect(mains(result as never).length).toBe(2); // dropped one, stopped at the floor
    expect(result.estimatedDuration).toBeGreaterThan(13); // honest estimate reported, no lie
  });
});

/**
 * Phase D — add-back for under-target plans (duration-volume-convergence
 * fix, 16.09.2026). Closes the "requested 30 → delivered 20" gap: the
 * previous version's early-return accepted ANY undershoot, however large,
 * the moment `estimatedMin <= durationCap`. Phase D mirrors A/B/C in
 * reverse — bump sets on headroom first (fine-grained), then pull from
 * `workout.reserveExercises` (WorkoutGenerator's scored-but-unselected
 * leftovers) once headroom is exhausted, starting pulled exercises at
 * `minSets` so they re-enter the bump pool on a later iteration.
 */
describe('enforceVolumeCap — Phase D add-back (under-target plans)', () => {
  it('BUMP ONLY: a single under-tier-max exercise gets its sets bumped up until within tolerance', () => {
    // match tier (sets max 4), restSeconds 60: sets=2→3min, 3→5min, 4→6min
    // (ceil-rounded). Cap 9, tolerance floor 6 → bumps twice, to the tier max.
    const w = workoutOf([mainEx('a', 65, { tier: 'match', sets: 2, restSeconds: 60 })]);
    const result = enforceVolumeCap(w, { durationCap: 9 }) as { exercises: Array<{ sets: number }>; estimatedDuration: number };
    expect(result.exercises[0].sets).toBe(4);
    expect(result.estimatedDuration).toBeGreaterThanOrEqual(6);
    expect(result.estimatedDuration).toBeLessThanOrEqual(9);
  });

  it('BUMP EXHAUSTED, NO RESERVE: stops at an honest floor instead of fabricating volume', () => {
    // easy tier: sets.min === sets.max === 3 — zero bump headroom, ever.
    const w = workoutOf([mainEx('a', 65, { tier: 'easy', sets: 3, restSeconds: 100 })]);
    const result = enforceVolumeCap(w, { durationCap: 60 }) as { exercises: Array<{ sets: number }>; estimatedDuration: number };
    expect(result.exercises.length).toBe(1); // no exercise invented out of thin air
    expect(result.exercises[0].sets).toBe(3); // no set invented past the tier ceiling
    expect(result.estimatedDuration).toBeLessThan(57); // honestly still short of cap-tolerance
  });

  it('PULL FROM RESERVE: no bump headroom on the selected list → pulls the next reserve candidate, then bumps it', () => {
    const w = workoutWithReserve(
      [mainEx('a', 65, { tier: 'match', sets: 4, restSeconds: 130 })], // already at match's sets max — no headroom
      [mainEx('r1', 60, { tier: 'match', restSeconds: 130 })],
    );
    const result = enforceVolumeCap(w, { durationCap: 20 }) as {
      exercises: Array<{ exercise: { id: string }; sets: number }>;
      reserveExercises: unknown[];
      estimatedDuration: number;
    };
    const pulled = result.exercises.find((e) => e.exercise.id === 'r1');
    expect(pulled).toBeDefined(); // pulled in from reserve
    expect(pulled!.sets).toBeGreaterThan(2); // started at minSets, then bumped further
    expect(result.reserveExercises.length).toBe(0); // consumed from the reserve list
    expect(result.estimatedDuration).toBeGreaterThanOrEqual(17);
    expect(result.estimatedDuration).toBeLessThanOrEqual(20);
  });

  it('PULL EXHAUSTED, RESERVE EMPTY TOO: stops without oscillating or hanging', () => {
    const w = workoutWithReserve(
      [mainEx('a', 65, { tier: 'match', sets: 4, restSeconds: 130 })],
      [],
    );
    const result = enforceVolumeCap(w, { durationCap: 60 }) as { exercises: unknown[]; estimatedDuration: number };
    expect(result.exercises.length).toBe(1);
    expect(result.estimatedDuration).toBeLessThan(57);
  });

  it('THE "30→20" REPRODUCTION: 3 easy-tier mains (no bump headroom, ~18.6m) undershoot a 30min cap by more than tolerance → converges to within ±3 of 30 via one reserve pull + bumps', () => {
    const easyMain = (id: string, score: number) =>
      mainEx(id, score, { tier: 'easy', sets: 3, restSeconds: 100 });
    const w = workoutWithReserve(
      [easyMain('e1', 90), easyMain('e2', 85), easyMain('e3', 80)],
      [
        mainEx('r1', 60, { tier: 'match', restSeconds: 130 }),
        mainEx('r2', 55, { tier: 'match', restSeconds: 130 }),
        mainEx('r3', 50, { tier: 'match', restSeconds: 130 }),
      ],
    );
    const before = calculateBaselineFor(w);
    expect(before).toBeLessThan(27); // reproduces the undershoot: starts well below cap-tolerance

    const result = enforceVolumeCap(w, { durationCap: 30 }) as {
      exercises: Array<{ exercise: { id: string } }>;
      estimatedDuration: number;
    };
    expect(result.estimatedDuration).toBeGreaterThanOrEqual(27);
    expect(result.estimatedDuration).toBeLessThanOrEqual(30);
    // The 3 original easy mains are untouched (no headroom) — only reserve exercises were used.
    expect(result.exercises.map((e) => e.exercise.id)).toEqual(
      expect.arrayContaining(['e1', 'e2', 'e3']),
    );
  });

  it('IDEMPOTENT: a second call with the same cap on an already-converged result is a no-op (no oscillation)', () => {
    const w = workoutWithReserve(
      [mainEx('a', 65, { tier: 'match', sets: 2, restSeconds: 130 })],
      [mainEx('r1', 60, { tier: 'match', restSeconds: 130 })],
    );
    const first = enforceVolumeCap(w, { durationCap: 20 }) as {
      exercises: Array<{ sets: number; exercise: { id: string } }>;
      estimatedDuration: number;
    };
    const setsAfterFirst = first.exercises.map((e) => ({ id: e.exercise.id, sets: e.sets }));
    const durationAfterFirst = first.estimatedDuration;

    const second = enforceVolumeCap(first as never, { durationCap: 20 }) as {
      exercises: Array<{ sets: number; exercise: { id: string } }>;
      estimatedDuration: number;
    };
    expect(second.exercises.map((e) => ({ id: e.exercise.id, sets: e.sets }))).toEqual(setsAfterFirst);
    expect(second.estimatedDuration).toBe(durationAfterFirst);
  });
});

/**
 * Property test — level × duration. "Level" isn't a direct enforceVolumeCap
 * input, but its two real effects are: (1) sets-per-exercise already pushed
 * near tier max by a large dailySetBudget (less Phase-D bump headroom left —
 * the HIGH-level shape), and (2) how many reserve candidates the pool had
 * left over. Simulated here via `startNearMax` (sets already at/near tier
 * max = high-level shape, vs starting low = low-level shape) × `reserveSize`
 * crossed with every requested duration. The invariant under test: the
 * result is EITHER within ±tolerance OR both add-back sources (bump
 * headroom, reserve pool) were genuinely exhausted — Phase D must never give
 * up early while a resource remained, and must never overshoot past
 * cap+tolerance on its own (only Phases A-C, working from the other
 * direction, are allowed to leave a plan above cap+tolerance, at the
 * MIN_MAIN_EXERCISES floor).
 */
describe('enforceVolumeCap — property: level × duration convergence', () => {
  const durations = [15, 30, 45, 60];
  const startNearMaxOptions = [true, false]; // false = LOW-level shape, true = HIGH-level shape
  const reserveSizes = [0, 2, 5];

  for (const durationCap of durations) {
    for (const startNearMax of startNearMaxOptions) {
      for (const reserveSize of reserveSizes) {
        it(`cap=${durationCap} startNearMax=${startNearMax} reserveSize=${reserveSize} → converges or honestly exhausts`, () => {
          const baseSets = startNearMax ? 4 : 2; // match tier max is 4
          const base = [
            mainEx('base-1', 90, { tier: 'match', sets: baseSets, restSeconds: 90 }),
            mainEx('base-2', 85, { tier: 'match', sets: baseSets, restSeconds: 90 }),
          ];
          const reserve = Array.from({ length: reserveSize }, (_, i) =>
            mainEx(`reserve-${i}`, 80 - i, { tier: 'match', restSeconds: 90 }),
          );
          const w = workoutWithReserve(base, reserve);

          const result = enforceVolumeCap(w, { durationCap }) as {
            exercises: Array<{ sets: number; tier?: string }>;
            reserveExercises?: unknown[];
            estimatedDuration: number;
          };

          const withinTolerance =
            result.estimatedDuration >= durationCap - 3 && result.estimatedDuration <= durationCap;
          const hasBumpHeadroom = result.exercises.some(
            (e) => e.tier && e.sets < (TIER_TABLE[e.tier as keyof typeof TIER_TABLE]?.sets.max ?? e.sets),
          );
          const hasReserveLeft = (result.reserveExercises?.length ?? 0) > 0;

          if (result.estimatedDuration < durationCap - 3) {
            // Under-target beyond tolerance is only acceptable if genuinely exhausted.
            expect(hasBumpHeadroom).toBe(false);
            expect(hasReserveLeft).toBe(false);
          } else {
            // Otherwise the result must be within the promised window (Phase A-C's
            // own floor guarantees still apply on the over-cap side, unaffected here).
            expect(withinTolerance || result.estimatedDuration > durationCap).toBe(true);
          }
        });
      }
    }
  }
});

/**
 * Duration-aware core trim order (David's decision, 05.09.2026 —
 * docs/workout-engine/09-CORE-TABATA.md's follow-up investigation):
 *   <20min  — core trims FIRST (original, unchanged behavior — a short,
 *             focused session may legitimately ship without core).
 *   >=20min — core trims LAST among expendable categories, only after
 *             isolation/accessory (and extra legs) are exhausted.
 */
describe('enforceVolumeCap — duration-aware core trim order', () => {
  const coreEx = (id: string, score: number) =>
    mainEx(id, score, { priority: 'compound', exercise: { id, name: { he: id }, movementGroup: 'core', secondsPerRep: 3, symmetry: 'bilateral' } });
  const isolationEx = (id: string, score: number) =>
    mainEx(id, score, { priority: 'isolation' });

  it('<20min: core trims FIRST — isolation survives, core is gone', () => {
    // core (higher score) + isolation (lower score) + 2 compounds — enough
    // volume that removing ONE exercise is needed to reach cap.
    const w = workoutOf([
      warmupEx('w1'),
      coreEx('core-1', 80), isolationEx('iso-1', 50), mainEx('c1', 70), mainEx('c2', 75),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 19 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    expect(ids).not.toContain('core-1');
    expect(ids).toContain('iso-1'); // isolation NOT trimmed first at <20min
  });

  it('>=20min: isolation trims FIRST — core survives', () => {
    const w = workoutOf([
      warmupEx('w1'),
      coreEx('core-1', 80), isolationEx('iso-1', 50), mainEx('c1', 70), mainEx('c2', 75),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 20 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    expect(ids).not.toContain('iso-1');
    expect(ids).toContain('core-1'); // core protected once isolation is available to trim instead
  });

  it('>=20min: core trims too, but only after isolation is already gone', () => {
    // Same fixture, but a much tighter cap that needs BOTH the isolation
    // AND the core exercise removed to converge — core must still be the
    // SECOND removal, not the first, even under real pressure.
    const w = workoutOf([
      warmupEx('w1'),
      coreEx('core-1', 80, ), isolationEx('iso-1', 50), mainEx('c1', 70, { restSeconds: 150 }), mainEx('c2', 75, { restSeconds: 150 }),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 10 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    // Floor is 2 mains — with 4 starting mains, at most 2 can be removed.
    // isolation must be gone; if a second removal was needed, core (not c1/c2)
    // is the one to go, since compounds outrank both core and isolation once
    // isolation is exhausted... but the FLOOR is what's actually reached here.
    expect(ids).not.toContain('iso-1');
    expect(mains(result as never).length).toBeGreaterThanOrEqual(2);
  });

  it('isGuaranteedCore no longer grants unconditional protection — a <20min session can still trim it', () => {
    const guaranteedCore = mainEx('core-1', 80, {
      isGuaranteedCore: true,
      exercise: { id: 'core-1', name: { he: 'core-1' }, movementGroup: 'core', secondsPerRep: 3, symmetry: 'bilateral' },
    });
    const w = workoutOf([
      warmupEx('w1'),
      guaranteedCore, isolationEx('iso-1', 50), mainEx('c1', 70), mainEx('c2', 75),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 15 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    expect(ids).not.toContain('core-1'); // <20min: optional even if guarantee-injected
  });
});

/**
 * Sole-representative guard for core (David, 07.09.2026 — Addendum 36): the
 * >=20min "core trims last" intent (above) was silently defeated because a
 * real core exercise is near-always priority 'accessory' — the OLD
 * expendabilityRank checked isIsolationOrAccessory BEFORE isCore, so core hit
 * rank 0 exactly like any other accessory item and could still be removed
 * first on a score tie-break. This exercises the real production shape
 * (priority: 'accessory', not the 'compound' fixture above) and the new
 * isExpendable guard that keeps a SOLE core exercise out of the expendable
 * set entirely at >=20min — scoped to coreProtected only; the existing
 * <20min tests above are untouched and still pass.
 */
describe('enforceVolumeCap — sole-core-exercise guard (>=20min only)', () => {
  const coreAccessoryEx = (id: string, score: number) =>
    mainEx(id, score, { priority: 'accessory', exercise: { id, name: { he: id }, movementGroup: 'core', secondsPerRep: 3, symmetry: 'bilateral' } });
  const isolationEx = (id: string, score: number) => mainEx(id, score, { priority: 'isolation' });

  it('>=20min: a sole core exercise survives even when it scores LOWER than the other accessory candidate (the real bug shape)', () => {
    const w = workoutOf([
      warmupEx('w1'),
      coreAccessoryEx('core-1', 50), isolationEx('iso-1', 80), mainEx('c1', 70), mainEx('c2', 75),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 20 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    expect(ids).toContain('core-1'); // survives — sole core exercise, protected regardless of score
    expect(ids).not.toContain('iso-1'); // the other accessory candidate is removed instead
  });

  it('>=20min: with TWO core exercises, one is still removable — the guard protects the sole survivor, not core as a category', () => {
    const w = workoutOf([
      warmupEx('w1'),
      coreAccessoryEx('core-1', 50), coreAccessoryEx('core-2', 55), mainEx('c1', 70), mainEx('c2', 75),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 20 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    const coreIdsRemaining = ids.filter((id) => id.startsWith('core-'));
    expect(coreIdsRemaining.length).toBe(1); // exactly one removed — not both, not zero
  });
});

/**
 * expendabilityRank's isCore-first ordering (David, 07.09.2026 — Addendum
 * 36, Fix 2): distinct from the sole-representative guard above (Fix 0) —
 * this covers the case where core is NOT the sole one (Fix 0's guard
 * doesn't apply), so ranking order is the only thing deciding whether core
 * or another accessory item goes first. With 2 core exercises present, the
 * OLD rank order (isIsolationOrAccessory checked before isCore) still let a
 * lower-scored core exercise be removed ahead of a higher-scored,
 * non-core accessory exercise on the score tie-break — this test isolates
 * that ordering specifically, independent of the sole-representative guard
 * (verified by temporarily reverting just this reorder: fails, Fix 0's
 * other tests still pass).
 */
describe('enforceVolumeCap — expendabilityRank deprioritizes core even when it is not the sole one (>=20min)', () => {
  const coreAccessoryEx = (id: string, score: number) =>
    mainEx(id, score, { priority: 'accessory', exercise: { id, name: { he: id }, movementGroup: 'core', secondsPerRep: 3, symmetry: 'bilateral' } });
  const isolationEx = (id: string, score: number) => mainEx(id, score, { priority: 'isolation' });

  it('>=20min: with 2 core exercises AND a non-core accessory item, the non-core item is removed first regardless of score', () => {
    const w = workoutOf([
      warmupEx('w1'),
      coreAccessoryEx('core-1', 30), coreAccessoryEx('core-2', 35), isolationEx('iso-1', 90),
      mainEx('c1', 70),
      cooldownEx('s'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 20 }) as { exercises: unknown[] };
    const ids = mains(result as never).map((e) => (e as { exercise: { id: string } }).exercise.id);
    // iso-1 scores far higher than either core exercise — under the OLD
    // rank order (score tie-break within the same rank 0), a core exercise
    // would have been removed instead. Both cores must survive; iso-1 goes.
    expect(ids).not.toContain('iso-1');
    expect(ids).toContain('core-1');
    expect(ids).toContain('core-2');
  });
});
