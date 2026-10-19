/**
 * Our mapped routes near a start for /admin/routes/quality — the SAME readers
 * and radius logic the generator uses with enable_loops_prefer_official (the
 * map's cached official set + the city's published corridors). Read-only.
 */
import { buildOurRoutesIndex, type OurRouteLine, type OurRoutesIndex } from '@/lib/route-quality';
import { loadOurRoutesNear, ourRoutesSources } from '@/features/parks/core/services/loops-prefer-official';
import { readCityCorridorLines } from '@/features/parks/core/services/route-generator.service';

/** A bit wider than the generator's own radius, so the overlay shows the context around the loops. */
export const overlayRadiusKm = (targetKm: number) => Math.max(targetKm, 1.5) / 2 + 0.5;

export async function loadOurRoutesForQuality(
  start: { lat: number; lng: number },
  targetKm: number,
  cityName: string,
): Promise<{ lines: OurRouteLine[]; index: OurRoutesIndex | null }> {
  try {
    const lines = await loadOurRoutesNear(start, overlayRadiusKm(targetKm), ourRoutesSources(cityName, readCityCorridorLines));
    return { lines, index: buildOurRoutesIndex(lines, [start.lng, start.lat]) };
  } catch {
    return { lines: [], index: null };
  }
}
