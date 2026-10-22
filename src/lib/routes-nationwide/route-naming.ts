/**
 * Real, descriptive names for generated loops (owner, 22.10.2026: "never
 * 'מקטע 2'"). A loop is named after what a runner actually passes: the big
 * park it runs through, else the one or two named streets/paths it follows
 * longest, else the nearest named neighbourhood — and only then the city.
 * Pure: the named-line index and the features are injected.
 */
import { pathLengthM, pointInRing, resample } from '../park-loops/geometry';
import type { LngLat, ParkPolygon, PathIndex } from '../park-loops';
import { haversineM } from '../route-quality/geo';

export const NAMING_STEP_M = 25;
/** A sample counts for a street when the loop runs within this distance of it. */
export const NAMING_SNAP_M = 15;
/** A loop "goes through" a park when this share of it lies inside the park. */
export const PARK_SHARE_MIN = 0.25;
/** A second street is named only when it carries at least this share of the loop. */
export const SECOND_STREET_MIN_SHARE = 0.15;
export const PLACE_RADIUS_M = 1_200;

export interface NamingContext {
  /** Index over NAMED ways (any highway); lineId → name via `names`. */
  namedLines: PathIndex;
  names: Map<string, string>;
  parks: ParkPolygon[];
  /** place=neighbourhood/suburb/quarter nodes. */
  places: Array<{ name: string; coord: LngLat }>;
}

export interface LoopNameParts {
  park: string | null;
  streets: string[];
  place: string | null;
}

export function loopNameParts(path: LngLat[], ctx: NamingContext): LoopNameParts {
  const pts = resample(path, NAMING_STEP_M);
  if (!pts.length) return { park: null, streets: [], place: null };
  let park: string | null = null;
  let bestShare = 0;
  for (const p of ctx.parks) {
    const share = pts.filter((q) => p.rings.some((r) => pointInRing(q, r))).length / pts.length;
    if (share >= PARK_SHARE_MIN && share > bestShare) { bestShare = share; park = p.name; }
  }
  const byName = new Map<string, number>();
  for (const q of pts) {
    const hit = ctx.namedLines.nearest(q, NAMING_SNAP_M);
    const n = hit ? ctx.names.get(hit.lineId) : undefined;
    if (n) byName.set(n, (byName.get(n) ?? 0) + 1);
  }
  const ranked = Array.from(byName.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const streets = ranked.filter(([, c], i) => i === 0 || c / pts.length >= SECOND_STREET_MIN_SHARE).slice(0, 2).map(([n]) => n);
  let place: string | null = null;
  let bestD = PLACE_RADIUS_M;
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  for (const pl of ctx.places) {
    const d = haversineM([cx, cy], pl.coord);
    if (d < bestD) { bestD = d; place = pl.name; }
  }
  return { park, streets, place };
}

/** "לולאת פארק X · 4.2 ק״מ" / "לולאת הרצל · ויצמן · 5.0 ק״מ" / "לולאת שכונת נווה עמל · …" / city fallback. */
export function generatedLoopName(parts: LoopNameParts, lengthM: number, city: string): string {
  const km = `${(lengthM / 1000).toFixed(1)} ק״מ`;
  if (parts.park) return parts.streets[0] && parts.streets[0] !== parts.park ? `לולאת ${parts.park} · ${parts.streets[0]} · ${km}` : `לולאת ${parts.park} · ${km}`;
  if (parts.streets.length) return `לולאת ${parts.streets.join(' · ')}${parts.place ? ` (${parts.place})` : ''} · ${km}`;
  if (parts.place) return `לולאת ${parts.place} · ${km}`;
  return `לולאה שכונתית ב${city} · ${km}`;
}

export function nameGeneratedLoop(path: LngLat[], ctx: NamingContext | null, city: string): { name: string; parts: LoopNameParts | null } {
  const lengthM = pathLengthM(path);
  if (!ctx) return { name: generatedLoopName({ park: null, streets: [], place: null }, lengthM, city), parts: null };
  const parts = loopNameParts(path, ctx);
  return { name: generatedLoopName(parts, lengthM, city), parts };
}
