/**
 * The steps a replay shows — the SAME steps (and copy) as the first-run tour, in the one tour
 * bubble style. The station tour comes from the guided station tutorial (its title + line form).
 */
import type { AppGender } from '@/lib/utils/gendered-text';
import { stationTutorialEntrySteps } from '@/features/workout-engine/hybrid/station-tutorial';
import { firstRunTourSteps, type FirstRunTourStep } from './first-run-tour';
import type { ReplayableTour } from './tour-replay';

export function replayTourSteps(tour: ReplayableTour, gender: AppGender | null | undefined): FirstRunTourStep[] {
  if (tour === 'station') return stationTutorialEntrySteps(gender);
  return firstRunTourSteps(tour, gender);
}

/** From the requested step (clamped), then only what is on screen (alt targets honoured). */
export function replayStepsFrom(
  all: FirstRunTourStep[],
  step: number,
): FirstRunTourStep[] {
  if (!all.length) return [];
  return all.slice(Math.min(Math.max(0, Math.floor(step)), all.length - 1));
}
