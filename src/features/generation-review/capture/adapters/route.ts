/** Generated Route (Mapbox v1 / GraphHopper / A→B) → draft parts. */
import type { Route } from '@/features/parks/core/types/route.types';
import { haversineM } from '@/lib/route-quality/geo';
import { summarizeRouteLine } from '@/lib/generation-review/capture/route-summary';
import type { GenerationInput, GenerationOutput, GenerationType, RouteSummary } from '@/lib/generation-review/types';
import { profileInput } from './profile';
import { toActivity } from './hybrid';

export interface RouteCtx {
  activity?: string | null;
  targetKm?: number | null;
  /** true for a commute / destination (A→B) generation. */
  ab?: boolean;
}

function sourceOf(route: Route): RouteSummary['source'] {
  if (typeof route.id === 'string' && route.id.startsWith('gh-')) return 'graphhopper';
  if (route.source?.type === 'official_api' || route.published === true) return 'official';
  return 'mapbox_v1';
}

export function routeParts(route: Route, ctx: RouteCtx = {}): { type: GenerationType; input: GenerationInput; output: GenerationOutput } {
  const path = (route.path ?? []) as [number, number][];
  const loop = !ctx.ab && path.length > 1 && haversineM(path[0], path[path.length - 1]) < 80;
  const start = path[0] ? { lat: path[0][1], lng: path[0][0] } : null;
  const targetKm = ctx.ab ? null : (ctx.targetKm ?? null);
  return {
    type: ctx.ab ? 'route_ab' : 'route_loop',
    input: { ...profileInput(start), requestedActivity: toActivity(ctx.activity), targetKm },
    output: {
      title: null,
      planActivity: toActivity(route.activityType ?? route.type),
      totalMinutes: typeof route.duration === 'number' ? Math.round(route.duration) : null,
      exercises: [],
      legs: [],
      stations: [],
      route: summarizeRouteLine({ path, loop, targetKm, source: sourceOf(route) }),
    },
  };
}
