/**
 * chosen-park — which park a location switch to the park uses (enable_location_gate_v1).
 *
 * The switch must use the park the user CHOSE, not the nearest one:
 *   1. the park card the user tapped in "איפה מתאמנים?" (enable_where_to_train_v1);
 *   2. the park whose page started this workout (park page → "התחל אימון");
 *   3. the park the where-to-train carousel shows as selected (its best match);
 *   4. none → null: the caller falls back to the nearest equipped park.
 * Only park / street switches use a park; any other location → null. Pure.
 */
import type { ExecutionLocation } from '@/features/content/exercises';

export interface ChosenParkInput {
  location: ExecutionLocation;
  /** The where-to-train card the user explicitly tapped. */
  pickedParkId?: string | null;
  /** The park whose page started the workout. */
  sourceParkId?: string | null;
  /** The where-to-train carousel's default selection (shown selected, not tapped). */
  suggestedParkId?: string | null;
}

const clean = (id: string | null | undefined): string | null => (id && id.trim() ? id : null);

export function chosenParkIdForSwap({ location, pickedParkId, sourceParkId, suggestedParkId }: ChosenParkInput): string | null {
  if (location !== 'park' && location !== 'street') return null;
  return clean(pickedParkId) ?? clean(sourceParkId) ?? clean(suggestedParkId);
}
