/**
 * city-inventory/park-size.ts — which park-like areas count as a park, and
 * whether a park is a "big park" or a "lap loop". Pure.
 *
 * - big park: the RC3 Q7 threshold, imported (not copied) from
 *   `src/lib/park-loops/select-parks.ts` — ≥ 80,000 m² OR perimeter ≥ 1.2 km,
 *   and named (select-parks drops unnamed areas).
 * - lap loop (owner, 21.10.2026): a smaller garden/park whose walkable
 *   perimeter is ≥ 500 m — a loop you can lap. Distinct from big parks:
 *   a park is never both.
 *
 * I0 uses the outer-ring perimeter as the "walkable perimeter" proxy; I1
 * may tighten it to the share of the boundary actually followed by a
 * footway/path once the PBF extract is wired in.
 */
import { BIG_PARK_MIN_AREA_M2, BIG_PARK_MIN_PERIMETER_M } from '@/lib/park-loops/select-parks';
import type { OsmTags } from './types';

export { BIG_PARK_MIN_AREA_M2, BIG_PARK_MIN_PERIMETER_M };

/** Minimum walkable perimeter (m) for a small park/garden to count as a lap loop. */
export const LAP_LOOP_MIN_PERIMETER_M = 500;

const PRIVATE_ACCESS = new Set(['private', 'no', 'customers']);
const PRIVATE_GARDEN_TYPES = new Set(['residential', 'private']);

/** Public park-like area: leisure=park/garden/nature_reserve or landuse=recreation_ground. */
export function isParkLikeArea(tags: OsmTags): boolean {
  const isPark =
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    tags.leisure === 'nature_reserve' ||
    tags.landuse === 'recreation_ground';
  if (!isPark) return false;
  if (PRIVATE_ACCESS.has(tags.access ?? '')) return false;
  if (tags.leisure === 'garden' && PRIVATE_GARDEN_TYPES.has(tags['garden:type'] ?? '')) return false;
  return true;
}

export type ParkSizeClass = 'big_park' | 'lap_loop' | 'small';

export interface ParkMetrics {
  areaM2: number;
  perimeterM: number;
  /** Has a name / name:he. Big parks must be named (RC3 Q7). */
  named: boolean;
}

export function parkSizeClass(m: ParkMetrics): ParkSizeClass {
  const area = Number.isFinite(m.areaM2) ? m.areaM2 : 0;
  const perim = Number.isFinite(m.perimeterM) ? m.perimeterM : 0;
  if (m.named && (area >= BIG_PARK_MIN_AREA_M2 || perim >= BIG_PARK_MIN_PERIMETER_M)) return 'big_park';
  if (perim >= LAP_LOOP_MIN_PERIMETER_M) return 'lap_loop';
  return 'small';
}
