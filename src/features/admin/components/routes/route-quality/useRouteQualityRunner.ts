'use client';
/**
 * Runs the live loop generator N times per variant (route quality v1 off /
 * on / on + our routes, via explicit per-call overrides — the panel flags are
 * not touched) and scores every returned route with src/lib/route-quality,
 * including its share on our mapped routes near the start.
 * Read-only: the generator only reads street_segments + our routes (existing
 * readers) + calls Mapbox; the OSM layer comes from Overpass through the
 * shared 7-day cache.
 * Variants 'gh' / 'ghours' call POST /api/routes/generate directly (no Mapbox
 * fallback, so a GraphHopper failure shows up as an empty run + error).
 */
import { useCallback, useRef, useState } from 'react';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { computeRouteQualityMetrics, evaluateLoopQuality, ourRoutesShare, type OsmRoadLayer, type OurRouteLine, type OurRoutesIndex } from '@/lib/route-quality';
import { getOsmRoadLayer } from '@/lib/route-quality/osm-layer-cache';
import type { ActivityType } from '@/features/parks';
import { fetchGraphhopperLoops } from '@/features/parks/core/services/graphhopper-loops';
import { ourRoutesRadiusKm, toWireOurRoutes } from '@/lib/routing/our-routes';
import { ALL_VARIANTS, VARIANT_LABEL, type QualityRunRoute, type QualityRunState, type QualityVariant } from './types';
import { loadOurRoutesForQuality } from './our-routes-loader';

export interface QualityRunRequest {
  start: { lat: number; lng: number };
  cityName: string;
  targetKm: number;
  activity: ActivityType;
  runs: number;
  variants: QualityVariant[];
}

const zeroes = () => Object.fromEntries(ALL_VARIANTS.map(v => [v, 0])) as Record<QualityVariant, number>;

/** GraphHopper loops as { name, distance, path } rows (errors → [] + message). */
async function runGraphhopper(req: QualityRunRequest, i: number, ours: OurRouteLine[] | null, onError: (m: string) => void) {
  if (req.activity === 'workout') return [];
  const targetKm = Math.max(req.targetKm, 1.5);
  const wire = ours ? toWireOurRoutes(ours, req.start, ourRoutesRadiusKm(targetKm)) : [];
  try {
    const res = await fetchGraphhopperLoops(
      { mode: 'loop', start: req.start, targetKm, activity: req.activity, seed: Date.now() % 100_000 + i, maxResults: 3, ...(wire.length ? { ourRoutes: wire } : {}) },
      { timeoutMs: 10_000 },
    );
    return res.loops.map(l => ({ name: `GH ${l.source === 'round_trip' ? 'round trip' : '3 נקודות'}`, distance: l.distanceKm, path: l.path }));
  } catch (e) {
    onError(`GraphHopper: ${(e as Error)?.message ?? 'שגיאה'}`);
    return [];
  }
}

const EMPTY: QualityRunState = {
  running: false, progress: '', routes: [], emptyGenerations: zeroes(), generations: zeroes(), osmStatus: 'idle', error: null,
};

export function useRouteQualityRunner() {
  const [state, setState] = useState<QualityRunState>(EMPTY);
  const [osm, setOsm] = useState<OsmRoadLayer | null>(null);
  const cancelled = useRef(false);

  const run = useCallback(async (req: QualityRunRequest) => {
    cancelled.current = false;
    setState({ ...EMPTY, running: true, progress: 'טוען שכבת כבישים ומעברים (OSM) ואת המסלולים שלנו…', osmStatus: 'loading' });
    // Same area key the generator asks for, so a v1 run reuses this exact layer.
    const [layer, ours] = await Promise.all([
      getOsmRoadLayer(req.start.lat, req.start.lng, Math.max(req.targetKm, 1.5) / 2 + 0.5).catch(() => null),
      loadOurRoutesForQuality(req.start, req.targetKm, req.cityName),
    ]);
    setOsm(layer);
    const index: OurRoutesIndex | null = ours.index;
    setState(s => ({ ...s, osmStatus: layer ? 'ready' : 'unavailable' }));

    const routes: QualityRunRoute[] = [];
    const generations = zeroes();
    const empty = zeroes();
    try {
      for (let i = 0; i < req.runs && !cancelled.current; i++) {
        for (const variant of req.variants) {
          if (cancelled.current) break;
          setState(s => ({ ...s, progress: `מריץ ${VARIANT_LABEL[variant]} · סבב ${i + 1}/${req.runs}` }));
          const t0 = performance.now();
          const out: Array<{ name: string; distance: number; path: unknown }> = variant === 'gh' || variant === 'ghours'
            ? await runGraphhopper(req, i, variant === 'ghours' ? ours.lines : null, msg => setState(s => ({ ...s, error: msg })))
            : await generateDynamicRoutes({
              userLocation: req.start,
              targetDistance: req.targetKm,
              activity: req.activity,
              routeGenerationIndex: Date.now() + i,
              preferences: { includeStrength: false, maxRoutes: 3 },
              parks: [],
              cityName: req.cityName,
              routeQualityV1: variant !== 'off',
              graphhopperRoutes: false,
              loopsPreferOfficial: variant === 'ours',
            });
          const ms = performance.now() - t0;
          generations[variant]++;
          if (out.length === 0) empty[variant]++;
          out.forEach((r, rank) => {
            const path = r.path as [number, number][];
            const metrics = computeRouteQualityMetrics(path, { targetKm: req.targetKm, osm: layer });
            routes.push({
              key: `${variant}-${i}-${rank}`, variant, run: i, rank, name: r.name,
              distanceKm: r.distance, path, metrics, verdict: evaluateLoopQuality(metrics),
              ours: index ? ourRoutesShare(path, index) : null, ms,
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
