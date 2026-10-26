/**
 * "מה יש בדרך" as a vertical axis (board RP-13 phone 3): start → the points
 * the route already carries (facility stops, water, benches, fitness
 * stations, courts — route-overview's alongRoutePoints) → the steepest climb
 * of the stored elevation profile → finish, each with its km from the start
 * and the gap to the previous node. Only known data; pure.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { alongRoutePoints, elevationSummary, isLoopRoute, type AlongPointKind } from '@/features/parks/core/components/overview/route/route-overview';
import type { ElevationSamples } from '@/features/workout-engine/players/running/lib/route-elevation-ahead';
import { routeKm } from '@/features/workout-engine/players/running/lib/route-fit/distance-fit';
import type { MapT } from './place-workout-copy';

export type AxisNodeKind = AlongPointKind | 'climb' | 'finish';

export interface AxisNode {
  key: string;
  kind: AxisNodeKind;
  label: string;
  /** A second line ("6% · 300 מ׳", "חזרה לנקודת ההתחלה"). */
  note: string | null;
  km: number;
  /** km since the previous node (null for the first). */
  gapKm: number | null;
}

export const MAX_ALONG = 8;

export function routeAxisNodes(
  route: Pick<Route, 'path' | 'facilityStops' | 'nearbyAmenities' | 'distance' | 'routeShape'>,
  samples: ElevationSamples | null,
  t: MapT,
): AxisNode[] {
  const along = alongRoutePoints(route, t, MAX_ALONG + 1);
  const total = routeKm(route);
  const nodes: Omit<AxisNode, 'gapKm'>[] = [{ key: 'start', kind: 'start', label: t('placeWorkouts.axis.start'), note: null, km: 0 }];
  for (const p of along) {
    if (p.kind === 'start') continue;
    nodes.push({ key: p.key, kind: p.kind, label: p.label, note: null, km: p.km });
  }
  if (samples) {
    const climb = elevationSummary(samples).climb;
    if (climb && climb.toKm > climb.fromKm) {
      const lenM = Math.round((climb.toKm - climb.fromKm) * 1000);
      const grade = Math.round((climb.riseM / lenM) * 100);
      if (grade >= 1) {
        nodes.push({
          key: 'climb', kind: 'climb', label: t('placeWorkouts.axis.climb'),
          note: t('placeWorkouts.axis.climbNote', { grade: String(grade), len: String(Math.round(lenM / 10) * 10) }),
          km: climb.fromKm,
        });
      }
    }
  }
  if (total > 0) {
    nodes.push({
      key: 'finish', kind: 'finish', label: t('placeWorkouts.axis.finish'),
      note: isLoopRoute(route) ? t('placeWorkouts.axis.finishLoop') : null, km: total,
    });
  }
  // Nothing between start and finish → no axis (hide what's unknown).
  if (!nodes.some((n) => n.kind !== 'start' && n.kind !== 'finish')) return [];
  const sorted = [nodes[0], ...nodes.slice(1).sort((a, b) => a.km - b.km)];
  return sorted.map((n, i) => ({ ...n, km: round1(n.km), gapKm: i === 0 ? null : round1(n.km - sorted[i - 1].km) }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
