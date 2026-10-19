/**
 * trail-graph/elevation-backfill.ts — pure planning for the one-off
 * `elevationProfile` backfill onto EXISTING official_routes
 * (owner-approved 19.10.2026; scripts/trails/backfill-elevation-profile.ts).
 *
 * Pure: no Firestore, no file system, no DEM I/O. The script reads pages of
 * route docs, hands each one here with a `sample` function (Copernicus
 * GLO-30 via computeElevationProfileSamples), and gets back what to do:
 *   - 'write'        → a 64-sample profile for this route's OWN stored path
 *   - 'has_profile'  → already has a valid profile (idempotent re-runs)
 *   - 'bad_path'     → path missing / < 2 finite points
 *   - 'dem_gap'      → any sample outside DEM coverage → skipped, never guessed
 */
import type { StoredElevationProfile } from '../dem-tile-cache/elevation-profile';
import type { LngLat } from './types';

export type BackfillStatus = 'write' | 'has_profile' | 'bad_path' | 'dem_gap';

export interface BackfillEntry {
  id: string;
  name: string | null;
  status: BackfillStatus;
  pathPoints: number;
  profile?: StoredElevationProfile;
  /** For the dry-run report. */
  minEleM?: number;
  maxEleM?: number;
}

/**
 * A stored route path → [lng, lat][]. Accepts the persisted `{lng,lat}`
 * object form and the in-memory `[lng, lat]` tuple form (the schema allows
 * both). null for anything unusable — one bad vertex rejects the path.
 */
export function pathToLngLat(path: unknown): LngLat[] | null {
  if (!Array.isArray(path) || path.length < 2) return null;
  const out: LngLat[] = [];
  for (const p of path) {
    let lng: unknown;
    let lat: unknown;
    if (Array.isArray(p)) { lng = p[0]; lat = p[1]; }
    else if (p && typeof p === 'object') { lng = (p as { lng?: unknown }).lng; lat = (p as { lat?: unknown }).lat; }
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    out.push([lng, lat]);
  }
  return out;
}

/** Same bounds the official_routes schema enforces (stepM > 0, 2..256 finite values). */
export function hasValidElevationProfile(doc: Record<string, unknown>): boolean {
  const p = doc.elevationProfile as { stepM?: unknown; elevationsM?: unknown } | undefined;
  if (!p || typeof p !== 'object') return false;
  if (typeof p.stepM !== 'number' || !Number.isFinite(p.stepM) || p.stepM <= 0) return false;
  const e = p.elevationsM;
  return Array.isArray(e) && e.length >= 2 && e.length <= 256 && e.every((v) => typeof v === 'number' && Number.isFinite(v));
}

export interface LngLatBbox { latMin: number; lonMin: number; latMax: number; lonMax: number }

export function bboxOfPath(path: readonly LngLat[]): LngLatBbox {
  let latMin = Infinity, lonMin = Infinity, latMax = -Infinity, lonMax = -Infinity;
  for (const [lng, lat] of path) {
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (lng < lonMin) lonMin = lng;
    if (lng > lonMax) lonMax = lng;
  }
  return { latMin, lonMin, latMax, lonMax };
}

export function planRouteBackfill(
  id: string,
  data: Record<string, unknown>,
  sample: (path: LngLat[]) => StoredElevationProfile | null,
): BackfillEntry {
  const name = typeof data.name === 'string' ? data.name : null;
  const rawLen = Array.isArray(data.path) ? data.path.length : 0;
  if (hasValidElevationProfile(data)) return { id, name, status: 'has_profile', pathPoints: rawLen };
  const path = pathToLngLat(data.path);
  if (!path) return { id, name, status: 'bad_path', pathPoints: rawLen };
  const profile = sample(path);
  if (!profile) return { id, name, status: 'dem_gap', pathPoints: path.length };
  return {
    id, name, status: 'write', pathPoints: path.length, profile,
    minEleM: Math.min(...profile.elevationsM),
    maxEleM: Math.max(...profile.elevationsM),
  };
}

export interface BackfillCounts { scanned: number; write: number; has_profile: number; bad_path: number; dem_gap: number }

export const EMPTY_COUNTS: BackfillCounts = { scanned: 0, write: 0, has_profile: 0, bad_path: 0, dem_gap: 0 };

export function addCounts(c: BackfillCounts, entries: readonly BackfillEntry[]): BackfillCounts {
  const n = { ...c, scanned: c.scanned + entries.length };
  for (const e of entries) n[e.status] += 1;
  return n;
}

/**
 * Resume checkpoint: the last doc id whose page is FULLY done (written in
 * --apply). Scoped to project + authority filter so a checkpoint from one
 * target can never steer a run against another.
 */
export interface BackfillCheckpoint {
  version: 1;
  projectId: string;
  authorityId: string | null;
  lastDocId: string | null;
  counts: BackfillCounts;
  written: number;
  done: boolean;
  updatedAt: string;
}

export function freshCheckpoint(projectId: string, authorityId: string | null): BackfillCheckpoint {
  return { version: 1, projectId, authorityId, lastDocId: null, counts: { ...EMPTY_COUNTS }, written: 0, done: false, updatedAt: new Date(0).toISOString() };
}

/** A stored checkpoint is reused only for the same target + filter; otherwise start fresh. */
export function resumeFrom(stored: unknown, projectId: string, authorityId: string | null): BackfillCheckpoint {
  const s = stored as Partial<BackfillCheckpoint> | null;
  if (!s || s.version !== 1 || s.projectId !== projectId || (s.authorityId ?? null) !== authorityId) {
    return freshCheckpoint(projectId, authorityId);
  }
  return {
    version: 1, projectId, authorityId,
    lastDocId: typeof s.lastDocId === 'string' ? s.lastDocId : null,
    counts: { ...EMPTY_COUNTS, ...(s.counts ?? {}) },
    written: typeof s.written === 'number' ? s.written : 0,
    done: s.done === true,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date(0).toISOString(),
  };
}

export interface BackfillLimits { pageSize: number; maxRoutes: number; batchSize: number; pauseMs: number }

export const DEFAULT_LIMITS: BackfillLimits = { pageSize: 100, maxRoutes: 5000, batchSize: 100, pauseMs: 1000 };

/** Parse --page-size / --max-routes / --batch-size / --pause-ms within hard bounds. */
export function parseLimits(get: (name: string) => string | null): BackfillLimits {
  const num = (name: string, def: number, min: number, max: number) => {
    const v = get(name);
    if (v == null) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer in [${min}, ${max}] (got "${v}")`);
    return n;
  };
  return {
    pageSize: num('page-size', DEFAULT_LIMITS.pageSize, 1, 300),
    maxRoutes: num('max-routes', DEFAULT_LIMITS.maxRoutes, 1, 50_000),
    batchSize: num('batch-size', DEFAULT_LIMITS.batchSize, 1, 400),
    pauseMs: num('pause-ms', DEFAULT_LIMITS.pauseMs, 0, 60_000),
  };
}
