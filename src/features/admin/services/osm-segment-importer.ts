/**
 * OSM Segment Importer — shared logic for the CLI script and the admin UI.
 *
 * Responsibilities:
 *   1. Query the public Overpass API for highway ways inside a bounding box.
 *   2. Score each way 0–10 using a transparent rubric (highway type,
 *      surface, lighting, smoothness, max-speed, sidewalk).
 *   3. Build canonical `street_segments` documents (path + midpoint +
 *      length + tags + score).
 *   4. (optional) Commit them to Firestore in 500-doc batches.
 *
 * Used by:
 *   - src/scripts/import-osm-segments.ts (CLI, dry-run from anywhere; commit
 *     via REST + ID token, see that file)
 *   - src/app/admin/segments/page.tsx (admin UI, dry-run + commit via the
 *     authenticated browser session)
 */

import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OsmTags {
  highway?: string;
  surface?: string;
  lit?: string;
  smoothness?: string;
  maxspeed?: string;
  sidewalk?: string;
  [key: string]: string | undefined;
}

interface OsmGeometryNode {
  lat: number;
  lon: number;
}

export interface OsmWay {
  type: 'way';
  id: number;
  tags?: OsmTags;
  geometry?: OsmGeometryNode[];
}

interface OverpassResponse {
  elements: Array<{ type: string } & Partial<OsmWay>>;
}

export interface ScoredSegment {
  osmId: string;
  cityName: string;
  authorityId: string;
  path: Array<{ lat: number; lng: number }>;
  score: number;
  /**
   * OSM tag projection. Optional tags use `string | null` (not
   * `string | undefined`) on purpose: Firestore rejects field values of
   * `undefined` outright (`Unsupported field value: undefined`), but
   * accepts `null` and stores it as a queryable field. Using `null` lets
   * future code run queries like `where('tags.lit', '==', null)` to find
   * segments lacking lighting data.
   */
  tags: {
    highway: string;
    surface: string | null;
    lit: string | null;
    smoothness: string | null;
    maxspeed: string | null;
    sidewalk: string | null;
  };
  midpoint: { lat: number; lng: number };
  lengthMeters: number;
}

export interface ScoreHistogram {
  bucket3to4: number;
  bucket5to6: number;
  bucket7to8: number;
  bucket9to10: number;
}

export interface ImportOptions {
  bbox: BoundingBox;
  cityName: string;
  authorityId: string;
  /** Only segments with score >= this value are kept. Default 3. */
  minScore?: number;
  /** Skip ways with fewer than this many nodes. Default 3. */
  minNodes?: number;
}

export interface ImportResult {
  fetchedFromOSM: number;
  passedScoreFilter: number;
  skippedTooShort: number;
  skippedLowScore: number;
  histogram: ScoreHistogram;
  segments: ScoredSegment[];
  committed: number;
}

export type ProgressFn = (msg: string) => void;

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Ordered list of Overpass API endpoints. We try the main project endpoint
 * first (most up-to-date data, but the most overloaded), then fall through
 * to community mirrors that are usually faster but occasionally lag a few
 * minutes behind. Order matters — earlier entries are preferred.
 *
 * Sources:
 *   - main:    https://wiki.openstreetmap.org/wiki/Overpass_API
 *   - kumi:    https://overpass.kumi.systems/  (well-known fast mirror)
 *   - coffee:  https://overpass.private.coffee/ (community-run backup)
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;

/**
 * Server-side query budget (seconds) advertised in the `[out:json][timeout:N]`
 * directive. The default is 25s which is way too short for a Tel Aviv-sized
 * bbox (≈10k ways). 180s gives the server enough headroom and is well within
 * the public limits Overpass enforces.
 */
const OVERPASS_QUERY_TIMEOUT_SEC = 180;

/**
 * Client-side fetch abort timeout. Always longer than the server's own
 * timeout so we don't kill a query the server is still happily working on.
 * +30s covers connection setup, response streaming, and JSON parsing.
 */
const OVERPASS_FETCH_TIMEOUT_MS = (OVERPASS_QUERY_TIMEOUT_SEC + 30) * 1000;

/**
 * HTTP statuses where retrying makes sense. 504/503/502 = transient server
 * trouble, 429 = rate limit (Overpass returns it when the public load
 * balancer thinks we're hammering it). Anything else (400/401/403) is our
 * fault and a retry won't help.
 */
const OVERPASS_RETRY_STATUSES = new Set([429, 502, 503, 504]);

const OVERPASS_RETRY_DELAY_MS = 5_000;
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 2;

const HIGHWAY_TYPES = [
  'footway',
  'cycleway',
  'path',
  'pedestrian',
  'residential',
  'living_street',
  'tertiary',
] as const;

const HIGHWAY_TYPES_SET = new Set<string>(HIGHWAY_TYPES);

const FIRESTORE_BATCH_SIZE = 500;

// ── Overpass fetch ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the error is one we'd like to retry (network blips, gateway
 *  timeouts, abort) rather than re-throw immediately. */
function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const msg = err.message.toLowerCase();
  return (
    name === 'aborterror' ||
    name === 'timeouterror' ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

/**
 * Single attempt against a single endpoint. Returns the parsed JSON on
 * success, or throws — the caller decides whether to retry/fallback.
 */
async function fetchOverpassOnce(
  endpoint: string,
  body: string,
): Promise<OverpassResponse> {
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    OVERPASS_FETCH_TIMEOUT_MS,
  );

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(
        `Overpass API error ${res.status}: ${text.slice(0, 300)}`,
      );
      // Tag the status so the retry loop can distinguish transient from fatal.
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    return (await res.json()) as OverpassResponse;
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Sends an Overpass QL query for the requested bbox and returns the raw ways
 * with inline geometry. Resilient to gateway timeouts:
 *   1. Increased server timeout (180s) inside the QL itself.
 *   2. Up to 2 attempts per endpoint with a 5s back-off between them.
 *   3. Mirror fallback if the primary endpoint exhausts its attempts.
 *
 * Throws only after every endpoint has exhausted every attempt, surfacing
 * the most recent error so the admin UI / CLI can show something actionable.
 */
export async function fetchOsmSegments(
  bbox: BoundingBox,
  onProgress?: ProgressFn,
): Promise<OsmWay[]> {
  const { south, west, north, east } = bbox;
  const filter = HIGHWAY_TYPES.join('|');

  // `out tags geom` already minimises payload: it returns each way's tags
  // AND inline lat/lon for every node in a single call — no node-IDs, no
  // metadata, no second pass. Overpass QL has no per-tag projection
  // operator, so the only tag-payload knobs are (a) the highway-type regex
  // (already restricted to walkable/cyclable types) and (b) the bbox area.
  const query = `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];
(
  way["highway"~"^(${filter})$"](${south},${west},${north},${east});
);
out tags geom;
`.trim();

  const body = 'data=' + encodeURIComponent(query);

  onProgress?.(
    `Sending Overpass query for bbox (S=${south}, W=${west}, N=${north}, E=${east})…`,
  );
  onProgress?.(
    `  server timeout: ${OVERPASS_QUERY_TIMEOUT_SEC}s, fetch timeout: ${OVERPASS_FETCH_TIMEOUT_MS / 1000}s`,
  );

  let lastError: unknown = null;
  let json: OverpassResponse | null = null;

  outer: for (let e = 0; e < OVERPASS_ENDPOINTS.length; e++) {
    const endpoint = OVERPASS_ENDPOINTS[e];
    const host = new URL(endpoint).host;

    for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS_PER_ENDPOINT; attempt++) {
      onProgress?.(
        `  → ${host} (attempt ${attempt}/${OVERPASS_ATTEMPTS_PER_ENDPOINT})`,
      );

      try {
        json = await fetchOverpassOnce(endpoint, body);
        if (e > 0 || attempt > 1) {
          onProgress?.(`  ✓ succeeded on ${host} (attempt ${attempt}).`);
        }
        break outer;
      } catch (err) {
        lastError = err;
        const status = (err as Error & { status?: number }).status;
        const msg = err instanceof Error ? err.message : String(err);

        const transient =
          (status !== undefined && OVERPASS_RETRY_STATUSES.has(status)) ||
          isTransientFetchError(err);

        const moreAttempts = attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT;
        const moreEndpoints = e < OVERPASS_ENDPOINTS.length - 1;

        if (!transient) {
          // 4xx (other than 429) is our bug, not the server's — abort early
          // so the admin can fix the query / bbox.
          onProgress?.(
            `  ✗ ${host} returned non-retryable error: ${msg}`,
          );
          break outer;
        }

        if (moreAttempts) {
          onProgress?.(
            `  ⚠ ${host} transient failure (${msg}). Retrying in ${OVERPASS_RETRY_DELAY_MS / 1000}s…`,
          );
          await sleep(OVERPASS_RETRY_DELAY_MS);
        } else if (moreEndpoints) {
          onProgress?.(
            `  ⚠ ${host} exhausted retries (${msg}). Falling back to mirror…`,
          );
        } else {
          onProgress?.(
            `  ✗ All endpoints exhausted. Last error from ${host}: ${msg}`,
          );
        }
      }
    }
  }

  if (!json) {
    const lastMsg =
      lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
    throw new Error(
      `Overpass fetch failed across all ${OVERPASS_ENDPOINTS.length} endpoints. Last error: ${lastMsg}`,
    );
  }

  const ways: OsmWay[] = (json.elements ?? [])
    .filter((e) => e.type === 'way')
    .map((e) => ({
      type: 'way',
      id: e.id ?? 0,
      tags: e.tags,
      geometry: e.geometry,
    }));

  onProgress?.(`Overpass returned ${ways.length} ways.`);
  return ways;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Pure, deterministic 0–10 score for a single segment. Spec lives in the
 * caller — keep this function in lock-step with src/app/admin/segments/page.tsx
 * tooltips so admins always see what's being computed.
 */
export function scoreSegment(tags: OsmTags): number {
  let s = 5;

  switch (tags.highway) {
    case 'footway':
    case 'pedestrian':
      s += 2;
      break;
    case 'cycleway':
      s += 2;
      break;
    case 'living_street':
      s += 1.5;
      break;
    case 'residential':
      s += 1;
      break;
    case 'tertiary':
      s += 0;
      break;
    case 'path':
      // Not in the original spec table — treated as neutral. `path` covers
      // anything from a paved promenade to a hiking trail, so we leave it
      // at the base value and let surface/smoothness adjust it.
      s += 0;
      break;
  }

  switch (tags.surface) {
    case 'asphalt':
    case 'paving_stones':
      s += 1.5;
      break;
    case 'concrete':
      s += 1;
      break;
    case 'gravel':
    case 'dirt':
      s -= 1;
      break;
  }

  if (tags.lit === 'yes') s += 1;
  else if (tags.lit === 'no') s -= 0.5;

  switch (tags.smoothness) {
    case 'excellent':
    case 'good':
      s += 0.5;
      break;
    case 'bad':
    case 'horrible':
      s -= 1;
      break;
  }

  if (tags.maxspeed) {
    // Strip non-digits — handles "30", "30 mph", "RU:urban", etc. Anything
    // unparseable is silently ignored. Israel uses km/h exclusively, so we
    // do not differentiate units.
    const m = parseInt(tags.maxspeed, 10);
    if (!Number.isNaN(m)) {
      if (m <= 30) s += 1;
      else if (m > 50) s -= 2;
    }
  }

  if (tags.sidewalk === 'yes' || tags.sidewalk === 'both') s += 0.5;

  return Math.min(10, Math.max(0, s));
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function pathLengthMeters(path: Array<{ lat: number; lng: number }>): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += haversineMeters(path[i - 1], path[i]);
  }
  return sum;
}

// ── Process pipeline ──────────────────────────────────────────────────────────

/**
 * Pure transform: raw OSM ways → scored, filtered, document-ready segments.
 * No I/O. Returns the histogram and skip counters alongside the kept set.
 */
export function processSegments(
  ways: OsmWay[],
  opts: ImportOptions,
  onProgress?: ProgressFn,
): {
  segments: ScoredSegment[];
  histogram: ScoreHistogram;
  skippedTooShort: number;
  skippedLowScore: number;
} {
  const minScore = opts.minScore ?? 3;
  const minNodes = opts.minNodes ?? 3;

  const segments: ScoredSegment[] = [];
  let skippedTooShort = 0;
  let skippedLowScore = 0;

  ways.forEach((w, idx) => {
    if (!w.geometry || w.geometry.length < minNodes) {
      skippedTooShort++;
      return;
    }

    const tags = (w.tags ?? {}) as OsmTags;
    if (!tags.highway || !HIGHWAY_TYPES_SET.has(tags.highway)) {
      // Overpass shouldn't return these (regex filter), but be defensive.
      skippedTooShort++;
      return;
    }

    const path = w.geometry.map((n) => ({ lat: n.lat, lng: n.lon }));
    const rawScore = scoreSegment(tags);

    if (rawScore < minScore) {
      skippedLowScore++;
      return;
    }

    const midpoint = path[Math.floor(path.length / 2)];
    const lengthMeters = Math.round(pathLengthMeters(path));

    segments.push({
      osmId: String(w.id),
      cityName: opts.cityName,
      authorityId: opts.authorityId,
      path,
      score: Math.round(rawScore * 10) / 10,
      // EXPLICIT `?? null` per Firestore rule: undefined is rejected, null
      // is stored. The vast majority of OSM ways carry only `highway` and
      // maybe `surface`; everything else is sparse, so this default fires
      // constantly and was the source of the recent
      // `Unsupported field value: undefined (found in field tags.maxspeed)`
      // commit failure.
      tags: {
        highway: tags.highway,
        surface: tags.surface ?? null,
        lit: tags.lit ?? null,
        smoothness: tags.smoothness ?? null,
        maxspeed: tags.maxspeed ?? null,
        sidewalk: tags.sidewalk ?? null,
      },
      midpoint,
      lengthMeters,
    });

    if ((idx + 1) % 100 === 0) {
      onProgress?.(
        `… processed ${idx + 1}/${ways.length} ways (${segments.length} kept)`,
      );
    }
  });

  const histogram: ScoreHistogram = {
    bucket3to4: 0,
    bucket5to6: 0,
    bucket7to8: 0,
    bucket9to10: 0,
  };
  segments.forEach((s) => {
    if (s.score >= 9) histogram.bucket9to10++;
    else if (s.score >= 7) histogram.bucket7to8++;
    else if (s.score >= 5) histogram.bucket5to6++;
    else if (s.score >= 3) histogram.bucket3to4++;
  });

  return { segments, histogram, skippedTooShort, skippedLowScore };
}

// ── Firestore commit (browser / authenticated client SDK path) ────────────────

/**
 * Recursively drops keys whose value is strictly `undefined` from any
 * plain object/array, returning a structurally-cloned copy. Sentinels
 * such as `serverTimestamp()` are objects with internal symbols — we must
 * NOT walk into them, so anything that's not a plain object or array is
 * passed through untouched.
 *
 * This is belt-and-braces: `processSegments` already maps sparse OSM tags
 * to `null` (the explicit, queryable representation), but a recursive
 * stripper guarantees that any future field added to `ScoredSegment`
 * without a `?? null` default cannot crash a commit.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Writes scored segments to the `street_segments` collection in 500-doc
 * batches. Doc id = `osm_${osmId}` so re-imports overwrite cleanly.
 *
 * Authentication: relies on the caller's Firebase auth context. Works in
 * the admin UI (logged-in admin) but NOT from a bare Node CLI — the CLI
 * uses its own REST + ID token writer (see src/scripts/import-osm-segments.ts).
 */
export async function commitSegmentsToFirestore(
  segments: ScoredSegment[],
  onProgress?: ProgressFn,
): Promise<number> {
  const col = collection(db, 'street_segments');
  let written = 0;

  for (let i = 0; i < segments.length; i += FIRESTORE_BATCH_SIZE) {
    const slice = segments.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batch = writeBatch(db);
    slice.forEach((seg) => {
      const ref = doc(col, `osm_${seg.osmId}`);
      // Strip undefineds BEFORE attaching the serverTimestamp sentinel —
      // the sentinel is an opaque object that the stripper deliberately
      // refuses to recurse into (see isPlainObject), so attaching it
      // afterwards keeps it intact.
      const safeSeg = stripUndefinedDeep(seg);
      batch.set(ref, { ...safeSeg, importedAt: serverTimestamp() });
    });
    await batch.commit();
    written += slice.length;
    onProgress?.(
      `Committed batch ${Math.floor(i / FIRESTORE_BATCH_SIZE) + 1} — ${written}/${segments.length} written.`,
    );
  }

  return written;
}

// ── End-to-end orchestrator ───────────────────────────────────────────────────

/**
 * Convenience wrapper: fetch → score → (optionally) commit. Both the CLI
 * script and the admin UI delegate to this. The `commit` flag is the only
 * thing that distinguishes a dry run from a real import.
 */
export async function runOsmImport(
  opts: ImportOptions & { commit: boolean },
  onProgress?: ProgressFn,
): Promise<ImportResult> {
  const log: ProgressFn = onProgress ?? (() => undefined);

  const ways = await fetchOsmSegments(opts.bbox, log);
  const fetchedFromOSM = ways.length;

  const { segments, histogram, skippedTooShort, skippedLowScore } =
    processSegments(ways, opts, log);

  log(`Score histogram:`);
  log(`  3-4:  ${histogram.bucket3to4}`);
  log(`  5-6:  ${histogram.bucket5to6}`);
  log(`  7-8:  ${histogram.bucket7to8}`);
  log(`  9-10: ${histogram.bucket9to10}`);
  log(`  Total kept: ${segments.length}`);
  log(`  Skipped (too few nodes / unknown highway): ${skippedTooShort}`);
  log(`  Skipped (score < ${opts.minScore ?? 3}): ${skippedLowScore}`);

  let committed = 0;
  if (opts.commit) {
    log(
      `Committing ${segments.length} segments to Firestore (batches of ${FIRESTORE_BATCH_SIZE})…`,
    );
    committed = await commitSegmentsToFirestore(segments, log);
    log(`Commit complete: ${committed} docs written.`);
  } else {
    log(`DRY RUN — Firestore writes skipped.`);
  }

  return {
    fetchedFromOSM,
    passedScoreFilter: segments.length,
    skippedTooShort,
    skippedLowScore,
    histogram,
    segments,
    committed,
  };
}
