/**
 * Adaptive selection nudges (pure). The generator never forces an exercise in — it only moves
 * scores in its synergy pass (WorkoutGenerator), so coverage / variety guarantees still win.
 *
 *   3a variation step: an exercise whose progression asks for the next (or previous) variation
 *      → candidates in the SAME movement group and the SAME program at level ±1 get
 *        +DP_VARIATION_SCORE_BONUS, and the source itself −DP_VARIATION_SCORE_BONUS (only when
 *        such a candidate exists). The user can still swap exercises as today.
 *   3e goal presence: see goal-presence.ts (merged into the same map).
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { DP_VARIATION_SCORE_BONUS } from './adaptive.config';
import { isStateFresh, type AdaptiveState } from './double-progression';

export type ScoreBonusMap = Map<string, { delta: number; reason: string }>;

export function addScoreBonus(map: ScoreBonusMap, id: string, delta: number, reason: string): void {
  const prev = map.get(id);
  map.set(id, prev ? { delta: prev.delta + delta, reason: `${prev.reason},${reason}` } : { delta, reason });
}

function isVariationOf(candidate: Exercise, source: Exercise, step: 1 | -1): boolean {
  if (candidate.id === source.id) return false;
  if (!source.movementGroup || candidate.movementGroup !== source.movementGroup) return false;
  const cand = candidate.targetPrograms ?? [];
  return (source.targetPrograms ?? []).some((tp) =>
    cand.some((c) => c.programId === tp.programId && c.level === tp.level + step),
  );
}

export function buildVariationBonus(
  states: Record<string, AdaptiveState> | undefined,
  pool: Exercise[],
  nowMs: number,
  out: ScoreBonusMap = new Map(),
): ScoreBonusMap {
  if (!states) return out;
  const byId = new Map(pool.map((e) => [e.id, e]));
  for (const [sourceId, state] of Object.entries(states)) {
    if (!isStateFresh(state, nowMs) || state.variationStep === 0) continue;
    const source = byId.get(sourceId);
    if (!source) continue;
    const step = state.variationStep;
    const targets = pool.filter((c) => isVariationOf(c, source, step));
    if (targets.length === 0) continue;
    const tag = step === 1 ? 'dp_harder' : 'dp_easier';
    for (const t of targets) addScoreBonus(out, t.id, DP_VARIATION_SCORE_BONUS, `${tag}:+${DP_VARIATION_SCORE_BONUS}(from=${sourceId})`);
    addScoreBonus(out, sourceId, -DP_VARIATION_SCORE_BONUS, `${tag}_source:-${DP_VARIATION_SCORE_BONUS}`);
  }
  return out;
}
