/**
 * GraphHopper path → RoutedPath: geometry, elevation, distance/time, and the
 * road_class / crossing path details folded into shares and counts.
 * Pure — no I/O.
 */
import { haversineM, type LngLat } from '@/lib/route-quality';
import type { CrossingKind, GhDetailInterval, GhPath, RoutedPath } from './types';

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const GRADE_WINDOW_M = 50;

/** GraphHopper `crossing` values → OUT's crossing control vocabulary. */
export function crossingKind(v: unknown): CrossingKind | null {
  switch (String(v ?? '').toLowerCase()) {
    case 'traffic_signals': return 'signalled';
    case 'marked':
    case 'uncontrolled': return 'marked';
    case 'unmarked':
    case 'no': return 'unmarked';
    default: return null; // missing / railway / railway_barrier
  }
}

function segmentLengths(path: LngLat[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < path.length; i++) out.push(haversineM(path[i - 1], path[i]));
  return out;
}

function lengthOf(seg: number[], from: number, to: number): number {
  let s = 0;
  for (let i = Math.max(0, from); i < Math.min(to, seg.length); i++) s += seg[i];
  return s;
}

function roadClassShare(details: GhDetailInterval[] | undefined, seg: number[], total: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!details || total <= 0) return out;
  for (const [from, to, v] of details) {
    const k = String(v ?? 'missing').toLowerCase();
    out[k] = (out[k] ?? 0) + lengthOf(seg, from, to) / total;
  }
  return out;
}

function crossingCounts(details: GhDetailInterval[] | undefined): Record<CrossingKind, number> {
  const out: Record<CrossingKind, number> = { signalled: 0, marked: 0, unmarked: 0 };
  for (const [, , v] of details ?? []) {
    const k = crossingKind(v);
    if (k) out[k]++;
  }
  return out;
}

/** Steepest grade over windows of >= GRADE_WINDOW_M (single-segment noise ignored). */
export function maxGradePct(path: LngLat[], ele: number[]): number {
  const seg = segmentLengths(path);
  let best = 0;
  for (let i = 0, j = 0, run = 0; i < seg.length; i++) {
    run += seg[i];
    while (run - seg[j] >= GRADE_WINDOW_M && j < i) { run -= seg[j]; j++; }
    if (run >= GRADE_WINDOW_M) best = Math.max(best, (Math.abs(ele[i + 1] - ele[j]) / run) * 100);
  }
  return Math.round(best * 10) / 10;
}

export function mapGhPath(p: GhPath): RoutedPath {
  const coords = p.points?.coordinates ?? [];
  const path: LngLat[] = coords.map(c => [c[0], c[1]]);
  const elevations = coords.map(c => (typeof c[2] === 'number' ? c[2] : 0));
  const seg = segmentLengths(path);
  const total = seg.reduce((a, b) => a + b, 0);
  const share = roadClassShare(p.details?.road_class, seg, total);
  const major = Object.entries(share).reduce((a, [k, v]) => a + (MAJOR.has(k) ? v : 0), 0);
  return {
    path,
    elevations,
    distanceM: p.distance,
    timeMs: p.time,
    ascendM: p.ascend ?? 0,
    descendM: p.descend ?? 0,
    maxGradePct: maxGradePct(path, elevations),
    roadClassShare: share,
    majorRoadShare: Math.min(1, major),
    crossings: crossingCounts(p.details?.crossing),
  };
}
