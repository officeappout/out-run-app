import { emptyLayer } from '../doc';
import { INVENTORY_LAYER_KEYS, type InventoryLayer, type InventoryLayerKey, type LayerSource } from '../types';

export const NOW = new Date('2026-10-21T08:00:00Z');
export const OSM_SOURCE: LayerSource = { key: 'osm', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', snapshotDate: '2026-10-01', count: 10 };

export function measuredLayer(over: Partial<InventoryLayer> = {}): InventoryLayer {
  return { ...emptyLayer(), count: 10, coveragePct: 50, method: 'osm_count', sources: [OSM_SOURCE], lastRefreshAt: NOW, ...over };
}

/** Every layer measured; shade at 85 % from Technion. */
export function allMeasured(): Record<InventoryLayerKey, InventoryLayer> {
  const out = {} as Record<InventoryLayerKey, InventoryLayer>;
  for (const k of INVENTORY_LAYER_KEYS) out[k] = measuredLayer();
  out.shade = measuredLayer({
    count: null,
    coveragePct: 85,
    method: 'technion_si_daily',
    sources: [{ key: 'technion_shade', license: 'by permission', attribution: 'Technion', snapshotDate: '2022-01-01', count: 5802 }],
  });
  return out;
}
