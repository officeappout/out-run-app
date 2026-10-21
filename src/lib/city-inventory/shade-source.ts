/**
 * city-inventory/shade-source.ts — where a city's shade layer comes from.
 * Pure.
 *
 * Owner decision (21.10.2026): the Technion street shade maps are permitted
 * and in prod Storage under `shade/technion/v1/` (13 cities,
 * docs/routes/TECHNION-SHADE-IMPORT.md). Source = Technion where the city
 * has a layer, otherwise our canopy-based estimate. The two numbers are not
 * comparable (daily summer SI vs. canopy %), so the method always travels
 * with the value.
 */
import { TECHNION_ATTRIBUTION, TECHNION_SHADE_LAYERS, type TechnionLayer } from '@/lib/shade/technion-layers';
import type { LayerMethod } from './types';

export const TECHNION_SHADE_STORAGE_PREFIX = 'shade/technion/v1/';
export const TECHNION_SHADE_SOURCE_KEY = 'technion_shade';
export const CANOPY_ESTIMATE_SOURCE_KEY = 'canopy_estimate';
/** Technion layers carry no machine licence; usage is by the lab's permission. */
export const TECHNION_LICENSE = 'by permission (Aleksandrowicz lab, Technion)';
export const CANOPY_ESTIMATE_ATTRIBUTION = 'Shade estimate: OUT, from tree-canopy data';
export const CANOPY_ESTIMATE_LICENSE = 'derived (OUT enrichment)';

export interface ShadeSourceChoice {
  method: Extract<LayerMethod, 'technion_si_daily' | 'canopy_estimate'>;
  sourceKey: string;
  attribution: string;
  license: string;
  /** Storage object for the Technion city file, when Technion. */
  storagePath: string | null;
  technion: TechnionLayer | null;
}

export function technionLayerFor(citySlug: string | null | undefined): TechnionLayer | null {
  if (!citySlug) return null;
  return TECHNION_SHADE_LAYERS.find((l) => l.city === citySlug) ?? null;
}

/**
 * Technion first; canopy estimate elsewhere; `null` when neither exists
 * (layer stays "not measured").
 */
export function resolveShadeSource(input: {
  technionCitySlug?: string | null;
  canopyAvailable: boolean;
}): ShadeSourceChoice | null {
  const t = technionLayerFor(input.technionCitySlug);
  if (t) {
    return {
      method: 'technion_si_daily',
      sourceKey: TECHNION_SHADE_SOURCE_KEY,
      attribution: TECHNION_ATTRIBUTION,
      license: TECHNION_LICENSE,
      storagePath: `${TECHNION_SHADE_STORAGE_PREFIX}${t.city}.geojson.gz`,
      technion: t,
    };
  }
  if (input.canopyAvailable) {
    return {
      method: 'canopy_estimate',
      sourceKey: CANOPY_ESTIMATE_SOURCE_KEY,
      attribution: CANOPY_ESTIMATE_ATTRIBUTION,
      license: CANOPY_ESTIMATE_LICENSE,
      storagePath: null,
      technion: null,
    };
  }
  return null;
}
