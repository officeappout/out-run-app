'use client';

/**
 * useAutoRadius — silently expands a base search radius to 15km when
 * the current result set has fewer than 3 entries, so users always see
 * options without having to manually drag the distance slider.
 *
 * Pure: no side effects, no UI feedback. The component using it never
 * needs to know the auto-expansion happened.
 */

const FALLBACK_RADIUS_KM = 15;
const MIN_RESULTS = 3;

export function useAutoRadius<T>(results: T[], baseRadius: number): number {
  if (results.length < MIN_RESULTS && baseRadius < FALLBACK_RADIUS_KM) {
    return FALLBACK_RADIUS_KM;
  }
  return baseRadius;
}
