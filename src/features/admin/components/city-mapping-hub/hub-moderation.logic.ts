/**
 * hub-moderation.logic.ts — pure helpers for approve / reject from the hub map
 * (CITY-MAPPING-HUB-DESIGN.md §3.4): what a decision does to the drawn data
 * right away (optimistic), and which ids a bulk action covers. No I/O.
 */
import type { HubLayerData } from './useHubLayers';
import type { HubFetchLayer } from '@/lib/city-mapping-hub/layers';
import { AMENITY_LAYER_CATEGORY, type AmenityFetchLayer } from '@/lib/city-mapping-hub/layers';
import type { HubModerationKind } from '@/features/admin/services/city-mapping-hub-moderation.service';

/** id → what the map should show until the next real refresh. */
export type HubOverrides = Record<string, 'approved' | 'removed'>;

export function moderationKind(kind: string): HubModerationKind | null {
  return kind === 'route' || kind === 'park' || kind === 'contribution' || kind === 'amenity' ? kind : null;
}

/**
 * approve: route / park / amenity turn "approved"; a contribution leaves the
 * (pending-only) layer. reject: removed (rejected / archived are not drawn).
 */
export function overrideFor(kind: HubModerationKind, action: 'approve' | 'reject'): 'approved' | 'removed' {
  return action === 'approve' && kind !== 'contribution' ? 'approved' : 'removed';
}

export function applyOverrides(data: HubLayerData, o: HubOverrides): HubLayerData {
  if (!Object.keys(o).length) return data;
  const out: HubLayerData = {};
  for (const [layer, payload] of Object.entries(data) as Array<[HubFetchLayer, NonNullable<HubLayerData[HubFetchLayer]>]>) {
    let changed = false;
    const features = payload.featureCollection.features.flatMap((f) => {
      const id = String(f.properties?.id ?? '');
      const v = o[id];
      if (!v) return [f];
      changed = true;
      return v === 'removed' ? [] : [{ ...f, properties: { ...f.properties, status: 'approved' } }];
    });
    out[layer] = changed ? { ...payload, featureCollection: { ...payload.featureCollection, features }, total: payload.total - (payload.featureCollection.features.length - features.length) } : payload;
  }
  return out;
}

/** Pending ids of one fetch layer (the exact set a bulk confirm names). */
export function pendingIds(data: HubLayerData, layer: HubFetchLayer): string[] {
  return (data[layer]?.featureCollection.features ?? [])
    .filter((f) => f.properties?.status === 'pending' && typeof f.properties?.id === 'string')
    .map((f) => String(f.properties!.id));
}

export const AMENITY_LAYERS = Object.keys(AMENITY_LAYER_CATEGORY) as AmenityFetchLayer[];
