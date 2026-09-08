/** Haversine great-circle distance between two GPS coordinates, in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A "nearby"/"your group" distance chip claims local knowledge — beyond
// this, showing a specific number reads as precise when it isn't
// meaningful for this UI. 08.09.2026: the reserve-league bug rendered
// "~25998 דק׳ נסיעה" from a fabricated 9999km sentinel; removing that
// sentinel (km is now `null`, never invented) closes that specific case,
// but a genuinely-computed but absurd value deserves the same treatment —
// fail loud, not silently displayed as if it were normal.
const MAX_SANE_KM = 300;

/**
 * Hebrew-formatted distance string: '350 מטר ממך' or '2.4 ק"מ ממך'.
 * Returns `null` (render nothing) for a value beyond MAX_SANE_KM — logged,
 * not displayed, since a number here implies "we know exactly where this
 * is relative to you."
 */
export function distanceLabel(km: number): string | null {
  if (km > MAX_SANE_KM) {
    console.error(`[distanceLabel] refusing to render an absurd distance: ${km}km`);
    return null;
  }
  if (km < 1) {
    const meters = Math.round(km * 1000 / 50) * 50; // round to nearest 50 m
    return `${Math.max(meters, 50)} מטר ממך`;
  }
  return `${km.toFixed(1)} ק"מ ממך`;
}
