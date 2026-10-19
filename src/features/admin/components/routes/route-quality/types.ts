import type { QualityVerdict, RouteQualityMetrics } from '@/lib/route-quality';

/** off = current Mapbox generator, on = Mapbox + route quality v1, gh = GraphHopper (/api/routes/generate). */
export type QualityVariant = 'off' | 'on' | 'gh';

export interface QualityRunRoute {
  key: string;
  variant: QualityVariant;
  run: number;
  rank: number;
  name: string;
  distanceKm: number;
  path: [number, number][];
  metrics: RouteQualityMetrics;
  verdict: QualityVerdict;
  ms: number;
}

export interface QualityRunState {
  running: boolean;
  progress: string;
  routes: QualityRunRoute[];
  emptyGenerations: Record<QualityVariant, number>;
  generations: Record<QualityVariant, number>;
  osmStatus: 'idle' | 'loading' | 'ready' | 'unavailable';
  error: string | null;
}
