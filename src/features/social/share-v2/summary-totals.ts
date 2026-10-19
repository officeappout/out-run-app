/**
 * Whole-workout totals for the share image, from the summary's phases
 * (already on the device — no read). Pure, unit-tested.
 */
import type { SummaryPhaseLike } from '../services/feed-post-details';
import type { ShareExtras } from '../services/share-image';

export function shareTotalsFromPhases(phases: SummaryPhaseLike[] | null | undefined): Pick<ShareExtras, 'totalSets' | 'totalReps' | 'exerciseCount'> {
  const out: Pick<ShareExtras, 'totalSets' | 'totalReps' | 'exerciseCount'> = {};
  let sets = 0;
  let reps = 0;
  let exercises = 0;
  for (const p of phases ?? []) {
    for (const b of p.blocks) {
      for (const e of b.exercises) {
        if (e.status === 'skipped' || !(e.doneSets > 0)) continue;
        if (p.phase === 'main') exercises += 1;
        sets += Math.round(e.doneSets);
        if (e.unit === 'reps') for (const s of e.sets) if (typeof s.done === 'number' && s.done > 0) reps += Math.round(s.done);
      }
    }
  }
  if (sets > 0) out.totalSets = sets;
  if (reps > 0) out.totalReps = reps;
  if (exercises > 0) out.exerciseCount = exercises;
  return out;
}
