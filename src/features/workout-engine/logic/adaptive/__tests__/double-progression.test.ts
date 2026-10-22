import { describe, it, expect } from 'vitest';
import {
  adaptiveExtraSets, adaptiveTarget, evaluateSession, isStateFresh, nextAdaptiveState, setHitTarget,
  type AdaptiveState, type SessionResultInput,
} from '../double-progression';
import {
  DP_HOLD_STEP_S, DP_MAX_EXTRA_SETS, DP_STATE_STALE_DAYS, DP_STEPBACK_REPS,
} from '../adaptive.config';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const R = { min: 4, max: 6 };
const s = (values: number[], target: number, extra: Partial<SessionResultInput> = {}): SessionResultInput =>
  ({ values, target, range: R, isHold: false, ...extra });

/** Run sessions in order, each at the target the previous one handed out. */
function run(results: ((target: number) => number[])[], start = 4): AdaptiveState | null {
  let st: AdaptiveState | null = null;
  let target = start;
  results.forEach((r, i) => {
    st = nextAdaptiveState(st, s(r(target), target), NOW + i * DAY);
    if (st) target = st.nextTarget;
  });
  return st;
}
const hit = (t: number) => [t, t, t];
const miss = () => [2, 3, 4];
const partial = (t: number) => [t, t, t - 1];

describe('evaluateSession', () => {
  it('success / miss / neutral / skip', () => {
    expect(evaluateSession(s([5, 5, 5], 5))).toBe('success');
    expect(evaluateSession(s([3, 3, 6], 5))).toBe('miss');      // 2 sets below min
    expect(evaluateSession(s([2, 4, 5], 5))).toBe('miss');      // average below min (3.67 < 4)
    expect(evaluateSession(s([5, 5, 4], 5))).toBe('neutral');
    expect(evaluateSession(s([5, 5], 5, { skip: true }))).toBe('skip');
    expect(evaluateSession(s([], 5))).toBe('skip');
    expect(evaluateSession(s([5], 5, { range: { min: NaN, max: NaN } }))).toBe('skip');
  });

  it("a 'default' set (picker untouched) hits only when the offered value is the range top", () => {
    expect(setHitTarget(5, 'default', 5, 6)).toBe(false);
    expect(setHitTarget(6, 'default', 6, 6)).toBe(true);
    expect(setHitTarget(5, 'edited', 5, 6)).toBe(true);
    expect(evaluateSession(s([5, 5, 5], 5, { sources: ['default', 'default', 'default'] }))).toBe('neutral');
    expect(evaluateSession(s([6, 6, 6], 6, { sources: ['default', 'default', 'default'] }))).toBe('success');
  });
});

describe('nextAdaptiveState — the rules', () => {
  it('success → +1 rep, capped at the range top', () => {
    expect(nextAdaptiveState(null, s(hit(4), 4), NOW)!.nextTarget).toBe(5);
    expect(nextAdaptiveState(null, s(hit(6), 6), NOW)!.nextTarget).toBe(6);
  });

  it('hold success → +5 s', () => {
    const st = nextAdaptiveState(null, { values: [20, 20], target: 20, range: { min: 15, max: 30 }, isHold: true }, NOW)!;
    expect(st.nextTarget).toBe(20 + DP_HOLD_STEP_S);
    expect(st.isHold).toBe(true);
  });

  it('2 sessions at the top → +1 set; 3 → harder variation', () => {
    const two = run([hit, hit, hit, hit], 4); // 4→5→6, then 2 at top
    expect(two!.topStreak).toBe(2);
    expect(two!.extraSets).toBe(1);
    expect(two!.variationStep).toBe(0);
    const three = run([hit, hit, hit, hit, hit], 4);
    expect(three!.topStreak).toBe(3);
    expect(three!.extraSets).toBe(DP_MAX_EXTRA_SETS);
    expect(three!.variationStep).toBe(1);
  });

  it('miss → hold; 2 misses in a row → step back (never below min)', () => {
    const one = run([hit, miss], 4); // target 5, then miss
    expect(one!.nextTarget).toBe(5);
    expect(one!.missStreak).toBe(1);
    const two = run([hit, hit, miss, miss], 4); // target 6 → miss, miss
    expect(two!.nextTarget).toBe(6 - DP_STEPBACK_REPS);
    expect(two!.missStreak).toBe(0);
  });

  it('2 misses already at the min → easier variation', () => {
    const st = run([miss, miss], 4);
    expect(st!.nextTarget).toBe(4);
    expect(st!.variationStep).toBe(-1);
  });

  it('a miss drops the extra set; a partial holds and resets both streaks', () => {
    const extra = run([hit, hit, hit, hit, miss], 4);
    expect(extra!.extraSets).toBe(0);
    const p = run([hit, miss, partial], 4);
    expect(p!.missStreak).toBe(0);
    expect(p!.topStreak).toBe(0);
    expect(p!.nextTarget).toBe(5);
  });

  it('a skipped session carries the state untouched (nothing new when there was none)', () => {
    const st = run([hit], 4)!;
    expect(nextAdaptiveState(st, s([1, 1], 5, { skip: true }), NOW + DAY)).toBe(st);
    expect(nextAdaptiveState(null, s([1, 1], 5, { skip: true }), NOW)).toBeNull();
  });

  it('stale state is ignored (re-learned from this session)', () => {
    const old = nextAdaptiveState(null, s(hit(6), 6), NOW)!;
    const later = NOW + (DP_STATE_STALE_DAYS + 1) * DAY;
    expect(isStateFresh(old, later)).toBe(false);
    const st = nextAdaptiveState({ ...old, topStreak: 2 }, s(hit(6), 6), later)!;
    expect(st.topStreak).toBe(1);
  });
});

describe('adaptiveTarget / adaptiveExtraSets — deterministic placement', () => {
  it('fresh state → its target clamped into today’s range', () => {
    const st = nextAdaptiveState(null, s(hit(5), 5), NOW)!; // next 6
    expect(adaptiveTarget({ min: 4, max: 6 }, st, null, NOW)).toBe(6);
    expect(adaptiveTarget({ min: 2, max: 4 }, st, null, NOW)).toBe(4); // range moved down
  });
  it('no state → range min, raised to last best', () => {
    expect(adaptiveTarget({ min: 4, max: 6 }, null, null, NOW)).toBe(4);
    expect(adaptiveTarget({ min: 4, max: 6 }, null, 5, NOW)).toBe(5);
    expect(adaptiveTarget({ min: 4, max: 6 }, null, 9, NOW)).toBe(6);
  });
  it('extra sets only from a fresh state', () => {
    const st = run([hit, hit, hit, hit], 4)!;
    expect(adaptiveExtraSets(st, NOW + 4 * DAY)).toBe(1);
    expect(adaptiveExtraSets(st, NOW + 60 * DAY)).toBe(0);
    expect(adaptiveExtraSets(null, NOW)).toBe(0);
  });
});
