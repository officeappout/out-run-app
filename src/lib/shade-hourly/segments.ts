/**
 * Street segments for the hourly build: walkable OSM ways split into pieces
 * of at most `maxPieceM`, so each piece's profile describes one local stretch
 * (a 1 km boulevard is shaded at one end and sunny at the other).
 *
 * Piece id = wayId × 1000 + pieceIndex (exact in a float64 for any real OSM id).
 * Pure.
 */
import { haversineM } from '../shade/geometry';
import type { LonLat } from '../shade/types';

export const MAX_PIECE_M = 100;

/** highway=* values a walker / runner uses. Motorways and trunks are excluded. */
export const WALKABLE_HIGHWAYS: ReadonlySet<string> = new Set([
  'footway', 'pedestrian', 'path', 'living_street', 'residential', 'tertiary', 'tertiary_link',
  'secondary', 'secondary_link', 'primary', 'primary_link', 'unclassified', 'cycleway', 'steps',
  'service', 'track', 'bridleway',
]);

export function isWalkableHighway(tags: Record<string, string>): boolean {
  const h = tags.highway;
  if (!h || !WALKABLE_HIGHWAYS.has(h)) return false;
  if (tags.access === 'private' || tags.foot === 'no') return false;
  if (tags.area === 'yes') return false;
  return true;
}

export function pieceId(wayId: number, piece: number): number {
  return wayId * 1000 + piece;
}

/** Split a line into consecutive pieces of ≤ maxPieceM (interpolating cut points). */
export function splitLine(line: LonLat[], maxPieceM = MAX_PIECE_M): LonLat[][] {
  if (line.length < 2) return [];
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineM(line[i - 1], line[i]);
  if (!(total > 0)) return [];
  const n = Math.max(1, Math.ceil(total / maxPieceM));
  const target = total / n;
  const pieces: LonLat[][] = [];
  let cur: LonLat[] = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    let a = line[i - 1];
    const b = line[i];
    let segLen = haversineM(a, b);
    while (pieces.length < n - 1 && acc + segLen >= target && segLen > 0) {
      const t = (target - acc) / segLen;
      const cut: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      cur.push(cut);
      pieces.push(cur);
      cur = [cut];
      segLen -= target - acc;
      a = cut;
      acc = 0;
    }
    acc += segLen;
    cur.push(b);
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces;
}
