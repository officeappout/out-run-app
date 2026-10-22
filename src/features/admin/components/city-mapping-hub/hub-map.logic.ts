/**
 * hub-map.logic.ts — pure helpers for HubMap (no React, no mapbox): the
 * national authority dots and the colours shared with the legend.
 * Maps are never mirrored in RTL — east stays on the right.
 */
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import type { FC } from '@/lib/city-mapping-hub/layer-payload';

export const LEVEL_COLORS = { red: '#ef4444', yellow: '#f59e0b', green: '#10b981', none: '#94a3b8' } as const;
export const ROUTE_COLORS = { approved: '#06b6d4', pending: '#f97316' } as const;

/** Israel, roughly — the national view. */
export const ISRAEL_BOUNDS: [[number, number], [number, number]] = [[34.2, 29.45], [35.95, 33.35]];

/** Dot radius by population: 5 px floor, √-scaled, 18 px cap. Unknown population = small. */
export function dotRadius(population: number | null): number {
  if (!population || population <= 0) return 5;
  return Math.max(5, Math.min(18, 4 + Math.sqrt(population) / 60));
}

/** One point per authority that has a valid center; `dim` = filtered out of the table. */
export function authorityPointsFC(rows: HubRow[], visibleIds: ReadonlySet<string>): FC {
  return {
    type: 'FeatureCollection',
    features: rows.filter((r) => r.center).map((r) => ({
      type: 'Feature' as const,
      id: r.authorityId,
      properties: {
        id: r.authorityId,
        name: r.name,
        color: LEVEL_COLORS[r.level ?? 'none'],
        radius: dotRadius(r.population),
        dim: visibleIds.has(r.authorityId) ? 0 : 1,
      },
      geometry: { type: 'Point' as const, coordinates: [r.center!.lng, r.center!.lat] },
    })),
  };
}

/** Routes FC filtered to the enabled statuses (a chip off = its lines hidden, not refetched). */
export function filterRoutesFC(fc: FC | undefined, statuses: ReadonlySet<string>): FC {
  return {
    type: 'FeatureCollection',
    features: (fc?.features ?? []).filter((f) => statuses.has(String(f.properties?.status))),
  };
}
