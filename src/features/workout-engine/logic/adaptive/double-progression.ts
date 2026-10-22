/**
 * 3a — per-exercise double progression (pure). Flag enable_adaptive_reps_v1.
 *
 * After each session the exercise's state moves one step:
 *   success (every working set hit the target)  → target +1 rep / +5 s, up to the range top
 *     · DP_TOP_SESSIONS_FOR_SET successes in a row AT the top       → +1 set (max DP_MAX_EXTRA_SETS)
 *     · DP_TOP_SESSIONS_FOR_VARIATION successes in a row at the top → prefer the harder variation
 *   miss (≥2 sets below the range min, or the average below it)    → hold the target
 *     · DP_MISS_SESSIONS_FOR_STEPBACK misses in a row → target −2 reps / −5 s (never below min);
 *       already at the min → prefer the easier variation
 *   anything else → hold, both streaks reset.
 * Not counted (state passes through untouched): swapped exercise, warm-up / cool-down, deload /
 * heat / calm-return sessions (`skip`). A set saved without touching the picker ('default')
 * counts as hitting the target only when the offered value was the TOP of the range (owner, 22.10).
 *
 * Stored additively on users/{uid}/exerciseHistory/{exerciseId}.adaptive — no extra reads.
 */
import {
  DP_HOLD_STEP_S,
  DP_MAX_EXTRA_SETS,
  DP_MISS_SESSIONS_FOR_STEPBACK,
  DP_MISS_SETS_BELOW_MIN,
  DP_REP_STEP,
  DP_STATE_STALE_DAYS,
  DP_STEPBACK_HOLD_S,
  DP_STEPBACK_REPS,
  DP_TOP_SESSIONS_FOR_SET,
  DP_TOP_SESSIONS_FOR_VARIATION,
} from './adaptive.config';

export type RepsSourceLike = 'edited' | 'default' | 'timer' | string;

export interface AdaptiveState {
  v: 1;
  /** Target for the next session (reps, or seconds for a hold). */
  nextTarget: number;
  /** Successful sessions in a row with the target already at the range top. */
  topStreak: number;
  /** Missed sessions in a row. */
  missStreak: number;
  /** Extra sets on top of the generator's count (0..DP_MAX_EXTRA_SETS). */
  extraSets: number;
  /** Next generation prefers the next (+1) / previous (−1) variation; 0 = stay. */
  variationStep: -1 | 0 | 1;
  isHold: boolean;
  /** The range the target was earned in (clamped into today's range at read time). */
  range: { min: number; max: number };
  updatedAtMs: number;
}

export interface SessionResultInput {
  /** Confirmed value per working set. */
  values: number[];
  /** Per-set provenance, parallel to `values` (missing = treat as 'edited'). */
  sources?: RepsSourceLike[];
  /** The single target prescribed for this session. */
  target: number;
  range: { min: number; max: number };
  isHold: boolean;
  /** Swapped / warm-up / cool-down / deload / heat / calm return → not counted. */
  skip?: boolean;
}

export type SessionOutcome = 'success' | 'miss' | 'neutral' | 'skip';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Did one set hit the target? A 'default' set only when the offered value was the range top. */
export function setHitTarget(value: number, source: RepsSourceLike | undefined, target: number, rangeMax: number): boolean {
  if (source === 'default') return value >= rangeMax;
  return value >= target;
}

export function evaluateSession(input: SessionResultInput): SessionOutcome {
  const { values, sources, target, range } = input;
  if (input.skip) return 'skip';
  if (!values.length || !isNum(target) || target <= 0 || !isNum(range?.min) || !isNum(range?.max)) return 'skip';
  const below = values.filter((v) => v < range.min).length;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  if (below >= DP_MISS_SETS_BELOW_MIN || avg < range.min) return 'miss';
  const allHit = values.every((v, i) => setHitTarget(v, sources?.[i], target, range.max));
  return allHit ? 'success' : 'neutral';
}

function initialState(input: SessionResultInput, nowMs: number): AdaptiveState {
  return {
    v: 1,
    nextTarget: input.target,
    topStreak: 0,
    missStreak: 0,
    extraSets: 0,
    variationStep: 0,
    isHold: input.isHold,
    range: { min: input.range.min, max: input.range.max },
    updatedAtMs: nowMs,
  };
}

/** State older than DP_STATE_STALE_DAYS (or malformed) is ignored. */
export function isStateFresh(state: AdaptiveState | null | undefined, nowMs: number): state is AdaptiveState {
  if (!state || state.v !== 1 || !isNum(state.nextTarget) || !isNum(state.updatedAtMs)) return false;
  return nowMs - state.updatedAtMs <= DP_STATE_STALE_DAYS * 86_400_000;
}

/**
 * The next state after one session. Returns `prev` unchanged for a skipped session
 * (null when there was no state yet — nothing to write).
 */
export function nextAdaptiveState(
  prev: AdaptiveState | null | undefined,
  input: SessionResultInput,
  nowMs: number,
): AdaptiveState | null {
  const outcome = evaluateSession(input);
  const fresh = isStateFresh(prev, nowMs) ? prev : null;
  if (outcome === 'skip') return fresh ?? null;

  const base = fresh ?? initialState(input, nowMs);
  const { range, target, isHold } = input;
  const step = isHold ? DP_HOLD_STEP_S : DP_REP_STEP;
  const back = isHold ? DP_STEPBACK_HOLD_S : DP_STEPBACK_REPS;
  const next: AdaptiveState = {
    ...base,
    isHold,
    range: { min: range.min, max: range.max },
    updatedAtMs: nowMs,
    variationStep: 0,
  };

  if (outcome === 'success') {
    const atTop = target >= range.max;
    next.topStreak = atTop ? base.topStreak + 1 : 0;
    next.missStreak = 0;
    next.nextTarget = Math.min(range.max, target + step);
    next.extraSets = next.topStreak >= DP_TOP_SESSIONS_FOR_SET
      ? Math.min(DP_MAX_EXTRA_SETS, base.extraSets + 1)
      : base.extraSets;
    if (next.topStreak >= DP_TOP_SESSIONS_FOR_VARIATION) next.variationStep = 1;
    return next;
  }

  if (outcome === 'miss') {
    next.topStreak = 0;
    next.missStreak = base.missStreak + 1;
    next.extraSets = 0;
    next.nextTarget = Math.max(range.min, Math.min(range.max, target));
    if (next.missStreak >= DP_MISS_SESSIONS_FOR_STEPBACK) {
      if (target <= range.min) next.variationStep = -1;
      next.nextTarget = Math.max(range.min, target - back);
      next.missStreak = 0;
    }
    return next;
  }

  // neutral: hold the target, both streaks reset.
  next.topStreak = 0;
  next.missStreak = 0;
  next.nextTarget = Math.max(range.min, Math.min(range.max, target));
  return next;
}

/**
 * Where to put today's target inside today's range (flag on — deterministic, no Math.random).
 *   fresh state → its nextTarget, clamped to today's range
 *   no state    → the range min, raised to last session's best (history floor), ≤ range max
 */
export function adaptiveTarget(
  range: { min: number; max: number },
  state: AdaptiveState | null | undefined,
  lastSessionBest: number | null | undefined,
  nowMs: number,
): number {
  const clamp = (v: number) => Math.max(range.min, Math.min(range.max, Math.round(v)));
  if (isStateFresh(state, nowMs)) return clamp(state.nextTarget);
  if (isNum(lastSessionBest) && lastSessionBest > 0) return clamp(lastSessionBest);
  return range.min;
}

/** Extra sets earned, 0 when the state is stale / absent. */
export function adaptiveExtraSets(state: AdaptiveState | null | undefined, nowMs: number): number {
  if (!isStateFresh(state, nowMs)) return 0;
  return Math.max(0, Math.min(DP_MAX_EXTRA_SETS, state.extraSets | 0));
}
