'use client';

/**
 * useCommuteEta
 * ─────────────
 * Live ETA / remaining-distance derivation for an active commute session.
 *
 * Inputs (all read live from `useRunningPlayer`):
 *   • `lastPosition`     — last accepted GPS sample (`{ lat, lng }`).
 *   • `currentPace`      — 5-point smoothed pace in min/km.
 *   • `commuteContext`   — destination set when the session started.
 *
 * Outputs:
 *   • `distanceRemainingKm` — straight-line haversine distance from the
 *     user to the destination. We deliberately use straight-line (not the
 *     Mapbox polyline distance) so the metric shrinks monotonically as
 *     the user advances, even if they wander off the suggested path.
 *   • `etaSeconds`         — how many seconds until arrival at the
 *     current pace. Floors at the user's current pace; if the user is
 *     stationary (pace 0 or > MAX_REASONABLE_PACE), we fall back to a
 *     conservative walking pace (`FALLBACK_PACE_MIN_PER_KM`) so the HUD
 *     never shows "∞" or NaN.
 *   • `etaArrival`         — Date object representing wall-clock arrival
 *     time (now + etaSeconds). Useful for "you'll arrive at 09:42".
 *   • `hasArrived`         — true once the user is within
 *     `ARRIVAL_RADIUS_KM` of the destination. Consumers (e.g. the slim
 *     summary) can use this to auto-end the session.
 *
 * Returns null fields when the inputs are not yet ready (no GPS fix /
 * no destination), so the consumer can render a "מחפש GPS…" skeleton
 * instead of bogus zeros.
 */

import { useMemo } from 'react';
import { useRunningPlayer } from '../../store/useRunningPlayer';

// 30 m radius — matches the spec used elsewhere for "user is on the
// route". Tighter and we'd thrash the arrival flag on GPS jitter at
// the destination; looser and the user would feel "I'm clearly here
// already, why does it still say 50 m?".
const ARRIVAL_RADIUS_KM = 0.03;

// 12 min/km ≈ 5 km/h — a comfortable walking pace. Used as a floor
// when the smoothed pace is 0 (stationary at the start) or absurdly
// slow (e.g. paused). Keeps ETA finite and reasonable in those edge
// cases without flashing weird numbers at the user.
const FALLBACK_PACE_MIN_PER_KM = 12;

// Anything slower than 30 min/km is treated as "not really moving"
// — fall back to the walking pace floor instead.
const MAX_REASONABLE_PACE_MIN_PER_KM = 30;

export interface CommuteEta {
  distanceRemainingKm: number | null;
  etaSeconds: number | null;
  etaArrival: Date | null;
  hasArrived: boolean;
}

/**
 * Haversine distance in kilometres. Inlined (rather than re-using
 * `calculateDistance` from location.service) to avoid pulling the
 * whole geolocation module into a pure-math hook.
 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function useCommuteEta(): CommuteEta {
  const lastPosition = useRunningPlayer((s) => s.lastPosition);
  const currentPace = useRunningPlayer((s) => s.currentPace);
  const commuteContext = useRunningPlayer((s) => s.commuteContext);

  return useMemo<CommuteEta>(() => {
    if (
      !lastPosition ||
      !commuteContext ||
      !Number.isFinite(lastPosition.lat) ||
      !Number.isFinite(lastPosition.lng) ||
      !Number.isFinite(commuteContext.destination.lat) ||
      !Number.isFinite(commuteContext.destination.lng)
    ) {
      return {
        distanceRemainingKm: null,
        etaSeconds: null,
        etaArrival: null,
        hasArrived: false,
      };
    }

    const distanceKm = haversineKm(lastPosition, commuteContext.destination);
    const hasArrived = distanceKm <= ARRIVAL_RADIUS_KM;

    // Pick an effective pace. Floor at FALLBACK_PACE_MIN_PER_KM whenever
    // the live pace is unusable (stationary user, paused session, or
    // an absurd reading). This keeps the ETA HUD calm and predictable.
    const livePaceUsable =
      Number.isFinite(currentPace) &&
      currentPace > 0 &&
      currentPace <= MAX_REASONABLE_PACE_MIN_PER_KM;
    const effectivePaceMinPerKm = livePaceUsable ? currentPace : FALLBACK_PACE_MIN_PER_KM;

    const etaSeconds = hasArrived
      ? 0
      : Math.max(0, Math.round(distanceKm * effectivePaceMinPerKm * 60));

    const etaArrival = etaSeconds === null ? null : new Date(Date.now() + etaSeconds * 1000);

    return {
      distanceRemainingKm: distanceKm,
      etaSeconds,
      etaArrival,
      hasArrived,
    };
  }, [lastPosition, currentPace, commuteContext]);
}
