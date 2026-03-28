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

/** Hebrew-formatted distance string: '350 מטר ממך' or '2.4 ק"מ ממך' */
export function distanceLabel(km: number): string {
  if (km < 1) {
    const meters = Math.round(km * 1000 / 50) * 50; // round to nearest 50 m
    return `${Math.max(meters, 50)} מטר ממך`;
  }
  return `${km.toFixed(1)} ק"מ ממך`;
}
