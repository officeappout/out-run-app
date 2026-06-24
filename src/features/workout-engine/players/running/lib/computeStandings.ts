import type { Participant } from '../../shared/types/session-policy';
import type { StandingsResult } from '../types/story-spec';

/**
 * Single source of truth for session standings.
 * Called by both RunStoryBar (top bar track) and VSSlide (drawer comparison)
 * so they always show the same numbers.
 *
 * Returns null when there are no participants (solo run).
 */
export function computeStandings(
  myDistanceKm: number,
  selectedUid: string | null,
  participants: Participant[],
): StandingsResult | null {
  if (participants.length === 0) return null;

  const allSorted = [
    { uid: '_me_', distanceKm: myDistanceKm },
    ...participants.map((p) => ({ uid: p.uid, distanceKm: p.distanceKm })),
  ].sort((a, b) => b.distanceKm - a.distanceKm);

  const myPlace = allSorted.findIndex((e) => e.uid === '_me_') + 1;
  const rival = selectedUid ? (participants.find((p) => p.uid === selectedUid) ?? null) : null;
  const gapM = rival ? Math.round((myDistanceKm - rival.distanceKm) * 1000) : 0;

  return { place: myPlace, gapM, rival };
}
