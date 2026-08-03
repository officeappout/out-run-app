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

describe('enforceVolumeCap — Bug fix: undershoot honesty signal (ceiling-only guard)', () => {
  // Bug: enforceVolumeCap only ever PRUNES when estimatedMin > durationCap. It
  // has no mechanism to react when the plan comes out significantly UNDER the
  // request (e.g. a 45-min request landing at 36 min because the engine
  // simply didn't have/select enough exercises) — the early-return branch
  // used to silently stamp `estimatedDuration` with no signal that it
  // diverges from what the user asked for. Approved interim fix: surface the
  // gap as data (`requestedDurationMin` / `durationDeviationPct`), not a
  // full "floor" build (out of scope).
  it('BEFORE (documented): a materially short plan carried no requested-vs-actual signal', () => {
    // Reproduces the reported case: cap=45 (requested), only 4 mains fit →
    // actual lands well under cap. Historically `workout.estimatedDuration`
    // (36ish) was the ONLY field set — nothing recorded that 45 was requested
    // or that the shortfall was significant.
    const w = workoutOf([
      warmupEx('w1'), warmupEx('w2'),
      mainEx('a', 65), mainEx('b', 70), mainEx('c', 80), mainEx('d', 90),
      cooldownEx('stretch'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 45 }) as {
      estimatedDuration: number; requestedDurationMin?: number; durationDeviationPct?: number;
    };
    // The undershoot is real and significant (~20%+ short) ...
    expect(result.estimatedDuration).toBeLessThan(45 * 0.9);
    // ... AFTER the fix both signal fields exist and are correct:
    expect(result.requestedDurationMin).toBe(45);
    expect(result.durationDeviationPct).toBeLessThanOrEqual(-10);
    expect(result.durationDeviationPct).toBeCloseTo(
      Math.round(((result.estimatedDuration - 45) / 45) * 100),
      0,
    );
  });

  it('AFTER: a plan within tolerance of the request gets NO deviation flag (no false positives)', () => {
    // 8 mains @ cap 45 lands at ~43min (under the 10% honesty threshold: >= 40.5).
    const w = workoutOf([
      warmupEx('w1'), warmupEx('w2'),
      mainEx('a', 65), mainEx('b', 70), mainEx('c', 80), mainEx('d', 90),
      mainEx('e', 95), mainEx('f', 60), mainEx('g', 55), mainEx('h', 85),
      cooldownEx('stretch'),
    ]);
    const result = enforceVolumeCap(w, { durationCap: 45 }) as {
      requestedDurationMin?: number; durationDeviationPct?: number; estimatedDuration: number;
    };
    expect(result.estimatedDuration).toBeGreaterThanOrEqual(45 * 0.9); // within 10%
    expect(result.requestedDurationMin).toBe(45); // always stamped
    expect(result.durationDeviationPct).toBeUndefined(); // within honesty threshold → no flag
  });

  it('AFTER: the early-return (already-under-cap) path also stamps the signal', () => {
    const w = workoutOf([mainEx('a', 65), cooldownEx('s')]);
    const result = enforceVolumeCap(w, { durationCap: 60 }) as {
      requestedDurationMin?: number; durationDeviationPct?: number; estimatedDuration: number;
    };
    expect(result.requestedDurationMin).toBe(60);
    // A tiny 1-exercise plan against a 60min cap is a large, real deviation —
    // must be flagged even though this is the early-return (no pruning) path.
    expect(result.durationDeviationPct).toBeLessThanOrEqual(-10);
  });
});
