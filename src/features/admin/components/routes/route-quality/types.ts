import type { OurRoutesShare, QualityVerdict, RouteQualityMetrics } from '@/lib/route-quality';

/**
 * off = current Mapbox generator, on = Mapbox + route quality v1, gh = GraphHopper (/api/routes/generate);
 * ours = v1 + loops prefer our routes, ghours = GraphHopper + our routes (enable_loops_prefer_official).
 */
export type QualityVariant = 'off' | 'on' | 'ours' | 'gh' | 'ghours';

export const ALL_VARIANTS: QualityVariant[] = ['off', 'on', 'ours', 'gh', 'ghours'];

export const VARIANT_LABEL: Record<QualityVariant, string> = { off: 'נוכחי', on: 'v1', ours: 'v1+שלנו', gh: 'GH', ghours: 'GH+שלנו' };

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
  /** Share on our mapped routes near the start; null when none were loaded. */
  ours: OurRoutesShare | null;
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
