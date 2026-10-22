'use client';

/**
 * useHubLayers — lazy per-authority layer loading for the hub map
 * (CITY-MAPPING-HUB-DESIGN.md §5). A layer is fetched only when an authority
 * is selected AND a chip needs it. In-memory cache keyed
 * `authorityId:layer:version` — `version` is the caller's explicit
 * invalidation (bumped after a refresh or a moderation write), so the cache
 * never serves data it knows is stale (axioms §28: not a time-only cache).
 */
import { useEffect, useRef, useState } from 'react';
import type { HubFetchLayer } from '@/lib/city-mapping-hub/layers';
import type { HubLayerPayload } from '@/lib/city-mapping-hub/layer-payload';
import { loadHubLayer } from '@/features/admin/services/city-mapping-hub.service';

export type HubLayerData = Partial<Record<HubFetchLayer, HubLayerPayload>>;

export interface HubLayersState {
  data: HubLayerData;
  loading: HubFetchLayer[];
  errors: Partial<Record<HubFetchLayer, string>>;
}

export type LoadHubLayer = (authorityId: string, layer: HubFetchLayer) => Promise<HubLayerPayload>;

export function useHubLayers(authorityId: string | null, layers: HubFetchLayer[], version: number, load: LoadHubLayer = loadHubLayer): HubLayersState {
  const cache = useRef(new Map<string, HubLayerPayload>());
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState<HubFetchLayer[]>([]);
  const [errors, setErrors] = useState<Partial<Record<HubFetchLayer, string>>>({});
  const key = (l: HubFetchLayer) => `${authorityId}:${l}:${version}`;
  const layersKey = layers.join(',');

  useEffect(() => {
    if (!authorityId) return;
    let alive = true;
    const missing = layers.filter((l) => !cache.current.has(`${authorityId}:${l}:${version}`));
    if (!missing.length) return;
    setLoading((p) => Array.from(new Set([...p, ...missing])));
    for (const l of missing) {
      load(authorityId, l)
        .then((payload) => {
          cache.current.set(`${authorityId}:${l}:${version}`, payload);
          if (alive) { setErrors((e) => ({ ...e, [l]: undefined })); setTick((t) => t + 1); }
        })
        .catch((err: Error) => { if (alive) setErrors((e) => ({ ...e, [l]: err?.message ?? 'שגיאה' })); })
        .finally(() => { if (alive) setLoading((p) => p.filter((x) => x !== l)); });
    }
    return () => { alive = false; setLoading([]); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorityId, layersKey, version, load]);

  const data: HubLayerData = {};
  if (authorityId) for (const l of layers) {
    const p = cache.current.get(key(l));
    if (p) data[l] = p;
  }
  return { data, loading: authorityId ? loading : [], errors: authorityId ? errors : {} };
}
