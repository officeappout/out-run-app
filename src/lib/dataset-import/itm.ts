/**
 * Israeli Transverse Mercator (EPSG:2039) → WGS84. Most Israeli government
 * GIS is published in ITM. Uses proj4 with the EPSG:2039 definition
 * (including the towgs84 datum shift), not a home-made approximation.
 */
import proj4 from 'proj4';
import type { LngLat } from './types';

export const ITM_PROJ =
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 ' +
  '+ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs';

const converter = proj4(ITM_PROJ, 'EPSG:4326');

export function itmToWgs84(x: number, y: number): LngLat {
  const [lng, lat] = converter.forward([x, y]);
  return [lng, lat];
}

/** True when a coordinate pair can only be ITM metres (Israel's ITM box), not degrees. */
export function looksLikeItm(c: readonly number[]): boolean {
  const [x, y] = c;
  return x > 100_000 && x < 300_000 && y > 350_000 && y < 820_000;
}

/** True when a coordinate pair is plausible WGS84 lng/lat over Israel. */
export function looksLikeWgs84Israel(c: readonly number[]): boolean {
  const [lng, lat] = c;
  return lng > 34 && lng < 36 && lat > 29 && lat < 34;
}
