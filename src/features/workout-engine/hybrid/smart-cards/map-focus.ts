/**
 * Where the user is LOOKING on the map (enable_hybrid_cards_v2) — pure.
 *   1. a selected park (e.g. the user tapped ספורטק) → its location
 *   2. else the viewport centre, when zoomed in to a neighbourhood (≤ MAX_FOCUS_SPAN_M across)
 * A focus within SAME_AS_USER_M of the user is just the user's own area → null.
 */

import { haversineMeters } from '@/features/parks/core/services/geoUtils';

type LatLng = { lat: number; lng: number };

export const MAX_FOCUS_SPAN_M = 4000;
export const SAME_AS_USER_M = 300;

export interface BoundsLike { neLng: number; neLat: number; swLng: number; swLat: number }

export function focusFromMap(
  selectedPark: { location?: { lat?: number; lng?: number } | null } | null | undefined,
  bounds: BoundsLike | null | undefined,
  user: LatLng | null,
): LatLng | null {
  let focus: LatLng | null = null;
  const sp = selectedPark?.location;
  if (sp && Number.isFinite(sp.lat) && Number.isFinite(sp.lng)) {
    focus = { lat: sp.lat as number, lng: sp.lng as number };
  } else if (bounds) {
    const spanM = Math.max(
      haversineMeters(bounds.swLat, bounds.swLng, bounds.neLat, bounds.swLng),
      haversineMeters(bounds.swLat, bounds.swLng, bounds.swLat, bounds.neLng),
    );
    if (Number.isFinite(spanM) && spanM <= MAX_FOCUS_SPAN_M) {
      focus = { lat: (bounds.swLat + bounds.neLat) / 2, lng: (bounds.swLng + bounds.neLng) / 2 };
    }
  }
  if (focus && user && haversineMeters(user.lat, user.lng, focus.lat, focus.lng) <= SAME_AS_USER_M) return null;
  return focus;
}
