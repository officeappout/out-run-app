/**
 * Geohash ring sampling: instead of reading every street segment within
 * target/2 of the user (1–6k docs in a dense city), read a few small
 * geohash-7 cells (~150 m) on the ring where loop waypoints actually belong
 * (around idealKm), two angles × two radii per compass sector.
 */
import { geohashForLocation } from 'geofire-common';

export const RING_SECTORS = 16;
const RADII = [0.85, 1.12];
const ANGLE_OFFSETS = [-0.25, 0.25]; // fractions of a sector width around its centre
export const RING_CELL_PRECISION = 7;

export function ringCells(center: { lat: number; lng: number }, idealKm: number): string[] {
  const cells = new Set<string>();
  const width = 360 / RING_SECTORS;
  for (let s = 0; s < RING_SECTORS; s++) {
    for (const off of ANGLE_OFFSETS) {
      const brg = ((s + 0.5 + off) * width * Math.PI) / 180;
      for (const k of RADII) {
        const d = idealKm * k;
        const lat = center.lat + (d / 111.32) * Math.cos(brg);
        const lng = center.lng + (d / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(brg);
        cells.add(geohashForLocation([lat, lng], RING_CELL_PRECISION));
      }
    }
  }
  return Array.from(cells);
}
