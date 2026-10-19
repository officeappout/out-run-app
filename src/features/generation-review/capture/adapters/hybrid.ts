/** ComposedHybridSession (the object the hybrid overview shows) → draft parts. */
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';
import { haversineM } from '@/lib/route-quality/geo';
import { summarizeRouteLine, summarizeStations } from '@/lib/generation-review/capture/route-summary';
import type { Activity, GenerationInput, GenerationOutput, GenerationType, LegSummary } from '@/lib/generation-review/types';
import { summarizeExercises } from './workout';
import { profileInput } from './profile';

export interface HybridCtx {
  /** HybridStartIntent.mode when known. */
  mode?: string | null;
  /** The activity the user had selected (map preferences: walking / running / cycling). */
  requestedActivity?: string | null;
  /** The card / overview title the user saw (e.g. "ריצה + כוח"). */
  title?: string | null;
  targetMinutes?: number | null;
  targetKm?: number | null;
}

export function toActivity(v: string | null | undefined): Activity | null {
  if (!v) return null;
  if (v === 'walking' || v === 'walk') return 'walk';
  if (v === 'running' || v === 'run') return 'run';
  if (v === 'cycling' || v === 'cycle' || v === 'bike') return 'cycle';
  return null;
}

export function hybridTypeOf(composed: ComposedHybridSession, mode?: string | null): GenerationType {
  if (mode === 'full_park_workout') return 'hybrid_full_park';
  if (mode === 'route_stops') return 'hybrid_route_stops';
  if (mode === 'smart_walk_strength') return 'hybrid_smart_walk';
  if (mode) return 'hybrid_free_aerobic';
  if (composed.fullParkRun === false) return 'hybrid_route_stops';
  if (composed.bolts) return 'hybrid_full_park';
  return 'hybrid_free_aerobic';
}

export function hybridParts(composed: ComposedHybridSession, ctx: HybridCtx = {}): { type: GenerationType; input: GenerationInput; output: GenerationOutput } {
  const plan = composed.bolts?.plans?.[composed.bolts.selectedIndex] ?? composed.plan;
  const gearByPark = new Map<string, string[]>();
  const legs: LegSummary[] = (plan?.segments ?? []).slice(0, 30).map((seg) => {
    if (seg.kind === 'strength') {
      if (seg.parkId && seg.availableEquipment) gearByPark.set(seg.parkId, seg.availableEquipment);
      const sec = seg.content?.estimatedDurationSec;
      return {
        activity: 'strength',
        distanceM: null,
        minutes: typeof sec === 'number' ? Math.round((sec / 60) * 10) / 10 : null,
        parkId: seg.parkId ?? null,
        exercises: summarizeExercises(seg.content?.exercises, seg.availableEquipment ?? null),
      };
    }
    return {
      activity: toActivity(seg.aerobicType) ?? 'other',
      distanceM: typeof seg.distanceKm === 'number' ? Math.round(seg.distanceKm * 1000) : null,
      minutes: typeof seg.durationSec === 'number' ? Math.round((seg.durationSec / 60) * 10) / 10 : null,
    };
  });
  const path = composed.routePath ?? [];
  const loop = path.length > 1 && haversineM(path[0], path[path.length - 1]) < 80;
  const rawStations = (composed.stations ?? (composed.station ? [composed.station] : []))
    .filter((s) => typeof s.parkId === 'string' && s.parkId)
    .map((s) => ({ parkId: s.parkId as string, lat: s.lat, lng: s.lng, equipment: gearByPark.get(s.parkId as string) ?? null }));
  const totals = plan?.totals;
  const start = path[0] ? { lat: path[0][1], lng: path[0][0] } : null;
  return {
    type: hybridTypeOf(composed, ctx.mode),
    input: {
      ...profileInput(start),
      requestedActivity: toActivity(ctx.requestedActivity),
      targetMinutes: ctx.targetMinutes ?? null,
      targetKm: ctx.targetKm ?? null,
      location: 'park',
    },
    output: {
      title: composed.sessionTitle ?? null,
      planLabel: ctx.title ?? null,
      planActivity: toActivity(composed.aerobicKind),
      totalMinutes: totals ? Math.round(totals.aerobicMin + totals.strengthMin) : null,
      exercises: [],
      legs,
      stations: summarizeStations(rawStations, path),
      route: summarizeRouteLine({ path, loop, targetKm: ctx.targetKm ?? null, source: 'unknown' }),
    },
  };
}
