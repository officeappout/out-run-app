/**
 * dem-tile-cache/elevation-provider.ts — the one interface every elevation
 * consumer samples through (trails pilot, 18.10.2026). Pure, browser-safe.
 *
 * `storable` is the licensing guard: only a storable provider may feed a
 * number that gets PERSISTED (Firestore fields, exported JSON). Mapbox
 * Terrain-RGB is display-only (Mapbox terms forbid extracting data from
 * their tiles); Copernicus GLO-30 is storable with attribution.
 */
import { sampleElevation, type ElevationGridMap } from './dem-sampling.service';
import { DEM_TILE_ZOOM } from './tile-math';

export type ElevationProviderId = 'copernicus-glo30' | 'mapbox-terrain-rgb';

export interface ElevationProvider {
  readonly id: ElevationProviderId;
  readonly attribution: string;
  /** May values sampled from this provider be persisted? */
  readonly storable: boolean;
  /** Elevation in meters, or null outside coverage. Never guessed. */
  sample(lat: number, lng: number): number | null;
}

export const MAPBOX_TERRAIN_ATTRIBUTION = '© Mapbox';

/**
 * Wraps an already-loaded Terrain-RGB grid map. DISPLAY ONLY — callers that
 * persist results must use `assertStorable` first.
 */
export function mapboxTerrainDisplayProvider(tiles: ElevationGridMap, zoom: number = DEM_TILE_ZOOM): ElevationProvider {
  return {
    id: 'mapbox-terrain-rgb',
    attribution: MAPBOX_TERRAIN_ATTRIBUTION,
    storable: false,
    sample: (lat, lng) => sampleElevation(tiles, lat, lng, zoom),
  };
}

export function assertStorable(p: ElevationProvider): void {
  if (!p.storable) {
    throw new Error(`Elevation provider "${p.id}" is display-only; stored elevation must come from Copernicus GLO-30.`);
  }
}
