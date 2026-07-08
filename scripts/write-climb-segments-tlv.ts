/**
 * scripts/write-climb-segments-tlv.ts — Phase 1 write (ADDITIVE)
 *
 * Writes the unified TLV CLIMB LAYER to a NEW collection `climb_segments`.
 * Does NOT touch official_routes or any existing data.
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
// Persisted climb geometry: [lat,lng] internal → [lng,lat] tuples, to match the
// app/route render contract (Mapbox order). Reader renders these as a coloured line.
const toLine = (pts: number[][]) => pts.map(p => [p[1], p[0]] as [number, number]);

// Reverse-geocode a center to a street name for climbs whose OSM way had no name
// tag (wayName missing or a bare "way/1234" ref). Mapbox token comes from .env.local.
const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&language=he&limit=1&access_token=${MAPBOX}`;
    const buf: Buffer = await new Promise((res, rej) => { https.get(url, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); }).on('error', rej); });
    const j = JSON.parse(buf.toString());
    const f = j.features?.[0];
    return (f?.text as string) || (f?.place_name as string)?.split(',')[0] || null;
  } catch { return null; }
}
const isRealName = (n: unknown): n is string => typeof n === 'string' && n.trim().length > 0 && !/^way\/\d+$/i.test(n.trim());

function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function build() {
  const docs: any[] = [];
  // 1) terrain
  const terr = JSON.parse(fs.readFileSync('/tmp/tlv_climb_segments.json', 'utf8'));
  for (const c of terr) {
    const center = { lat: c.center[0], lng: c.center[1] };
    docs.push({ _id: `terrain_${c.id.split(':')[1]}_${Math.round(c.center[0] * 1e4)}`, type: 'terrain', climbType: c.climbType, center, bbox: bboxOf([c.start, c.end]), geometry: toLine([c.start, c.end]), lengthM: c.lengthM, avgGrade: c.avgGrade, maxGrade: c.maxGrade, dir: c.dir, geohash: geohash(center.lat, center.lng), wayName: c.wayName, source: 'dem:terrain-rgb' });
  }
  // 2) structure — incline / ramp foot ways
  const ds = await overpass(`[out:json][timeout:90];(way["highway"~"footway|path|pedestrian"]["incline"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax});way["ramp"="yes"]["highway"~"footway|path|pedestrian|steps"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax}););out geom tags;`);
  const seenS = new Set<number>();
  for (const w of ds.elements) { if (!w.geometry || w.geometry.length < 2 || seenS.has(w.id)) continue; seenS.add(w.id); const g = w.geometry.map((p: any) => [p.lat, p.lon]); const mid = g[Math.floor(g.length / 2)]; const inc = w.tags.incline || ''; const pct = /^-?\d+(\.\d+)?%$/.test(inc) ? Math.abs(parseFloat(inc)) : null; docs.push({ _id: `structure_${w.id}`, type: 'structure', climbType: 'structure-ramp', center: { lat: mid[0], lng: mid[1] }, bbox: bboxOf(g), geometry: toLine(g), lengthM: Math.round(len(g)), avgGrade: pct, maxGrade: pct, dir: inc === 'down' ? 'down' : 'up', geohash: geohash(mid[0], mid[1]), wayName: w.tags.name || null, source: `osm:${w.tags.highway}${w.tags.ramp === 'yes' ? '+ramp' : ''}`, inclineTag: inc || (w.tags.ramp === 'yes' ? 'ramp=yes' : null) }); }
  // 3) stairs — highway=steps
  const dst = await overpass(`[out:json][timeout:120];way["highway"="steps"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax});out geom tags;`);
  for (const w of dst.elements) { if (!w.geometry || w.geometry.length < 2) continue; const g = w.geometry.map((p: any) => [p.lat, p.lon]); const mid = g[Math.floor(g.length / 2)]; const lengthM = Math.round(len(g)); const stepCount = w.tags.step_count ? +w.tags.step_count : null; if (!stairSignificant(stepCount, lengthM)) continue; docs.push({ _id: `stairs_${w.id}`, type: 'stairs', climbType: 'stairs', center: { lat: mid[0], lng: mid[1] }, bbox: bboxOf(g), geometry: toLine(g), lengthM, stepCount, avgGrade: null, maxGrade: null, dir: w.tags.incline || null, geohash: geohash(mid[0], mid[1]), wayName: w.tags.name || null, source: 'osm:steps' }); }
  return docs;
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

  const docs = await build();
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

  if (DRY) { console.log('[dry-run] terrain sample:', JSON.stringify(docs.find(d => d.type === 'terrain'), null, 1)); console.log('[dry-run] structure sample:', JSON.stringify(docs.find(d => d.type === 'structure'), null, 1)); return; }

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
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
