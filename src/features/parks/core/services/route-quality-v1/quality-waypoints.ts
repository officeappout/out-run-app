/**
 * v1 waypoint candidates: street segments read by geohash ring sampling
 * (ring-cells.ts — a few hundred docs instead of 1–6k, cached per cell for
 * CELL_TTL_MS so a regenerate at the same spot reads nothing), each turned
 * into a point ON its street with the street's bearing (segment-anchor.ts)
 * and a calm-street quality (segment-quality.ts). Arterial segments, and
 * segments hugging a tertiary+ road when the OSM layer is at hand (separately
 * mapped sidewalks), are dropped.
 */
import { collection, endAt, getDocs, limit, orderBy, query, startAt } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { OsmRoadLayer } from '@/lib/route-quality';
import { anchorOnSegment } from './segment-anchor';
import { isArterialSegment, segmentQuality, type SegmentTags } from './segment-quality';
import { ringCells } from './ring-cells';
import { nearMajorRoad } from './near-major-road';

const CELL_LIMIT = 10;
const CELL_TTL_MS = 15 * 60 * 1000;
const MIN_SCORE = 6;
const RELAXED_MIN_SCORE = 4;
/** Below this many usable candidates the caller falls back to the legacy fetch. */
export const MIN_V1_CANDIDATES = 3;

export interface V1SegmentDoc {
  score?: number;
  path?: Array<{ lat: number; lng: number }>;
  tags?: SegmentTags;
  isOfficial?: boolean;
  officialRouteId?: string;
}

export interface QualityCandidate {
  lat: number;
  lng: number;
  isOfficial: boolean;
  flowScore: number;
  /** Street bearing at the anchor (deg) — Mapbox `bearings`. */
  bearingDeg: number;
  /** 0..10 calm-street quality — scoreWaypoint's preferQuietSegments. */
  segQuality: number;
  snapped: true;
}

const cellCache = new Map<string, { at: number; docs: Array<{ id: string; seg: V1SegmentDoc }> }>();

async function readCell(cell: string): Promise<{ docs: Array<{ id: string; seg: V1SegmentDoc }>; reads: number }> {
  const hit = cellCache.get(cell);
  if (hit && Date.now() - hit.at < CELL_TTL_MS) return { docs: hit.docs, reads: 0 };
  const snap = await getDocs(query(collection(db, 'street_segments'), orderBy('geohash'), startAt(cell), endAt(cell + '~'), limit(CELL_LIMIT)));
  const docs = snap.docs.map(d => ({ id: d.id, seg: d.data() as V1SegmentDoc }));
  cellCache.set(cell, { at: Date.now(), docs });
  return { docs, reads: Math.max(1, docs.length) };
}

/** Test hook. */
export function clearQualityWaypointCache(): void { cellCache.clear(); }

export interface QualityWaypointsResult {
  candidates: QualityCandidate[];
  cellsQueried: number;
  docsRead: number;
  docsSeen: number;
}

export async function fetchQualityWaypointsV1(
  userLocation: { lat: number; lng: number },
  idealKm: number,
  osmLayer: Promise<OsmRoadLayer | null> | OsmRoadLayer | null,
): Promise<QualityWaypointsResult> {
  const cells = ringCells(userLocation, idealKm);
  // Cell reads and the (cached) OSM layer load run side by side.
  const [results, osm] = await Promise.all([Promise.all(cells.map(readCell)), Promise.resolve(osmLayer)]);
  const seen = new Set<string>();
  const docs: V1SegmentDoc[] = [];
  let docsRead = 0;
  for (const r of results) {
    docsRead += r.reads;
    for (const d of r.docs) if (!seen.has(d.id)) { seen.add(d.id); docs.push(d.seg); }
  }
  const build = (minScore: number) => {
    const out: QualityCandidate[] = [];
    for (const seg of docs) {
      if ((seg.score ?? 0) < minScore || isArterialSegment(seg.tags)) continue;
      const a = anchorOnSegment(seg.path);
      if (!a) continue;
      if (osm && nearMajorRoad(osm, a.lat, a.lng)) continue;
      out.push({
        lat: a.lat, lng: a.lng, bearingDeg: a.bearingDeg, snapped: true,
        isOfficial: seg.isOfficial === true || seg.officialRouteId != null,
        flowScore: 0,
        segQuality: segmentQuality(seg.tags),
      });
    }
    return out;
  };
  let candidates = build(MIN_SCORE);
  if (candidates.length < MIN_V1_CANDIDATES) candidates = build(RELAXED_MIN_SCORE);
  return { candidates, cellsQueried: cells.length, docsRead, docsSeen: docs.length };
}
