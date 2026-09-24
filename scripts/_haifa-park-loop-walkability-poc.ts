// READ-ONLY investigation POC. Does NOT write to Firestore, does NOT call --apply,
// does NOT touch the generator. Answers: are the "הקפת X" park-loop routes already
// written for Haifa (batch haifa-geodiscovery-2026-08-19) actually walkable — i.e.
// does their ring geometry sit on real walkable OSM ways (footway/path/pedestrian/
// track/steps/living_street/residential/service/tertiary/unclassified), or does it
// just trace the leisure=park/garden area-polygon outline (which can cut straight
// lines across a park interior, since a land-use boundary isn't a routable way)?
//
// Method: (b) from the brief — reuse the walkable ways already fetched elsewhere in
// geo-discovery-routes.ts (same Overpass endpoint/mirrors, same highway vocabulary
// as its own standalone-segment query, PLUS steps — a human can walk stairs even
// though this codebase's routing engine deliberately excludes them from routable
// segments, see osm-segment-importer.ts's own comment; this POC tests human
// walkability, not routing-engine compatibility). No local OSRM/Valhalla stood up —
// that's much heavier infra for a one-shot validation than snapping to ways we
// already know how to fetch.
//
// For each ring: densify to ~10m-spaced sample points, snap each to the nearest
// walkable-way segment via a coarse spatial grid (same "planar equirectangular
// approximation, city-scale, not survey-grade" precision this file's ringAreaM2
// already uses), and report % of ring length within TOLERANCE_M of a walkable way,
// plus the single worst contiguous off-network gap.
import * as https from 'https';
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw'; // חיפה
const TOLERANCE_M = 20; // upper end of the brief's "~15-20m" band — generous on purpose,
// to avoid false FAILs from ordinary OSM footway-vs-park-path digitisation offset.
const SAMPLE_SPACING_M = 10;
const PASS_COVERAGE_PCT = 90; // documented threshold, not derived — flagged for review like every other threshold in this codebase.
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];

async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) investigation-poc' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 6000)); }
  }
  throw new Error('overpass failed (all mirrors)');
}

const R = 6371000;
function hav(a: number[], b: number[]): number {
  const [la1, lo1] = a, [la2, lo2] = b;
  const dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function pathLen(pts: number[][]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += hav(pts[i - 1], pts[i]); return s; }

// Local planar projection (equirectangular, centered on a fixed reference latitude for
// the whole run — Haifa's bbox is small enough, ~13km, that a single reference lat
// introduces negligible error) — same precision level as ringAreaM2 in the main script.
const REF_LAT = 32.794;
const M_PER_DEG_LAT = 111320, M_PER_DEG_LNG = 111320 * Math.cos(REF_LAT * Math.PI / 180);
function toXY(p: number[]): [number, number] { return [p[1] * M_PER_DEG_LNG, p[0] * M_PER_DEG_LAT]; } // [lat,lng] -> [x,y] meters

function pointToSegDistM(p: number[], a: number[], b: number[]): number {
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Densify a closed ring into ~SAMPLE_SPACING_M-spaced points, carrying each sample's
// cumulative distance along the ring (for contiguous-gap measurement afterward).
function densifyRing(ring: number[][], spacingM: number): { pt: number[]; atM: number }[] {
  const out: { pt: number[]; atM: number }[] = [];
  let cum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const segLen = hav(a, b);
    if (segLen === 0) continue;
    const steps = Math.max(1, Math.round(segLen / spacingM));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      out.push({ pt: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], atM: cum + segLen * f });
    }
    cum += segLen;
  }
  return out;
}

interface WaySeg { a: number[]; b: number[]; wayId: number }
const GRID_DEG = 0.0006; // ~60-65m cells at this latitude — coarse spatial prefilter only.
function gridKey(p: number[]): string { return `${Math.floor(p[0] / GRID_DEG)}:${Math.floor(p[1] / GRID_DEG)}`; }

function buildGrid(segs: WaySeg[]): Map<string, WaySeg[]> {
  const grid = new Map<string, WaySeg[]>();
  for (const seg of segs) {
    // register the segment in every cell its bbox touches, not just its midpoint —
    // a long segment can span multiple cells and must be findable from any of them.
    const lat0 = Math.min(seg.a[0], seg.b[0]), lat1 = Math.max(seg.a[0], seg.b[0]);
    const lng0 = Math.min(seg.a[1], seg.b[1]), lng1 = Math.max(seg.a[1], seg.b[1]);
    for (let la = Math.floor(lat0 / GRID_DEG); la <= Math.floor(lat1 / GRID_DEG); la++) {
      for (let lo = Math.floor(lng0 / GRID_DEG); lo <= Math.floor(lng1 / GRID_DEG); lo++) {
        const key = `${la}:${lo}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(seg);
      }
    }
  }
  return grid;
}

function nearestWay(p: number[], grid: Map<string, WaySeg[]>): { distM: number; wayId: number | null } {
  const [la, lo] = [Math.floor(p[0] / GRID_DEG), Math.floor(p[1] / GRID_DEG)];
  let best = Infinity, bestWayId: number | null = null;
  const seen = new Set<WaySeg>();
  for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) {
    const bucket = grid.get(`${la + da}:${lo + dob}`);
    if (!bucket) continue;
    for (const seg of bucket) {
      if (seen.has(seg)) continue; seen.add(seg);
      const d = pointToSegDistM(p, seg.a, seg.b);
      if (d < best) { best = d; bestWayId = seg.wayId; }
    }
  }
  return { distM: best, wayId: bestWayId };
}

function normalizePath(raw: any[]): number[][] {
  // official_routes.path is stored as {lng,lat} objects (confirmed in
  // ApprovalDetailModal's normalizeStoredRoutePath usage) — this POC reads that
  // shape directly (no need for the app's own normaliser, this is a standalone
  // script), defensively falling back to [lng,lat]/[lat,lng] array shapes.
  return raw.map((p: any) => {
    if (Array.isArray(p)) return p.length === 2 ? [p[1], p[0]] : p; // assume [lng,lat] array -> [lat,lng]
    const lng = p.lng ?? p.lon ?? p[0];
    const lat = p.lat ?? p[1];
    return [lat, lng];
  }).filter((p: number[]) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

async function main() {
  const db = initFb();
  console.log('Fetching Haifa official_routes (read-only) …');
  const snap = await db.collection('official_routes').where('authorityId', '==', AUTHORITY_ID).get();
  const parkLoops = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(r => typeof r.name === 'string' && r.name.startsWith('הקפת '));
  console.log(`Found ${parkLoops.length} "הקפת" park-loop docs out of ${snap.size} total Haifa routes.\n`);
  if (parkLoops.length === 0) { console.log('Nothing to validate.'); return; }

  const rings = parkLoops.map(r => ({ id: r.id, name: r.name as string, distance: r.distance as number, ring: normalizePath(r.path || []) }))
    .filter(r => r.ring.length >= 3);

  // Union bbox of all rings + padding — far smaller than the whole Haifa bbox, one
  // combined Overpass call instead of 21 sequential ones.
  const PAD_DEG = 0.0015; // ~150-165m padding
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const r of rings) for (const p of r.ring) {
    latMin = Math.min(latMin, p[0]); latMax = Math.max(latMax, p[0]);
    lngMin = Math.min(lngMin, p[1]); lngMax = Math.max(lngMax, p[1]);
  }
  latMin -= PAD_DEG; latMax += PAD_DEG; lngMin -= PAD_DEG; lngMax += PAD_DEG;
  console.log(`Combined bbox around all ${rings.length} rings: ${latMin.toFixed(4)},${lngMin.toFixed(4)},${latMax.toFixed(4)},${lngMax.toFixed(4)}`);

  console.log('Fetching walkable ways (footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified) in that bbox …');
  const bb = `${latMin},${lngMin},${latMax},${lngMax}`;
  const q = `[out:json][timeout:120];(` +
    `way["highway"~"^(footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified)$"](${bb});` +
    `);out geom;`;
  const data = await overpass(q);
  const segs: WaySeg[] = [];
  let wayCount = 0;
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    wayCount++;
    const pts = e.geometry.map((p: any) => [p.lat, p.lon]);
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], wayId: e.id });
  }
  console.log(`Fetched ${wayCount} walkable ways, ${segs.length} segments. Building spatial grid …\n`);
  const grid = buildGrid(segs);

  type Row = {
    name: string; storedDistance: number; computedLength: number; coveragePct: number;
    verdict: 'PASS' | 'FAIL'; worstGapM: number;
    distinctWays: number; runs: number; longestRunPct: number;
  };
  const rows: Row[] = [];

  for (const r of rings) {
    const L = pathLen(r.ring);
    const samples = densifyRing(r.ring, SAMPLE_SPACING_M);
    const snaps = samples.map(s => nearestWay(s.pt, grid));
    const flags = snaps.map(s => s.distM <= TOLERANCE_M);
    const onCount = flags.filter(Boolean).length;
    const coveragePct = Math.round((onCount / flags.length) * 1000) / 10;

    // Continuity check: proximity alone can't tell "traces one real path" apart from
    // "grazes several disconnected paths in a dense network" (a genuine risk inside a
    // big park with many crisscrossing internal footways — every point can be "near
    // some path" without the ring ever following any single one of them). Track which
    // wayId each on-network sample snapped to: a run = a maximal consecutive stretch
    // (in ring order, wrapping) that stayed on the SAME wayId. Real digitized paths are
    // long, few, contiguous ways -> few long runs. A polygon edge merely grazing many
    // unrelated fragments -> many short runs touching many distinct wayIds.
    const onWayIds = snaps.filter((s, i) => flags[i] && s.wayId !== null).map(s => s.wayId!);
    const distinctWays = new Set(onWayIds).size;
    let runs = 0, longestRun = 0, curRun = 0, prevWayId: number | null = null;
    const n = flags.length;
    const firstOn = flags.indexOf(true);
    if (firstOn !== -1) {
      for (let k = 0; k <= n; k++) {
        const i = (firstOn + k) % n;
        const isOn = k === n ? false : flags[i]; // force a close-out pass at the end
        const wid = k === n ? null : snaps[i].wayId;
        if (isOn && wid === prevWayId && prevWayId !== null) {
          curRun++;
        } else if (isOn) {
          if (prevWayId !== null) { runs++; longestRun = Math.max(longestRun, curRun); }
          curRun = 1;
        } else if (prevWayId !== null) {
          runs++; longestRun = Math.max(longestRun, curRun); curRun = 0;
        }
        prevWayId = isOn ? wid : null;
      }
    }
    const longestRunPct = onCount > 0 ? Math.round((longestRun / onCount) * 1000) / 10 : 0;

    // Worst contiguous off-network gap, wrapping around the ring's closure point.
    let worstGapM = 0, curGapStart: number | null = null;
    const sampleCount = samples.length;
    // Rotate the start to a known "on" sample if one exists, so a gap spanning the
    // array's wraparound boundary isn't split into two — else use the raw order.
    const onIdx = flags.indexOf(true);
    const order = onIdx === -1 ? Array.from({ length: sampleCount }, (_, i) => i) : Array.from({ length: sampleCount }, (_, i) => (onIdx + i) % sampleCount);
    let gapStartAt: number | null = null, prevAt = samples[order[0]].atM;
    for (let k = 0; k <= sampleCount; k++) {
      const i = order[k % sampleCount];
      const isOn = k === sampleCount ? true : flags[i]; // force-close the loop at the end
      const at = samples[i].atM;
      if (!isOn) {
        if (gapStartAt === null) gapStartAt = prevAt;
      } else if (gapStartAt !== null) {
        let gapLen = at - gapStartAt;
        if (gapLen < 0) gapLen += L; // wrapped past the ring's own closure
        worstGapM = Math.max(worstGapM, gapLen);
        gapStartAt = null;
      }
      prevAt = at;
    }
    if (flags.every(f => !f)) worstGapM = L; // entirely off-network

    rows.push({
      name: r.name,
      storedDistance: Math.round(r.distance),
      computedLength: Math.round(L),
      coveragePct,
      verdict: coveragePct >= PASS_COVERAGE_PCT ? 'PASS' : 'FAIL',
      worstGapM: Math.round(worstGapM),
      distinctWays,
      runs,
      longestRunPct,
    });
  }

  rows.sort((a, b) => a.coveragePct - b.coveragePct);
  console.log(`=== Walkability validation — tolerance ${TOLERANCE_M}m, PASS threshold ${PASS_COVERAGE_PCT}% ring-length coverage ===\n`);
  console.log(
    'Name'.padEnd(38) + 'Dist(m)'.padStart(9) + 'Coverage%'.padStart(11) + '  Verdict'.padStart(9) +
    '  WorstGapM'.padStart(12) + '  DistinctWays'.padStart(15) + '  Runs'.padStart(8) + '  LongestRun%'.padStart(14)
  );
  for (const row of rows) {
    console.log(
      row.name.padEnd(38) +
      `${row.computedLength}m`.padStart(9) +
      `${row.coveragePct}%`.padStart(11) +
      `  ${row.verdict}`.padStart(9) +
      `${row.worstGapM}m`.padStart(12) +
      `${row.distinctWays}`.padStart(15) +
      `${row.runs}`.padStart(8) +
      `${row.longestRunPct}%`.padStart(14)
    );
  }
  const passCount = rows.filter(r => r.verdict === 'PASS').length;
  console.log(`\n${passCount}/${rows.length} PASS at ${PASS_COVERAGE_PCT}% coverage / ${TOLERANCE_M}m tolerance.`);
  console.log(`\nContinuity read: "LongestRun%" = the biggest single-wayId consecutive stretch, as a`);
  console.log(`% of that loop's own on-network samples. High (~80-100%) = the ring genuinely traces`);
  console.log(`one real, mostly-continuous path. Low, with many DistinctWays/Runs relative to ring`);
  console.log(`length, = the ring is grazing many disconnected path fragments — proximity without`);
  console.log(`real continuity, the false-positive risk this check exists to catch.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
