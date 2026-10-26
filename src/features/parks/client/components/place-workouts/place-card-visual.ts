/**
 * The main visual of a place workout card (pure, owner 26.10):
 *   strength (the park workout)  → the workout's exercise media (place-card-media)
 *   run / walk / hybrid          → the workout's intensity graph, the same
 *                                  ProfileStrip + buildIntensityStrip the home
 *                                  run card draws
 *
 * Today's planned run uses its real blocks. The others have no materialized
 * workout yet, so their graph is built from what will actually run, through
 * the same strip builder: a free run on the route = one steady easy block, a
 * walk = one walk block, a hybrid = aerobic legs with strength stations
 * between them (the hybrid composer's "loop + stations" shape).
 */

import type { ProfileStripSegment } from '@/components/ui/v2/ProfileStrip';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import type { RunBlock } from '@/features/workout-engine/players/running/types/run-block.type';
import { buildIntensityStrip } from '@/features/workout-engine/players/running/utils/run-preview/run-strip';
import type { RunPaceContext } from '@/features/workout-engine/players/running/utils/run-preview/run-estimates';
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';

export type PlaceCardVisual =
  | { kind: 'media' }
  | { kind: 'graph'; segments: ProfileStripSegment[] };

/** A hybrid's strength stations (the "loop + stations" shape) and each one's minutes. */
export const HYBRID_STATIONS = 3;
export const HYBRID_STATION_MIN = 4;
/** Station bar: strength track colour, high effort. */
const STATION_HEIGHT = 90;
const FALLBACK_MIN = 30;

function block(id: string, type: RunBlock['type'], zoneType: RunBlock['zoneType'], minutes: number): RunBlock {
  return { id, type, label: id, zoneType, durationSeconds: Math.max(1, Math.round(minutes * 60)), colorHex: '' };
}

function steady(kind: 'running' | 'walking', minutes: number, ctx: RunPaceContext, id = 'steady'): ProfileStripSegment[] {
  const segs = buildIntensityStrip([block(id, 'run', kind === 'walking' ? 'walk' : 'easy', minutes)], ctx);
  // A walk is the workout here, not a rest between reps: the walking track colour.
  return kind === 'walking' ? segs.map((s) => ({ ...s, color: TRACK_COLORS.walk })) : segs;
}

function hybridGraph(aerobic: 'running' | 'walking', minutes: number, ctx: RunPaceContext): ProfileStripSegment[] {
  const legMin = Math.max(2, (minutes - HYBRID_STATIONS * HYBRID_STATION_MIN) / (HYBRID_STATIONS + 1));
  const out: ProfileStripSegment[] = [];
  for (let i = 0; i <= HYBRID_STATIONS; i++) {
    out.push(...steady(aerobic, legMin, ctx, `leg${i}`));
    if (i < HYBRID_STATIONS) out.push({ key: `station${i}`, color: TRACK_COLORS.strength, flex: HYBRID_STATION_MIN, height: STATION_HEIGHT });
  }
  return out;
}

export function placeCardVisual(
  s: PlaceWorkoutSuggestion,
  opts: { planRunBlocks: readonly RunBlock[] | null; paceCtx: RunPaceContext },
): PlaceCardVisual {
  const { start } = s;
  // Strength is exercise media only — never a graph, whatever start it carries (owner 26.10).
  if (s.style === 'strength' || start.kind === 'park_strength') return { kind: 'media' };
  const minutes = s.durationMin ?? FALLBACK_MIN;
  switch (start.kind) {
    case 'planned_run':
      return {
        kind: 'graph',
        segments: opts.planRunBlocks?.length ? buildIntensityStrip(opts.planRunBlocks, opts.paceCtx) : steady('running', minutes, opts.paceCtx),
      };
    case 'route_activity':
      return { kind: 'graph', segments: steady(start.activity, minutes, opts.paceCtx) };
    case 'hybrid':
      return { kind: 'graph', segments: hybridGraph(start.aerobicKind, start.minutes, opts.paceCtx) };
  }
}
