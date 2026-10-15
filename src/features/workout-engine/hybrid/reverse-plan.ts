/**
 * reverse-plan — the live hybrid plan walked the other way round a LOOP (G3.2). Pure list
 * reversal of already-composed segments: same stations (content, coordinates, parkId), same legs
 * and totals; only the order flips and `index` / cumulative `fromKm`/`toKm` are recomputed.
 * Never re-composes, never re-sequences (a cooldown stop that happened to be last becomes first —
 * moving it would be re-sequencing, which this deliberately does not do).
 */
import type { HybridPlannedSegment } from './compose-hybrid-session.service';

const round3 = (n: number) => Number(n.toFixed(3));

export function reverseHybridSegments(segments: readonly HybridPlannedSegment[]): HybridPlannedSegment[] {
  let km = 0;
  return [...segments].reverse().map((seg, i) => {
    const out: HybridPlannedSegment = { ...seg, index: i };
    if (seg.kind === 'aerobic' && typeof seg.distanceKm === 'number') {
      out.fromKm = round3(km);
      km += seg.distanceKm;
      out.toKm = round3(km);
    }
    return out;
  });
}
