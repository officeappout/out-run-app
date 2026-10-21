/**
 * Cities the hourly shade build knows by slug. bbox is [minLon, minLat,
 * maxLon, maxLat] in WGS84 and covers the municipal area with a small margin.
 * `technionCity` names the Technion SI layer used for the sanity check.
 * Pure.
 */
export interface HourlyShadeCity {
  slug: string;
  nameHe: string;
  bbox: [number, number, number, number];
  technionCity?: string;
}

export const HOURLY_SHADE_CITIES: readonly HourlyShadeCity[] = [
  { slug: 'tel-aviv', nameHe: 'תל אביב-יפו', bbox: [34.739, 32.029, 34.852, 32.147], technionCity: 'tel-aviv' },
  { slug: 'beer-sheva', nameHe: 'באר שבע', bbox: [34.73, 31.2, 34.87, 31.3], technionCity: 'beer-sheva' },
];

export function hourlyShadeCity(slug: string): HourlyShadeCity | undefined {
  return HOURLY_SHADE_CITIES.find((c) => c.slug === slug);
}

/** Storage object for a city's hourly file. */
export const HOURLY_SHADE_STORAGE_PREFIX = 'shade/hourly/v1';
export const hourlyShadeObjectPath = (slug: string) => `${HOURLY_SHADE_STORAGE_PREFIX}/${slug}.bin.gz`;
