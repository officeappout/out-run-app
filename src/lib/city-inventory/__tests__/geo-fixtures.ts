/** Metric fixtures around Tel Aviv for the I1 measurement tests. */
import type { LngLat } from '@/lib/park-loops/types';
import type { InvArea } from '../measure';

export const LON0 = 34.78;
export const LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const M_LAT = 1 / 111_195;

/** (x, y) metres east / north of the origin ⇒ [lng, lat]. */
export const at = (x: number, y: number): LngLat => [LON0 + x * M_LON, LAT0 + y * M_LAT];

/** Closed square ring, side `s` metres, lower-left at (x, y). */
export const square = (x: number, y: number, s: number): LngLat[] => [at(x, y), at(x + s, y), at(x + s, y + s), at(x, y + s), at(x, y)];

/** The test "city": a 1 km × 1 km square at the origin. */
export const CITY = { type: 'Polygon' as const, coordinates: [square(0, 0, 1000)] };

export const area = (id: string, tags: Record<string, string>, ring: LngLat[]): InvArea => ({ id, tags, geometry: { type: 'Polygon', coordinates: [ring] } });
