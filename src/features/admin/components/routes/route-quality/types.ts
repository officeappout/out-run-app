import type { QualityVerdict, RouteQualityMetrics } from '@/lib/route-quality';

export type QualityVariant = 'off' | 'on';

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
