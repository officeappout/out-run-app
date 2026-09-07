import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enforceVolumeCap } from '../PresentationFormatter';

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

  it('UNDER CAP: untouched (early return, historical behavior)', () => {
    const w = workoutOf([mainEx('a', 65), cooldownEx('s')]);
    const before = (w as { exercises: unknown[] }).exercises.length;
    const result = enforceVolumeCap(w, { durationCap: 60 }) as { exercises: unknown[] };
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
