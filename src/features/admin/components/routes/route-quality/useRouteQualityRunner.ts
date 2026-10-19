'use client';
/**
 * Runs the live loop generator N times per variant (route quality v1 off /
 * on, via the explicit routeQualityV1 override — the panel flag is not
 * touched) and scores every returned route with src/lib/route-quality.
 * Read-only: the generator only reads street_segments + calls Mapbox; the
 * OSM layer comes from Overpass through the shared 7-day cache.
 * Variant 'gh' calls POST /api/routes/generate directly (no Mapbox fallback,
 * so a GraphHopper failure shows up as an empty run + error, not as Mapbox).
 */
import { useCallback, useRef, useState } from 'react';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { computeRouteQualityMetrics, evaluateLoopQuality, type OsmRoadLayer } from '@/lib/route-quality';
import { getOsmRoadLayer } from '@/lib/route-quality/osm-layer-cache';
import type { ActivityType } from '@/features/parks';
import { fetchGraphhopperLoops } from '@/features/parks/core/services/graphhopper-loops';
import type { QualityRunRoute, QualityRunState, QualityVariant } from './types';

export interface QualityRunRequest {
  start: { lat: number; lng: number };
  cityName: string;
  targetKm: number;
  activity: ActivityType;
  runs: number;
  variants: QualityVariant[];
}

/** GraphHopper loops as { name, distance, path } rows (errors → [] + message). */
async function runGraphhopper(req: QualityRunRequest, i: number, onError: (m: string) => void) {
  if (req.activity === 'workout') return [];
  try {
    const res = await fetchGraphhopperLoops(
      { mode: 'loop', start: req.start, targetKm: Math.max(req.targetKm, 1.5), activity: req.activity, seed: Date.now() % 100_000 + i, maxResults: 3 },
      { timeoutMs: 10_000 },
    );
    return res.loops.map(l => ({ name: `GH ${l.source === 'round_trip' ? 'round trip' : '3 נקודות'}`, distance: l.distanceKm, path: l.path }));
  } catch (e) {
    onError(`GraphHopper: ${(e as Error)?.message ?? 'שגיאה'}`);
    return [];
  }
}

const EMPTY: QualityRunState = {
  running: false, progress: '', routes: [], emptyGenerations: { off: 0, on: 0, gh: 0 }, generations: { off: 0, on: 0, gh: 0 }, osmStatus: 'idle', error: null,
};

export function useRouteQualityRunner() {
  const [state, setState] = useState<QualityRunState>(EMPTY);
  const [osm, setOsm] = useState<OsmRoadLayer | null>(null);
  const cancelled = useRef(false);

  const run = useCallback(async (req: QualityRunRequest) => {
    cancelled.current = false;
    setState({ ...EMPTY, running: true, progress: 'טוען שכבת כבישים ומעברים (OSM)…', osmStatus: 'loading' });
    // Same area key the generator asks for, so a v1 run reuses this exact layer.
    let layer: OsmRoadLayer | null = null;
    try { layer = await getOsmRoadLayer(req.start.lat, req.start.lng, Math.max(req.targetKm, 1.5) / 2 + 0.5); }
    catch { layer = null; }
    setOsm(layer);
    setState(s => ({ ...s, osmStatus: layer ? 'ready' : 'unavailable' }));

    const routes: QualityRunRoute[] = [];
    const generations = { off: 0, on: 0, gh: 0 };
    const empty = { off: 0, on: 0, gh: 0 };
    const label: Record<QualityVariant, string> = { off: 'נוכחי', on: 'v1', gh: 'GraphHopper' };
    try {
      for (let i = 0; i < req.runs && !cancelled.current; i++) {
        for (const variant of req.variants) {
          if (cancelled.current) break;
          setState(s => ({ ...s, progress: `מריץ ${label[variant]} · סבב ${i + 1}/${req.runs}` }));
          const t0 = performance.now();
          const out: Array<{ name: string; distance: number; path: unknown }> = variant === 'gh'
            ? await runGraphhopper(req, i, msg => setState(s => ({ ...s, error: msg })))
            : await generateDynamicRoutes({
              userLocation: req.start,
              targetDistance: req.targetKm,
              activity: req.activity,
              routeGenerationIndex: Date.now() + i,
              preferences: { includeStrength: false, maxRoutes: 3 },
              parks: [],
              cityName: req.cityName,
              routeQualityV1: variant === 'on',
              graphhopperRoutes: false,
            });
          const ms = performance.now() - t0;
          generations[variant]++;
          if (out.length === 0) empty[variant]++;
          out.forEach((r, rank) => {
            const metrics = computeRouteQualityMetrics(r.path as [number, number][], { targetKm: req.targetKm, osm: layer });
            routes.push({
              key: `${variant}-${i}-${rank}`, variant, run: i, rank, name: r.name,
              distanceKm: r.distance, path: r.path as [number, number][], metrics, verdict: evaluateLoopQuality(metrics), ms,
            });
          });
          setState(s => ({ ...s, routes: [...routes], generations: { ...generations }, emptyGenerations: { ...empty } }));
        }
      }
      setState(s => ({ ...s, running: false, progress: '' }));
    } catch (e) {
      setState(s => ({ ...s, running: false, progress: '', error: (e as Error)?.message ?? 'שגיאה' }));
    }
  }, []);

  const cancel = useCallback(() => { cancelled.current = true; }, []);
  const reset = useCallback(() => { setState(EMPTY); setOsm(null); }, []);
  return { state, osm, run, cancel, reset };
}
