/**
 * Budget light mode — trim a session's MAIN work to a set cap (pure).
 *
 * Only plain main exercises are trimmed: warm-up / cool-down, tabata blocks and pyramid /
 * reps-sequence exercises keep their structure. A superset pair (pairedWith) loses a set on
 * both sides together so the pair stays even. Sets come off the biggest exercise first, down
 * to 2 per exercise, then down to 1 only if still over the cap. Exercises are never dropped.
 */

import type { WorkoutExercise } from '../logic/workout-generator.types';

function isTrimmable(ex: WorkoutExercise): boolean {
  const role = ex.exerciseRole ?? 'main';
  return role === 'main' && !ex.protocolBlock && !ex.pyramidSequence?.length && !ex.repsSequence?.length;
}

/** Sum of main-work sets (what the cap is measured against). Tabata blocks are timed, not counted. */
export function mainWorkSets(exercises: readonly WorkoutExercise[]): number {
  return exercises.reduce((sum, ex) => ((ex.exerciseRole ?? 'main') === 'main' && !ex.protocolBlock ? sum + (ex.sets || 0) : sum), 0);
}

export function capMainSets(exercises: readonly WorkoutExercise[], setsCap: number): WorkoutExercise[] {
  const out = exercises.map((ex) => ({ ...ex }));
  if (!(setsCap > 0)) return out;
  let total = mainWorkSets(out);
  if (total <= setsCap) return out;

  // Groups: a trimmable exercise + its trimmable pair partner (by exercise id).
  const idx = out.map((ex, i) => ({ ex, i })).filter(({ ex }) => isTrimmable(ex));
  const byId = new Map(idx.map(({ ex, i }) => [ex.exercise?.id, i] as const));
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const { ex, i } of idx) {
    if (seen.has(i)) continue;
    const partner = ex.pairedWith != null ? byId.get(ex.pairedWith) : undefined;
    const g = partner != null && partner !== i && !seen.has(partner) ? [i, partner] : [i];
    g.forEach((k) => seen.add(k));
    groups.push(g);
  }

  for (const floor of [2, 1]) {
    while (total > setsCap) {
      let best: number[] | null = null;
      let bestSets = floor;
      for (const g of groups) {
        const minSets = Math.min(...g.map((k) => out[k].sets));
        if (minSets > bestSets) { best = g; bestSets = minSets; }
      }
      if (!best) break;
      for (const k of best) out[k].sets -= 1;
      total -= best.length;
    }
    if (total <= setsCap) break;
  }
  return out;
}
