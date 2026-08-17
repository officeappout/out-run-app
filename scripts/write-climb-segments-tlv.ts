/**
 * scripts/write-climb-segments-tlv.ts — Phase 1 write (ADDITIVE)
 *
 * Writes the unified TLV CLIMB LAYER to a NEW collection `climb_segments`.
 * Does NOT touch official_routes or any existing data.
 *
 * CANONICAL STAIRS MODEL (decided Stage 0, route-enrichment-pipeline plan):
 * stairs are NEVER route/street segments — a routing engine must never route
 * someone onto a staircase as if it were a path (see the exclusions in
 * osm-segment-importer.ts's HIGHWAY_TYPES and geo-discovery-routes.ts's
 * highway=steps filter, both cross-referenced back to this file). This
 * collection's `type:'stairs'` schema (escalator filtering + significance
 * thresholds, below) is the single canonical home for OSM-derived stairs
 * data going forward — do not build a second stairs pipeline elsewhere.
 * The separate, unrelated `RouteFeatureTag.stairs_training` value (route.types.ts)
 * is a manual admin amenity flag ("good for stairs training") and is never
 * synced with this OSM-derived detection.
 *
 * Sources:
 *   terrain   — 23 isolated DEM climbs w/ climbType (/tmp/tlv_climb_segments.json)
 *   structure — OSM foot ways with incline=* or ramp=yes (man-made ramps)
 *   stairs    — OSM highway=steps (separate category, type='stairs')
 *
 * Each doc: type, climbType, center{lat,lng}, bbox, lengthM, avgGrade, maxGrade,
 *           dir, geohash (precision 7), source, city, importBatchId.
 * Idempotent: deterministic doc id per source+way → re-run updates, never dupes.
 *
 *   npx tsx scripts/write-climb-segments-tlv.ts --dry-run
 *   npx tsx scripts/write-climb-segments-tlv.ts
 *   npx tsx scripts/write-climb-segments-tlv.ts --delete
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import * as https from 'https'; import * as fs from 'fs'; import * as admin from 'firebase-admin';

const DRY = process.argv.includes('--dry-run');
const DEL = process.argv.includes('--delete');
const PRUNE = process.argv.includes('--prune-stairs');
// a staircase is training-relevant only if it's a real flight, not a 3-step hop
const STAIR_MIN_STEPS = 15, STAIR_MIN_LEN = 15;
const stairSignificant = (stepCount: number | null, lengthM: number) => (stepCount != null && stepCount >= STAIR_MIN_STEPS) || (stepCount == null && lengthM >= STAIR_MIN_LEN);
const BBOX = { latMin: 32.040, latMax: 32.118, lonMin: 34.740, lonMax: 34.800 };
const BATCH = 'tlv-climbs-2026-07-08';
const COL = 'climb_segments';

const Rd = 6371000;
const hav = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return 2 * Rd * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const bearing = (a: number[], b: number[]) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(Math.sin((b[1] - a[1]) * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180), Math.cos(a[0] * Math.PI / 180) * Math.sin(b[0] * Math.PI / 180) - Math.sin(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.cos((b[1] - a[1]) * Math.PI / 180)) * 180 / Math.PI + 360) % 360) / 45) % 8];
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat: number, lon: number, prec = 7) { let idx = 0, bit = 0, even = true, h = ''; const la = [-90, 90], lo = [-180, 180]; while (h.length < prec) { if (even) { const m = (lo[0] + lo[1]) / 2; if (lon >= m) { idx = idx * 2 + 1; lo[0] = m; } else { idx = idx * 2; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m) { idx = idx * 2 + 1; la[0] = m; } else { idx = idx * 2; la[1] = m; } } even = !even; if (++bit === 5) { h += B32[idx]; bit = 0; idx = 0; } } return h; }
async function overpass(q: string): Promise<any> { for (let a = 0; a < 6; a++) for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) { try { const buf: Buffer = await new Promise((res, rej) => { const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); }); req.on('error', rej); req.write('data=' + encodeURIComponent(q)); req.end(); }); return JSON.parse(buf.toString()); } catch { await new Promise(r => setTimeout(r, 7000)); } } throw new Error('overpass failed'); }
const bboxOf = (pts: number[][]) => ({ minLat: Math.min(...pts.map(p => p[0])), maxLat: Math.max(...pts.map(p => p[0])), minLng: Math.min(...pts.map(p => p[1])), maxLng: Math.max(...pts.map(p => p[1])) });
const len = (pts: number[][]) => pts.reduce((s, _, i) => i ? s + hav(pts[i - 1], pts[i]) : 0, 0);
// Persisted climb geometry: [lat,lng] internal → {lng,lat} OBJECTS. Firestore
// forbids nested arrays, so (like official_routes.path) we store objects, not
// [lng,lat] tuples. The reader (normalizeStoredRoutePath) turns them back into
// [lng,lat] tuples for Mapbox.
const toLine = (pts: number[][]) => pts.map(p => ({ lng: p[1], lat: p[0] }));

// Reverse-geocode a center to a human place name for climbs whose OSM way had no
// name tag (wayName missing or a bare "way/1234" ref). Prefers a real STREET, then
// a POI (e.g. a promenade/park), then the neighbourhood/locality — never a bare
// house number (Mapbox address `text` is sometimes just "1285"). Token from .env.local.
const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
// A usable place label: non-empty, not a bare number, not a "way/1234" ref.
const isRealName = (n: unknown): n is string =>
  typeof n === 'string' && n.trim().length > 1 && !/^\d+$/.test(n.trim()) && !/^way\/\d+$/i.test(n.trim());

// One reverse-geocode request for a SINGLE type. Mapbox reverse geocoding rejects
// limit>1 with multiple types, so we query one type at a time (limit=1). Returns the
// feature's name only if it's real (rejects bare house numbers like "1285").
async function geocodeOne(lat: number, lng: number, type: string): Promise<string | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=${type}&language=he&limit=1&access_token=${MAPBOX}`;
  const buf: Buffer = await new Promise((res, rej) => { https.get(url, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); }).on('error', rej); });
  const f = JSON.parse(buf.toString()).features?.[0];
  return f && isRealName(f.text) ? (f.text as string).trim() : null;
}

// Priority: real STREET → POI (promenade/park) → neighbourhood → locality → place
// (city). `place` is the guaranteed area-level fallback for feature-sparse coastal
// /park points, so a climb never falls back to a type-only title (David's rule).
// Each type retried once on transient failure so a rate-limit blip can't drop a name.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX) return null;
  for (const t of ['address', 'poi', 'neighborhood', 'locality', 'place']) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const name = await geocodeOne(lat, lng, t); if (name) return name; break; }
      catch { await new Promise(r => setTimeout(r, 500)); /* retry once, then next type */ }
    }
  }
  return null;
}

// A DEM-terrain climb is only real if it sits on (≤15m from) a walkable OSM way AND
// is NOT over water / inside a pool / marina / private area — the DEM slope model
// produces false climbs over e.g. the Tel Aviv Marina basin. Validated LOCALLY against
// two bbox Overpass fetches (all walkable ways + all blocking polygons) so a run is 2
// queries, not one-per-climb (which rate-limits). [lat,lng] geometry helpers:
const WALKABLE = 'footway|path|pedestrian|steps|residential|track|living_street|service|cycleway|unclassified';
const mPerDegLat = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos(lat * Math.PI / 180);
function distToSegM(p: number[], a: number[], b: number[]): number {
  const mx = mPerDegLng(p[0]), my = mPerDegLat;
  const px = (p[1] - a[1]) * mx, py = (p[0] - a[0]) * my, bx = (b[1] - a[1]) * mx, by = (b[0] - a[0]) * my;
  const l2 = bx * bx + by * by; let t = l2 > 0 ? (px * bx + py * by) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const dx = px - t * bx, dy = py - t * by; return Math.sqrt(dx * dx + dy * dy);
}
function inPoly(p: number[], poly: number[][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (((yi > p[0]) !== (yj > p[0])) && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
const wayGeom = (e: any): number[][] => (e.geometry || []).map((p: any) => [p.lat, p.lon]);
// Index of the way vertex nearest a target [lat,lng].
const nearestIdx = (full: number[][], t: number[]): number => { let bi = 0, bd = Infinity; for (let i = 0; i < full.length; i++) { const d = hav(full[i], t); if (d < bd) { bd = d; bi = i; } } return bi; };
// The curved sub-path of a way between the climb's start & end points (follows the
// road geometry, not a straight start→end chord). Falls back to [start,end] if the
// way geometry is missing or the slice degenerates.
function subLine(full: number[][] | undefined, start: number[], end: number[]): number[][] {
  if (!full || full.length < 2) return [start, end];
  let i = nearestIdx(full, start), j = nearestIdx(full, end);
  if (i > j) { const t = i; i = j; j = t; }
  const seg = full.slice(i, j + 1);
  return seg.length >= 2 ? seg : [start, end];
}

function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function build() {
  const docs: any[] = [];
  const rejectedTerrain: { id: string; wayName: string; center: { lat: number; lng: number }; reason: string }[] = [];
  const escalators: { id: string; label: string }[] = []; // conveying=yes moving stairs — not training stairs
  // 1) terrain — validate each against a real walkable way + reject water/private artifacts.
  // Two bbox fetches (padded), then LOCAL geometry per climb — fast + rate-limit friendly.
  const pad = 0.004;
  const bb = `${BBOX.latMin - pad},${BBOX.lonMin - pad},${BBOX.latMax + pad},${BBOX.lonMax + pad}`;
  console.log('fetching walkable ways + blocking polygons for terrain validation (2 bbox queries) ...');
  const walkData = await overpass(`[out:json][timeout:120];way["highway"~"^(${WALKABLE})$"](${bb});out geom;`);
  const walkWays: { id: string; geom: number[][] }[] = walkData.elements.filter((e: any) => e.type === 'way' && e.geometry).map((e: any) => ({ id: String(e.id), geom: wayGeom(e) }));
  const walkById = new Map(walkWays.map(w => [w.id, w.geom]));
  const blockData = await overpass(`[out:json][timeout:120];(way["natural"="water"](${bb});way["leisure"~"^(marina|swimming_pool|water_park)$"](${bb});way["access"="private"](${bb});relation["natural"="water"](${bb});relation["leisure"="marina"](${bb}););out geom;`);
  const blockPolys: { poly: number[][]; label: string }[] = [];
  for (const e of blockData.elements) {
    const label = e.tags?.name || e.tags?.natural || e.tags?.leisure || 'private';
    if (e.type === 'way' && e.geometry) blockPolys.push({ poly: wayGeom(e), label });
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.geometry) blockPolys.push({ poly: m.geometry.map((p: any) => [p.lat, p.lon]), label });
  }
  console.log(`  walkable ways=${walkWays.length}  blocking polygons=${blockPolys.length}`);
  const validateTerrain = (lat: number, lng: number): { keep: boolean; reason: string } => {
    const p = [lat, lng];
    const block = blockPolys.find(b => b.poly.length >= 3 && inPoly(p, b.poly));
    if (block) return { keep: false, reason: `over ${block.label}` };
    for (const w of walkWays) for (let i = 1; i < w.geom.length; i++) if (distToSegM(p, w.geom[i - 1], w.geom[i]) <= 15) return { keep: true, reason: 'on-way' };
    return { keep: false, reason: 'no walkable way ≤15m' };
  };
  // Nearest walkable-way polyline to a point (fallback when the DEM way isn't in the
  // walkable set) — used to source the curved line the climb sits on.
  const nearestWalkway = (lat: number, lng: number): number[][] | undefined => {
    let best: number[][] | undefined, bd = Infinity;
    for (const w of walkWays) for (let i = 1; i < w.geom.length; i++) { const d = distToSegM([lat, lng], w.geom[i - 1], w.geom[i]); if (d < bd) { bd = d; best = w.geom; } }
    return best;
  };

  const terr = JSON.parse(fs.readFileSync('/tmp/tlv_climb_segments.json', 'utf8'));
  let curved = 0;
  for (const c of terr) {
    const center = { lat: c.center[0], lng: c.center[1] };
    const _id = `terrain_${c.id.split(':')[1]}_${Math.round(c.center[0] * 1e4)}`;
    const v = validateTerrain(center.lat, center.lng);
    if (!v.keep) {
      rejectedTerrain.push({ id: _id, wayName: c.wayName, center, reason: v.reason });
      console.log(`  ✗ ${c.wayName} (${center.lat.toFixed(5)},${center.lng.toFixed(5)}) — ${v.reason}`);
      continue;
    }
    // Curved line = the sub-path of the DEM way (or nearest walkable way) between
    // start & end, sourced from the already-fetched walkable ways (no extra query).
    const full = walkById.get(c.id.split(':')[1]) || nearestWalkway(center.lat, center.lng);
    const line = subLine(full, c.start, c.end);
    if (line.length > 2) curved++;
    docs.push({ _id, type: 'terrain', climbType: c.climbType, center, bbox: bboxOf(line), geometry: toLine(line), lengthM: c.lengthM, avgGrade: c.avgGrade, maxGrade: c.maxGrade, dir: c.dir, geohash: geohash(center.lat, center.lng), wayName: c.wayName, source: 'dem:terrain-rgb' });
  }
  console.log(`terrain: ${terr.length} → kept ${terr.length - rejectedTerrain.length}, rejected ${rejectedTerrain.length} artifact(s); ${curved} curved lines (>2 pts)`);
  // 2) structure — incline / ramp foot ways
  //
  // Two real fixes, Stage 6 (17.08.2026) — verified live against Overpass
  // before landing, not guessed:
  //
  // (a) The REAL cause of most of the reported "construction ramp" noise:
  //     the ramp=yes branch matched highway=steps too, so a staircase with a
  //     side ramp (a very common real pattern — steps + an adjoining
  //     wheelchair/stroller/bike ramp, e.g. handrail+ramp:wheelchair tags)
  //     got written TWICE — once correctly as type:'stairs' (query 3 below),
  //     once again here as a bogus separate type:'structure' climb for the
  //     exact same physical feature. Verified live: 12 of the current 27
  //     pending structure docs are highway=steps ways that only exist here
  //     because of this OR-branch — dropping `steps` from this branch's
  //     highway filter removes them at the source; the stairs entry for the
  //     same way already exists and is unaffected.
  // (b) Genuinely absent before: any exclusion for construction=*,
  //     lifecycle=construction|disused|proposed, or access=no. Verified live
  //     that NONE of today's 27 pending docs actually carry these tags (so
  //     this fix has zero effect on today's backlog) — but it's a real,
  //     principled gap regardless, worth closing for future runs/cities
  //     where OSM data might actually carry them.
  //
  // What's NOT auto-fixed (confirmed no reliable signal exists): ~13 of the
  // 27 are bare, unnamed footway/path segments with only an incline tag and
  // no other context — genuinely low-confidence, but nothing distinguishes
  // them from a real short ramp without a human look. That's what
  // bulkRejectClimbs (Approval Center) is for, not a query filter.
  const ds = await overpass(`[out:json][timeout:90];(way["highway"~"footway|path|pedestrian"]["incline"]["access"!="no"][!"construction"][!"lifecycle"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax});way["ramp"="yes"]["highway"~"footway|path|pedestrian"]["access"!="no"][!"construction"][!"lifecycle"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax}););out geom tags;`);
  const seenS = new Set<number>();
  for (const w of ds.elements) { if (!w.geometry || w.geometry.length < 2 || seenS.has(w.id)) continue; seenS.add(w.id); const g = w.geometry.map((p: any) => [p.lat, p.lon]); const mid = g[Math.floor(g.length / 2)]; const inc = w.tags.incline || ''; const pct = /^-?\d+(\.\d+)?%$/.test(inc) ? Math.abs(parseFloat(inc)) : null; docs.push({ _id: `structure_${w.id}`, type: 'structure', climbType: 'structure-ramp', center: { lat: mid[0], lng: mid[1] }, bbox: bboxOf(g), geometry: toLine(g), lengthM: Math.round(len(g)), avgGrade: pct, maxGrade: pct, dir: inc === 'down' ? 'down' : 'up', geohash: geohash(mid[0], mid[1]), wayName: w.tags.name || null, source: `osm:${w.tags.highway}${w.tags.ramp === 'yes' ? '+ramp' : ''}`, inclineTag: inc || (w.tags.ramp === 'yes' ? 'ramp=yes' : null) }); }
  // 3) stairs — highway=steps
  const dst = await overpass(`[out:json][timeout:120];way["highway"="steps"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax});out geom tags;`);
  for (const w of dst.elements) {
    if (!w.geometry || w.geometry.length < 2) continue;
    const _id = `stairs_${w.id}`;
    // Escalators / moving walkways (conveying=yes|forward|backward|reversible) are NOT
    // training stairs — drop + delete any that a prior run wrote. conveying=no is a real
    // (explicitly non-moving) staircase, so keep it.
    if (w.tags.conveying && w.tags.conveying !== 'no') { escalators.push({ id: _id, label: w.tags.name || `way/${w.id}` }); continue; }
    const g = w.geometry.map((p: any) => [p.lat, p.lon]); const mid = g[Math.floor(g.length / 2)]; const lengthM = Math.round(len(g)); const stepCount = w.tags.step_count ? +w.tags.step_count : null; if (!stairSignificant(stepCount, lengthM)) continue;
    docs.push({ _id, type: 'stairs', climbType: 'stairs', center: { lat: mid[0], lng: mid[1] }, bbox: bboxOf(g), geometry: toLine(g), lengthM, stepCount, avgGrade: null, maxGrade: null, dir: w.tags.incline || null, geohash: geohash(mid[0], mid[1]), wayName: w.tags.name || null, source: 'osm:steps' });
  }
  console.log(`stairs: filtered ${escalators.length} escalator(s) (conveying=yes)`);
  return { docs, rejectedTerrain, escalators };
}

async function main() {
  const db = initFb(); const col = db.collection(COL);
  if (DEL) { const snap = await col.where('importBatchId', '==', BATCH).get(); console.log(`deleting ${snap.size} ...`); let b = db.batch(), n = 0; for (const d of snap.docs) { b.delete(d.ref); if (++n % 450 === 0) { await b.commit(); b = db.batch(); } } await b.commit(); console.log('✅ deleted'); return; }

  if (PRUNE) {
    const snap = await col.where('importBatchId', '==', BATCH).where('type', '==', 'stairs').get();
    const drop = snap.docs.filter(d => { const x = d.data(); return !stairSignificant(x.stepCount ?? null, x.lengthM || 0); });
    console.log(`stairs: ${snap.size} total → keep ${snap.size - drop.length} (stepCount≥${STAIR_MIN_STEPS} or length≥${STAIR_MIN_LEN}m), pruning ${drop.length}`);
    if (DRY) { console.log('[dry-run] no deletes'); return; }
    let b = db.batch(), n = 0; for (const d of drop) { b.delete(d.ref); if (++n % 450 === 0) { await b.commit(); b = db.batch(); } } await b.commit();
    console.log(`✅ pruned ${drop.length} trivial stairs. ${snap.size - drop.length} significant staircases remain.`);
    return;
  }

  const { docs, rejectedTerrain, escalators } = await build();
  const byType: any = {}; docs.forEach(d => byType[d.type] = (byType[d.type] || 0) + 1);
  console.log(`built ${docs.length} climb_segments →`, JSON.stringify(byType));

  // Resolve human street names where the OSM way carried none (missing or a bare
  // "way/1234" ref) — reverse-geocode the center. Runs in dry-run too so the
  // sample output shows the resolved names before any write.
  const need = docs.filter(d => !isRealName(d.wayName));
  console.log(`resolving ${need.length}/${docs.length} names via reverse-geocode${MAPBOX ? '' : ' (SKIPPED — no NEXT_PUBLIC_MAPBOX_TOKEN)'} ...`);
  let geocoded = 0;
  for (const d of need) {
    const name = await reverseGeocode(d.center.lat, d.center.lng);
    if (name) { d.wayName = name; geocoded++; }
    else if (!isRealName(d.wayName)) d.wayName = null; // never persist a "way/1234" ref
    await new Promise(r => setTimeout(r, 120)); // gentle on the geocoder
  }
  console.log(`resolved ${geocoded} street names (${need.length - geocoded} left unnamed → null)`);

  if (DRY) {
    console.log(`[dry-run] ${rejectedTerrain.length} terrain artifact(s) + ${escalators.length} escalator(s) would be dropped + deleted:`);
    rejectedTerrain.forEach(r => console.log(`   - terrain ${r.wayName} (${r.center.lat.toFixed(5)},${r.center.lng.toFixed(5)}) — ${r.reason}`));
    escalators.forEach(e => console.log(`   - escalator ${e.label} (${e.id})`));
    console.log('[dry-run] terrain sample:', JSON.stringify(docs.find(d => d.type === 'terrain'), null, 1));
    return;
  }

  let written = 0, b = db.batch(), n = 0;
  for (const d of docs) {
    const { _id, ...rest } = d;
    // Preserve moderation state on re-run: never reset an already-moderated
    // climb back to pending. New docs (and legacy docs missing status) default
    // to pending. origin marks these as system-imported (not UGC / admin-drawn).
    const snap = await col.doc(_id).get();
    const prev = snap.exists ? snap.data() : null;
    const status = prev?.status ?? 'pending';
    const origin = prev?.origin ?? 'osm_import';
    b.set(col.doc(_id), { ...rest, status, origin, city: 'תל אביב-יפו', importBatchId: BATCH, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    if (++n % 450 === 0) { await b.commit(); b = db.batch(); }
    written++;
  }
  await b.commit();
  console.log(`✅ ${COL}: wrote ${written} docs (${JSON.stringify(byType)}), status defaulted to 'pending' where unset. ADDITIVE — official_routes untouched.`);

  // Remove filtered docs a previous run may have written (before these filters existed):
  // terrain artifacts (over water/private) + escalators (conveying=yes).
  const toDelete = [...rejectedTerrain.map(r => r.id), ...escalators.map(e => e.id)];
  if (toDelete.length) {
    let db2 = db.batch(); for (const id of toDelete) db2.delete(col.doc(id)); await db2.commit();
    console.log(`🧹 deleted ${rejectedTerrain.length} terrain artifact(s) + ${escalators.length} escalator(s)`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
