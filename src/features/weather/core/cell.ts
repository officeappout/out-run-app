/**
 * Weather cells — coordinates rounded ON THE DEVICE to a 0.05° grid (~5 km), so the
 * server never receives (and can never log) a precise location, and everyone in the
 * same ~5 km square shares one cached forecast.
 *
 * Cell id: "<lat>_<lng>" with exactly two decimals, e.g. "32.05_34.80".
 */

export const CELL_STEP_DEG = 0.05;

/**
 * Generous bounding box around Israel (incl. Eilat, the Golan, Judea & Samaria and some
 * margin). The product is Israel-only today; a bounded grid also bounds how many
 * weather_cache docs an abusive caller could make the server create. A user abroad
 * simply gets a 400 and the home chip stays hidden.
 */
export const CELL_BBOX = { minLat: 29.0, maxLat: 33.8, minLng: 33.8, maxLng: 36.2 } as const;

const CELL_RE = /^(-?\d{1,2}\.\d{2})_(-?\d{1,3}\.\d{2})$/;

function snap(v: number): number {
  // Integer arithmetic on the 1/20° grid avoids 0.1+0.2 style drift.
  return Math.round(v / CELL_STEP_DEG) * 5 / 100;
}

/** Round a coordinate pair to its cell id. Null for non-finite input. */
export function toCellId(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${snap(lat).toFixed(2)}_${snap(lng).toFixed(2)}`;
}

/** True when the value sits exactly on the 0.05° grid (two-decimal string input). */
function onGrid(v: number): boolean {
  const twentieths = v * 20;
  return Math.abs(twentieths - Math.round(twentieths)) < 1e-6;
}

/**
 * Parse + validate a cell id coming from the network. Returns the cell centre, or null
 * when the format is wrong, the point is off the 0.05° grid, or it is outside CELL_BBOX.
 */
export function parseCellId(id: string | null | undefined): { lat: number; lng: number } | null {
  if (!id || id.length > 16) return null;
  const m = CELL_RE.exec(id);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!onGrid(lat) || !onGrid(lng)) return null;
  if (lat < CELL_BBOX.minLat || lat > CELL_BBOX.maxLat) return null;
  if (lng < CELL_BBOX.minLng || lng > CELL_BBOX.maxLng) return null;
  return { lat, lng };
}
