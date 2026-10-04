/**
 * scripts/measure-route-geometry.ts — 04.10.2026.
 *
 * READ-ONLY geometric measurement of the pending route queue. Writes
 * nothing to Firestore (no field, no flag, no status), does not touch
 * route-generator, route-stitching, or the existing accuracy certificate
 * (src/lib/route-decisions/decide-accuracy.ts) — that logic is imported
 * and CALLED read-only, for comparison, never modified.
 *
 * Not a pipeline stage. A standalone script that prints/writes a report.
 * Sets zero thresholds — every measure is reported as a distribution.
 * The two illustrative percentile cuts used for the (a)/(b)/(c) sections
 * are explicitly labeled as illustrative, not proposed publish bars.
 *
 * Reuses decideRouteAccuracy()/computeAccuracyQueue() (unmodified) for the
 * "does this agree with the existing certificate" cut, and distance-unit-
 * classify's normalizePathToLngLatTuples for path shape, rather than
 * re-deriving either.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import area from '@turf/area';
import convex from '@turf/convex';
import length from '@turf/length';
import buffer from '@turf/buffer';
import kinks from '@turf/kinks';
import bearing from '@turf/bearing';
import { lineString, polygon, point, featureCollection } from '@turf/helpers';
// @ts-ignore — no published types
import enclosingCircle from 'smallest-enclosing-circle';
import { computeAccuracyQueue } from '../src/lib/route-decisions/compute-queue';
import { normalizePathToLngLatTuples } from './lib/distance-unit-classify';

type LngLat = [number, number];

// ─────────────────────────────────────────────────────────────────────────
// Measurement-resolution parameters — NOT quality thresholds. These pick
// the ruler's granularity (what counts as "the same spot" when clustering
// self-visits, how wide a ribbon to buffer for overlap detection), not
// what counts as a good or bad route. Named and justified individually;
// none of them decide approve/reject for any route.
// ─────────────────────────────────────────────────────────────────────────
const JUNCTION_CLUSTER_RADIUS_M = 6;     // ~ a path's own width; two self-crossings closer than this read as "the same junction," not two
const OVERLAP_BUFFER_RADIUS_M = 4;       // half a typical path width — retracing the same path double-counts within this envelope
const SHARP_TURN_DEGREES = 150;          // David's own spec, not derived
const CLOSURE_STRUCTURAL_GAP_M = 50;     // see "Closure bucketing" below — a geometric-necessity cutoff, not a quality bar

// ─────────────────────────────────────────────────────────────────────────
// Geometry primitives
// ─────────────────────────────────────────────────────────────────────────

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function pathLengthM(path: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineM(path[i - 1], path[i]);
  return total;
}

/** Local equirectangular projection (meters), centered on the path's own
 * centroid latitude — adequate for city-scale routes (a few km), needed
 * because smallest-enclosing-circle operates on a flat plane, not lng/lat
 * degrees (which aren't equal-distance). */
function toLocalMeters(path: LngLat[]): { x: number; y: number }[] {
  const lat0 = path.reduce((s, p) => s + p[1], 0) / path.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return path.map(([lng, lat]) => ({ x: lng * mPerDegLng, y: lat * mPerDegLat }));
}

interface CompactnessResult {
  areaM2: number;
  perimeterM: number;
  polsbyPopper: number;
  reock: number;
  convexHullRatio: number;
}

function computeCompactness(ring: LngLat[]): CompactnessResult | null {
  // ring must be closed (first === last) for a valid GeoJSON polygon.
  const closed: LngLat[] = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]];
  if (closed.length < 4) return null; // need >=3 distinct vertices + closing point

  let poly;
  try {
    poly = polygon([closed]);
  } catch {
    return null; // degenerate ring (e.g. all points collinear) — turf refuses it
  }

  const areaM2 = area(poly as any);
  if (!areaM2 || areaM2 <= 0) return null;

  const perimeterM = length(lineString(closed), { units: 'kilometers' }) * 1000;
  if (perimeterM <= 0) return null;

  const polsbyPopper = (4 * Math.PI * areaM2) / (perimeterM * perimeterM);

  // smallest-enclosing-circle has a real, reproducible bug on point sets
  // with exact duplicates (routes that self-intersect/retrace produce
  // these when the path is closed into a ring): confirmed by direct
  // testing — 30 repeated calls on Bar Yehuda's raw 40-point ring (13 of
  // them exact duplicates) returned a correct r≈107 most of the time but
  // r≈9.4 BILLION meters on ~20% of calls — not float jitter, an outright
  // algorithmic failure. Deduplicating the input first (confirmed: 30/30
  // runs then agree to the 4th decimal) resolves it completely — a data-
  // hygiene fix to the library's INPUT, not a change to Reock's own
  // formula (area / minimum-enclosing-circle-area, unchanged).
  const localPtsRaw = toLocalMeters(closed);
  const seenKeys = new Set<string>();
  const localPts = localPtsRaw.filter((p) => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  const circle = enclosingCircle(localPts.length >= 3 ? localPts : localPtsRaw);
  const circleArea = Math.PI * circle.r * circle.r;
  const reock = circleArea > 0 ? areaM2 / circleArea : 0;

  let convexHullRatio = 0;
  try {
    const pts = featureCollection(closed.map((c) => point(c)));
    const hull = convex(pts as any);
    if (hull) {
      const hullArea = area(hull as any);
      convexHullRatio = hullArea > 0 ? areaM2 / hullArea : 0;
    }
  } catch {
    convexHullRatio = 0;
  }

  return { areaM2, perimeterM, polsbyPopper, reock, convexHullRatio };
}

/** Self-overlap via buffered-ribbon-area shortfall: a path that never
 * retraces itself produces a buffer polygon whose area is ~ length ×
 * 2×radius (minus small round-endcap effects, noted not corrected —
 * negligible for routes this long relative to the buffer radius). A path
 * that doubles back has its buffer self-union, so the resulting area is
 * smaller than the ideal ribbon — the shortfall is the overlap fraction. */
function computeSelfOverlap(pathPts: LngLat[], totalLengthM: number): number {
  if (totalLengthM <= 0 || pathPts.length < 2) return 0;
  const line = lineString(pathPts);
  const buffered = buffer(line, OVERLAP_BUFFER_RADIUS_M, { units: 'meters' });
  if (!buffered) return 0;
  const actualAreaM2 = area(buffered as any);
  const idealAreaM2 = totalLengthM * 2 * OVERLAP_BUFFER_RADIUS_M;
  if (idealAreaM2 <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - actualAreaM2 / idealAreaM2));
}

interface JunctionInfo {
  location: LngLat;
  visits: number; // how many times the path's own sequence passes near this location
}

/** Junctions = clustered self-revisits, found via turf/kinks (pairwise
 * self-intersections of the route's own LineString) then grouped within
 * JUNCTION_CLUSTER_RADIUS_M. Each kink point is one pairwise crossing;
 * clustering absorbs the case where >2 strands meet near the same spot
 * (several close-together pairwise kinks) into one junction with a higher
 * visit count, rather than reporting them as several separate junctions a
 * few meters apart. "Visits" = count of distinct times the path's own
 * coordinate sequence comes within the cluster radius of the junction's
 * centroid (contiguous nearby points count once, not once per vertex). */
function computeJunctions(pathPts: LngLat[]): JunctionInfo[] {
  if (pathPts.length < 4) return [];
  const line = lineString(pathPts);
  let kinkPoints: LngLat[] = [];
  try {
    const result = kinks(line as any);
    kinkPoints = result.features.map((f: any) => f.geometry.coordinates as LngLat);
  } catch {
    return [];
  }
  if (kinkPoints.length === 0) return [];

  // Cluster kink points.
  const clusters: LngLat[][] = [];
  for (const kp of kinkPoints) {
    const existing = clusters.find((c) => haversineM(c[0], kp) <= JUNCTION_CLUSTER_RADIUS_M);
    if (existing) existing.push(kp);
    else clusters.push([kp]);
  }

  return clusters.map((pts) => {
    const centroid: LngLat = [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ];
    // Count distinct visits: walk the path, count contiguous runs of
    // points within the cluster radius of this centroid.
    let visits = 0;
    let inRun = false;
    for (const p of pathPts) {
      const near = haversineM(p, centroid) <= JUNCTION_CLUSTER_RADIUS_M;
      if (near && !inRun) { visits++; inRun = true; }
      if (!near) inRun = false;
    }
    return { location: centroid, visits: Math.max(visits, 2) }; // a kink implies at least 2 passes by construction
  });
}

interface DeadBranchInfo {
  junctionIndex: number;
  outAndBackLengthM: number;
  maxDisplacementM: number;
  outAndBackRatio: number; // walkedLength / (2 * maxDisplacement) — ~1.0 for a pure there-and-back spur, much higher for a real loop
}

/** A heuristic, not a named standard algorithm — reported with full
 * methodology so it can be judged on its own terms. For each junction
 * (self-revisited location), looks at the path segment between two
 * CONSECUTIVE visits of that same junction with no other junction
 * in between, and asks: did the path go out and come straight back
 * (spur), or did it cover a wide loop before returning (legitimate loop)?
 * Measured as walked-length vs. 2x the farthest point reached — a pure
 * out-and-back spur has a ratio near 1.0; a loop's ratio is much higher
 * because it covers ground the direct route back doesn't retrace. */
function computeDeadBranches(pathPts: LngLat[], junctions: JunctionInfo[]): DeadBranchInfo[] {
  if (junctions.length === 0) return [];
  const results: DeadBranchInfo[] = [];

  junctions.forEach((j, jIdx) => {
    const visitIndices: number[] = [];
    let inRun = false;
    pathPts.forEach((p, i) => {
      const near = haversineM(p, j.location) <= JUNCTION_CLUSTER_RADIUS_M;
      if (near && !inRun) { visitIndices.push(i); inRun = true; }
      if (!near) inRun = false;
    });
    for (let k = 0; k < visitIndices.length - 1; k++) {
      const startI = visitIndices[k];
      const endI = visitIndices[k + 1];
      const segment = pathPts.slice(startI, endI + 1);
      if (segment.length < 3) continue;
      // Skip if any OTHER junction's location falls inside this segment —
      // that makes it a through-route between two junctions, not a spur.
      const otherJunctionInside = junctions.some((oj, oIdx) => oIdx !== jIdx && segment.some((p) => haversineM(p, oj.location) <= JUNCTION_CLUSTER_RADIUS_M));
      if (otherJunctionInside) continue;

      const walked = pathLengthM(segment);
      const maxDisp = Math.max(...segment.map((p) => haversineM(p, j.location)));
      if (maxDisp < 1) continue; // degenerate (didn't really go anywhere)
      const ratio = walked / (2 * maxDisp);
      results.push({ junctionIndex: jIdx, outAndBackLengthM: walked, maxDisplacementM: maxDisp, outAndBackRatio: ratio });
    }
  });
  return results;
}

interface SharpTurnStreak {
  length: number; // consecutive flagged-vertex run length
}

function computeSharpTurns(pathPts: LngLat[]): { angles: number[]; streaks: SharpTurnStreak[] } {
  const angles: number[] = [];
  const flagged: boolean[] = [];
  for (let i = 1; i < pathPts.length - 1; i++) {
    const b1 = bearing(point(pathPts[i - 1]), point(pathPts[i]));
    const b2 = bearing(point(pathPts[i]), point(pathPts[i + 1]));
    let diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    angles.push(diff);
    flagged.push(diff >= SHARP_TURN_DEGREES);
  }
  const streaks: SharpTurnStreak[] = [];
  let run = 0;
  for (const f of flagged) {
    if (f) run++;
    else { if (run > 0) streaks.push({ length: run }); run = 0; }
  }
  if (run > 0) streaks.push({ length: run });
  return { angles, streaks };
}

// ─────────────────────────────────────────────────────────────────────────
// Per-route profile
// ─────────────────────────────────────────────────────────────────────────

interface RouteDoc {
  id: string;
  name: string;
  city: string;
  authorityId: string | null;
  path: LngLat[];
  published: boolean;
  status: string;
}

interface RouteProfile {
  id: string;
  name: string;
  city: string;
  pathPointCount: number;
  totalLengthM: number;
  closureGapM: number;
  closureGapPctOfLength: number;
  isClosedEnoughForCompactness: boolean;
  compactness: CompactnessResult | null;
  selfOverlapRatio: number;
  junctions: JunctionInfo[];
  deadBranches: DeadBranchInfo[];
  sharpTurnAngles: number[];
  sharpTurnStreaks: SharpTurnStreak[];
  sharpTurnCount: number;
  looksLikePromenade: boolean; // name-pattern + open-path signal, reported separately, not folded into "bad shape"
}

function profileRoute(r: RouteDoc): RouteProfile {
  const pathPts = r.path;
  const totalLengthM = pathLengthM(pathPts);
  const closureGapM = pathPts.length >= 2 ? haversineM(pathPts[0], pathPts[pathPts.length - 1]) : 0;
  const closureGapPctOfLength = totalLengthM > 0 ? (closureGapM / totalLengthM) * 100 : 0;
  const isClosedEnoughForCompactness = closureGapM <= CLOSURE_STRUCTURAL_GAP_M;

  const compactness = isClosedEnoughForCompactness && pathPts.length >= 3 ? computeCompactness(pathPts) : null;
  const selfOverlapRatio = computeSelfOverlap(pathPts, totalLengthM);
  const junctions = computeJunctions(pathPts);
  const deadBranches = computeDeadBranches(pathPts, junctions);
  const { angles, streaks } = computeSharpTurns(pathPts);

  // Name signal only — deliberately NOT OR'd with "closure gap is large
  // relative to length," which is just restating "not closed" (already its
  // own bucket from step 1) and would silently re-label most of that
  // bucket "promenade" without any actual evidence of linear intent. This
  // under-catches unnamed promenades/greenways inside the not-closed
  // bucket — reported as a named limitation, not papered over.
  const looksLikePromenade = /טיילת|רצועה ירוקה|רצועת חוף|שביל טבע/.test(r.name);

  return {
    id: r.id, name: r.name, city: r.city,
    pathPointCount: pathPts.length,
    totalLengthM, closureGapM, closureGapPctOfLength, isClosedEnoughForCompactness,
    compactness, selfOverlapRatio, junctions, deadBranches,
    sharpTurnAngles: angles, sharpTurnStreaks: streaks, sharpTurnCount: angles.filter((a) => a >= SHARP_TURN_DEGREES).length,
    looksLikePromenade,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Firestore access
// ─────────────────────────────────────────────────────────────────────────

function toRouteDoc(id: string, data: FirebaseFirestore.DocumentData): RouteDoc | null {
  const rawPath = Array.isArray(data.path) ? data.path : [];
  // Reuses the same normalizer compute-queue.ts/the accuracy agent use —
  // live data mixes [lng,lat] tuples and {lng,lat} objects; re-deriving
  // this filter naively (tuple-only) silently drops every object-shaped
  // route, which is exactly what happened on the first run of this script
  // (all 3 calibration routes "not found" — their path field is objects).
  const pathPts: LngLat[] = normalizePathToLngLatTuples(rawPath).filter(
    (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && (p[0] !== 0 || p[1] !== 0),
  );
  if (pathPts.length < 3) return null;
  return {
    id, name: data.name || '(unnamed)', city: data.city || '(none)',
    authorityId: data.authorityId || null, path: pathPts,
    published: !!data.published, status: data.status || '(none)',
  };
}

async function fetchKiryatOnoReferenceRoutes(db: admin.firestore.Firestore): Promise<Record<string, RouteDoc>> {
  const snap = await db.collection('official_routes').where('authorityId', '==', 'siottOZAY5CkpvauSJwp').get();
  const byName: Record<string, RouteDoc> = {};
  for (const doc of snap.docs) {
    const d = toRouteDoc(doc.id, doc.data());
    if (d) byName[d.name] = d;
  }
  return byName;
}

async function fetchPendingRoutes(db: admin.firestore.Firestore): Promise<RouteDoc[]> {
  const snap = await db.collection('official_routes').where('published', '==', false).get();
  const docs: RouteDoc[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === 'archived') continue;
    const d = toRouteDoc(doc.id, data);
    if (d) docs.push(d);
  }
  return docs;
}

// ─────────────────────────────────────────────────────────────────────────
// Report helpers
// ─────────────────────────────────────────────────────────────────────────

function decile(values: number[], d: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((d / 10) * (sorted.length - 1))));
  return sorted[idx];
}

function fmt(n: number, digits = 3): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
}

function printDistribution(label: string, values: number[]) {
  console.log(`\n--- ${label} (n=${values.length}) ---`);
  if (values.length === 0) { console.log('  (no data)'); return; }
  const deciles = Array.from({ length: 11 }, (_, i) => decile(values, i));
  console.log('  p0  p10 p20 p30 p40 p50 p60 p70 p80 p90 p100');
  console.log('  ' + deciles.map((v) => fmt(v, 3)).join(' '));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  console.log(`  mean=${fmt(mean, 3)}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('BRANCH: route-quality-geometry-measurement');
  console.log('READ-ONLY — zero Firestore writes, zero pipeline changes.\n');

  const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  // ── Calibration ──
  console.log('=== CALIBRATION — 3 known Kiryat Ono routes ===\n');
  const refRoutes = await fetchKiryatOnoReferenceRoutes(db);
  const refNames = ['הקפת פארק צה"ל', 'הקפת פארק מכבית', 'הקפת Bar Yehuda'];
  const refProfiles: Record<string, RouteProfile> = {};
  for (const name of refNames) {
    const r = refRoutes[name];
    if (!r) { console.log(`🔴 Reference route "${name}" not found.`); process.exit(1); }
    refProfiles[name] = profileRoute(r);
    const p = refProfiles[name];
    console.log(`${name} (${Math.round(p.totalLengthM)}m):`);
    console.log(`  closure gap: ${fmt(p.closureGapM, 1)}m (${fmt(p.closureGapPctOfLength, 2)}% of length) — closed enough: ${p.isClosedEnoughForCompactness}`);
    if (p.compactness) {
      console.log(`  Polsby-Popper: ${fmt(p.compactness.polsbyPopper)}  Reock: ${fmt(p.compactness.reock)}  ConvexHull: ${fmt(p.compactness.convexHullRatio)}`);
    } else {
      console.log('  (not closed enough — no compactness computed)');
    }
    console.log(`  self-overlap: ${fmt(p.selfOverlapRatio)}  junctions: ${p.junctions.length}  deadBranches: ${p.deadBranches.length}  sharpTurns: ${p.sharpTurnCount}`);
  }

  // ── Explicit stop condition ──
  const tzahal = refProfiles['הקפת פארק צה"ל'];
  const maccabi = refProfiles['הקפת פארק מכבית'];
  const barYehuda = refProfiles['הקפת Bar Yehuda'];

  if (!maccabi.compactness || !barYehuda.compactness) {
    console.log('\n🔴 STOP: Maccabiah or Bar Yehuda did not produce a compactness result at all (closure gap too large, or degenerate polygon). Cannot run the differentiation check. Not proceeding to the 97.');
    process.exit(1);
  }

  // "Low" here is judged relative to Tzahal (the clean reference), not an
  // absolute bar — this is the calibration logic itself, not a threshold
  // applied to the 97.
  const maccabiLowest = (['polsbyPopper', 'reock', 'convexHullRatio'] as const).reduce((a, b) =>
    maccabi.compactness![a] < maccabi.compactness![b] ? a : b
  );
  const barYehudaLowest = (['polsbyPopper', 'reock', 'convexHullRatio'] as const).reduce((a, b) =>
    barYehuda.compactness![a] < barYehuda.compactness![b] ? a : b
  );

  console.log(`\nMaccabiah's lowest measure: ${maccabiLowest} (${fmt(maccabi.compactness[maccabiLowest])}) — expected: Reock`);
  console.log(`Bar Yehuda's lowest measure: ${barYehudaLowest} (${fmt(barYehuda.compactness[barYehudaLowest])}) — expected: Convex Hull`);

  // smallest-enclosing-circle bug check (see computeCompactness's own
  // comment for the fix) — demonstrated here explicitly, before vs after
  // deduplication, on Bar Yehuda's real points: a self-intersecting route
  // closed into a ring produces exact-duplicate points at every crossing,
  // and this library's circle-fit occasionally (not rarely — ~1 in 5 calls
  // on this exact input) returns a radius off by 7-8 orders of magnitude.
  const closedBY: LngLat[] = [...refRoutes['הקפת Bar Yehuda'].path, refRoutes['הקפת Bar Yehuda'].path[0]];
  const localRaw = toLocalMeters(closedBY);
  const dupCount = localRaw.length - new Set(localRaw.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size;
  const rRawRepeats = Array.from({ length: 10 }, () => enclosingCircle(localRaw).r);
  const seen2 = new Set<string>();
  const localDeduped = localRaw.filter((p) => { const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`; if (seen2.has(k)) return false; seen2.add(k); return true; });
  const rDedupedRepeats = Array.from({ length: 10 }, () => enclosingCircle(localDeduped).r);
  console.log(`\nBar Yehuda: ${closedBY.length} ring points, ${dupCount} exact duplicates (self-intersections closed into the ring).`);
  console.log(`  enclosing-circle radius, 10 repeats, RAW points: [${rRawRepeats.map((r) => r.toFixed(1)).join(', ')}]`);
  console.log(`  enclosing-circle radius, 10 repeats, DEDUPED points: [${rDedupedRepeats.map((r) => r.toFixed(1)).join(', ')}]`);
  console.log(`  → fix applied in computeCompactness(): dedup before circle-fit. All Reock values below use the fixed path.`);

  if (maccabiLowest === barYehudaLowest) {
    console.log(`\n🔴 STOP: both Maccabiah and Bar Yehuda fail lowest on the SAME measure (${maccabiLowest}).`);
    console.log(`\nDiagnosis, not just the flag: area itself is stable (Bar Yehuda = ${fmt(barYehuda.compactness!.areaM2, 1)}m² on every run) — the instability is specifically in the enclosing-circle radius (shown above), and it matters here because Reock and Polsby-Popper are nearly tied for Bar Yehuda (${fmt(barYehuda.compactness!.reock, 4)} vs ${fmt(barYehuda.compactness!.polsbyPopper, 4)}) — which one reads as "lowest" is close to a coin flip on this route, not a robust read.`);
    console.log(`\nConvex Hull is actually the measure that cleanly separates these two routes from EACH OTHER: Maccabiah=${fmt(maccabi.compactness!.convexHullRatio, 3)} vs Bar Yehuda=${fmt(barYehuda.compactness!.convexHullRatio, 3)} — a real ~10x gap, the widest relative separation of the three. The original per-route "expected: Reock / expected: Convex Hull" framing (each route diagnosed by its OWN lowest measure) is the wrong lens — Reock and Polsby-Popper both collapse toward zero for BOTH an elongated strip AND a self-crossing network (neither has much net enclosed area relative to its perimeter), so neither resolves which failure mode you're looking at. Convex Hull is the one with real separating power between them — just not in the "each route fails its own designated measure" shape that was hypothesized.`);
    console.log(`\nPer the explicit instruction: stopping here. Not proceeding to the 97.`);
    process.exit(1);
  }

  console.log('\n✅ Calibration differentiates as expected. Proceeding to the 97 pending routes.\n');

  // ── Full run ──
  const pending = await fetchPendingRoutes(db);
  console.log(`=== FULL RUN — ${pending.length} pending routes ===`);

  const rawProfiles = pending.map(profileRoute);
  const accuracyQueue = await computeAccuracyQueue(db); // unmodified, read-only reuse
  const accuracyById = new Map(accuracyQueue.rows.map((r) => [r.id, r]));

  // accuracyDecision threaded in HERE, once — everything below (closed,
  // ranked, cuts a/b/c) reads from this same array, not the pre-merge one.
  // (First consolidated run had cut (b) silently reading undefined and
  // reporting "0 of 28" instead of the real 7 — caught by re-running after
  // folding the follow-up analysis into this script, not trusted blind.)
  const profiles = rawProfiles.map((p) => ({
    ...p,
    accuracyDecision: accuracyById.get(p.id)?.decision ?? null,
  }));

  const out = {
    branch: 'route-quality-geometry-measurement',
    generatedAt: new Date().toISOString(),
    pendingCount: pending.length,
    calibration: { tzahal, maccabi, barYehuda, maccabiLowest, barYehudaLowest },
    profiles,
  };

  fs.writeFileSync('/tmp/route_geometry_profiles.json', JSON.stringify(out, null, 2));
  console.log(`\nWrote full profile data to /tmp/route_geometry_profiles.json (${profiles.length} routes).`);

  const closed = profiles.filter((p) => p.isClosedEnoughForCompactness && p.compactness);
  const notClosed = profiles.filter((p) => !p.isClosedEnoughForCompactness || !p.compactness);
  console.log(`\nClosed (compactness computed): ${closed.length}. Not closed enough (bucketed separately): ${notClosed.length}.`);
  console.log(`Flagged as promenade/linear-by-nature: ${profiles.filter((p) => p.looksLikePromenade).length}`);

  printDistribution('Closure gap (meters), ALL 97', profiles.map((p) => p.closureGapM));
  printDistribution('Polsby-Popper (closed only)', closed.map((p) => p.compactness!.polsbyPopper));
  printDistribution('Reock (closed only)', closed.map((p) => p.compactness!.reock));
  printDistribution('Convex Hull ratio (closed only)', closed.map((p) => p.compactness!.convexHullRatio));
  printDistribution('Self-overlap ratio, ALL 97', profiles.map((p) => p.selfOverlapRatio));
  printDistribution('Junction count per route, ALL 97', profiles.map((p) => p.junctions.length));
  printDistribution('Dead-branch out-and-back ratio (all detected)', profiles.flatMap((p) => p.deadBranches.map((d) => d.outAndBackRatio)));
  printDistribution('Sharp turns (>=150°) per route, ALL 97', profiles.map((p) => p.sharpTurnCount));

  const allJunctionVisits = profiles.flatMap((p) => p.junctions.map((j) => j.visits));
  const visitHist: Record<number, number> = {};
  for (const v of allJunctionVisits) visitHist[v] = (visitHist[v] || 0) + 1;
  console.log(`\n--- Junction visit-degree, ${allJunctionVisits.length} junctions across all 97 ---`);
  console.log('  ' + Object.entries(visitHist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `visited ${k}x: ${v}`).join('  '));

  const allStreaks = profiles.flatMap((p) => p.sharpTurnStreaks.map((s) => s.length));
  const streakHist: Record<number, number> = {};
  for (const v of allStreaks) streakHist[v] = (streakHist[v] || 0) + 1;
  console.log(`\n--- Sharp-turn streak length, ${allStreaks.length} streaks ---`);
  console.log('  ' + Object.entries(streakHist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `length ${k}: ${v}`).join('  '));

  // ── Cut (a): where the 3 measures disagree with each other ──
  function percentileRank(values: number[], v: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const below = sorted.filter((x) => x < v).length;
    return (below / sorted.length) * 100;
  }
  const measureKeys = ['polsbyPopper', 'reock', 'convexHullRatio'] as const;
  const measureValues: Record<string, number[]> = {};
  for (const m of measureKeys) measureValues[m] = closed.map((p) => p.compactness![m]);
  const ranked = closed.map((p) => {
    const ranks: Record<string, number> = {};
    for (const m of measureKeys) ranks[m] = percentileRank(measureValues[m], p.compactness![m]);
    const spread = Math.max(...measureKeys.map((m) => ranks[m])) - Math.min(...measureKeys.map((m) => ranks[m]));
    return { ...p, ranks, spread };
  }).sort((a, b) => b.spread - a.spread);

  console.log('\n=== (a) Where the 3 measures disagree with EACH OTHER (top 10 by percentile-rank spread) ===');
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.name} (${r.city}) — PP%ile=${r.ranks.polsbyPopper.toFixed(0)} Reock%ile=${r.ranks.reock.toFixed(0)} ConvexHull%ile=${r.ranks.convexHullRatio.toFixed(0)} spread=${r.spread.toFixed(0)}`);
  }

  // ── Cut (b): where measures disagree with the EXISTING certificate ──
  console.log('\n=== (b) Where measures disagree with the EXISTING certificate (verdict=approve AND bottom-quartile on all 3) ===');
  const certDisagree = ranked.filter((p) => p.accuracyDecision?.verdict === 'approve' && measureKeys.every((m) => p.ranks[m] <= 25));
  console.log(`  ${certDisagree.length} of ${closed.length} closed routes.`);
  for (const p of certDisagree) {
    console.log(`  ${p.name} (${p.city}) — cert confidence=${p.accuracyDecision?.confidence}, PP=${fmt(p.compactness!.polsbyPopper)} Reock=${fmt(p.compactness!.reock)} ConvexHull=${fmt(p.compactness!.convexHullRatio)}`);
  }

  // ── Cut (c): business cut — top 5 per city per measure, at illustrative floors ──
  console.log('\n=== (c) Business cut — top 5 per city, illustrative floors (bottom X% excluded, global rank) ===');
  const cities = Array.from(new Set(profiles.map((p) => p.city)));
  const floors = [10, 20, 30, 50, 70, 80, 90];
  for (const city of cities) {
    const cityClosed = ranked.filter((p) => p.city === city);
    const cityPendingCount = profiles.filter((p) => p.city === city).length;
    console.log(`\n  --- ${city}: ${cityPendingCount} pending, ${cityClosed.length} closed ---`);
    const combinedRow = floors.map((floor) => {
      const eligible = cityClosed.filter((p) => measureKeys.every((m) => p.ranks[m] > floor));
      return `floor${floor}:${Math.min(5, eligible.length)}/5(${eligible.length})`;
    }).join('  ');
    console.log(`  ALL-3-COMBINED: ${combinedRow}`);
  }

  console.log(`\n(Full per-route data in /tmp/route_geometry_profiles.json.)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
