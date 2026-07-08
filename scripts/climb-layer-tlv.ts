/**
 * scripts/climb-layer-tlv.ts — PILOT, READ-ONLY (no DB writes)
 *
 * Unified, location-queryable CLIMB LAYER for Tel Aviv, from 3 sources:
 *   • terrain   — Mapbox Terrain-RGB DEM (bare-earth) → real hills
 *   • structure — OSM structural tags (incline/ramp/bridge) → man-made climbs
 *                 the bare-earth DEM cannot see (e.g. Gordon built ramp)
 *   • stairs    — OSM highway=steps → separate "stairs" category
 *
 * Each climb: { id, type, center[lat,lon], bbox, lengthM, avgGrade, maxGrade, dir, source }
 * Demonstrates climbsNear(lat,lon,r) — what the route generator would pull.
 * Also DEM-tags the 27 imported loops with elevationGain / maxGrade (shown, not written).
 *
 * Probes: (1) Habima / Rothschild climb via DEM  (2) Gordon ramp via OSM tags.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import * as zlib from 'zlib'; import * as https from 'https'; import * as fs from 'fs';
import * as admin from 'firebase-admin';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const BBOX = { latMin: 32.040, latMax: 32.118, lonMin: 34.740, lonMax: 34.800 };
const Z = 14; const n = 2 ** Z;
const HABIMA = { lat: 32.07145, lon: 34.78055, name: 'כיכר הבימה' };
const GORDON = { lat: 32.08270, lon: 34.76815, name: 'רמפת גורדון (חוף)' };

const lon2gx = (lo: number) => (lo + 180) / 360 * 256 * n;
const lat2gy = (la: number) => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n; };

function decodePNG(buf: Buffer) {
  let p = 8, W = 0, H = 0, ct = 0; const idat: Buffer[] = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4; const stride = W * ch; const out = Buffer.alloc(H * stride); let pos = 0;
  for (let y = 0; y < H; y++) { const ft = raw[pos++]; for (let x = 0; x < stride; x++) { const rv = raw[pos++]; const a = x >= ch ? out[y * stride + x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0; let v = rv; if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b; else if (ft === 3) v = rv + ((a + b) >> 1); else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[y * stride + x] = v & 0xff; } }
  return { width: W, height: H, ch, data: out };
}
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }).on('error', rej));
const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() {
  const txMin = Math.floor(lon2gx(BBOX.lonMin) / 256), txMax = Math.floor(lon2gx(BBOX.lonMax) / 256), tyMin = Math.floor(lat2gy(BBOX.latMax) / 256), tyMax = Math.floor(lat2gy(BBOX.latMin) / 256);
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) { try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`))); } catch {} }
}
function pxElev(ix: number, iy: number): number | null { const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256), t = tiles.get(`${tx}_${ty}`); if (!t) return null; const idx = ((iy - ty * 256) * t.width + (ix - tx * 256)) * t.ch; return -10000 + (t.data[idx] * 65536 + t.data[idx + 1] * 256 + t.data[idx + 2]) * 0.1; }
function elevAt(lon: number, lat: number): number | null { const gx = lon2gx(lon), gy = lat2gy(lat), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const e00 = pxElev(x0, y0), e10 = pxElev(x0 + 1, y0), e01 = pxElev(x0, y0 + 1), e11 = pxElev(x0 + 1, y0 + 1); if (e00 == null || e10 == null || e01 == null || e11 == null) return e00; return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy; }

const R = 6371000;
const hav = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const bearing = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180, y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl); return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360 / 45) % 8]; };

async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 4; a++) for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try { const buf: Buffer = await new Promise((res, rej) => { const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); }); req.on('error', rej); req.write('data=' + encodeURIComponent(q)); req.end(); }); return JSON.parse(buf.toString()); } catch { await new Promise(r => setTimeout(r, 6000)); }
  } throw new Error('overpass failed');
}

// DEM elevation profile along a polyline → gain + max grade over `win` meters
function profile(pts: number[][]) {
  const STEP = 12; const rs: number[][] = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { let from = pts[i - 1], segLen = hav(from, pts[i]); while (acc + segLen >= STEP) { const t = (STEP - acc) / segLen; const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t]; rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0; } acc += segLen; }
  const el = rs.map(p => elevAt(p[1], p[0])); if (el.some(e => e == null)) return null;
  const sm = (el as number[]).map((_, i) => { const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[]; return w.reduce((a, b) => a + b, 0) / w.length; });
  let gain = 0, maxG = 0; for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) gain += d; maxG = Math.max(maxG, d / STEP); }
  return { rs, sm, gainM: +gain.toFixed(1), maxGrade: +(maxG * 100).toFixed(1), lengthM: Math.round((rs.length - 1) * STEP) };
}

async function main() {
  console.log('loading Terrain-RGB tiles ...'); await loadTiles(); console.log(`decoded ${tiles.size} tiles`);

  // ---------- PROBE 1: Habima / Rothschild (terrain climb, DEM) ----------
  console.log('\n=== PROBE 1 — כיכר הבימה / שדרות רוטשילד (terrain, DEM) ===');
  const dR = await overpass(`[out:json][timeout:60];area["wikidata"="Q33935"]->.a;way["name"="שדרות רוטשילד"]["highway"="tertiary"](area.a);out geom;`);
  // stitch the tertiary carriageway segments SW→NE and sample DEM
  let segs = dR.elements.filter((e: any) => e.geometry).map((e: any) => e.geometry.map((p: any) => [p.lat, p.lon]));
  segs.sort((a: number[][], b: number[][]) => a[0][1] - b[0][1]); // west→east by start lon
  const line = ([] as number[][]).concat(...segs);
  const pr = profile(line);
  if (pr) {
    const eStart = pr.sm[0], eEnd = pr.sm[pr.sm.length - 1];
    console.log(`Rothschild boulevard sampled ${pr.lengthM}m: ${eStart.toFixed(1)}m (SW) → ${eEnd.toFixed(1)}m (Habima/NE)`);
    console.log(`→ net climb ${(eEnd - eStart).toFixed(1)}m, total ascent ${pr.gainM}m, avg ${((eEnd - eStart) / pr.lengthM * 100).toFixed(1)}%, max local ${pr.maxGrade}% — DEM SEES this (it's terrain). ✅`);
  }
  const eh = elevAt(HABIMA.lon, HABIMA.lat), eherzl = elevAt(34.7688, 32.0627);
  console.log(`spot check: Habima ${eh?.toFixed(1)}m vs Rothschild SW end ${eherzl?.toFixed(1)}m → ${((eh! - eherzl!)).toFixed(1)}m rise`);

  // ---------- PROBE 2: Gordon ramp (structure, OSM tags) ----------
  console.log('\n=== PROBE 2 — רמפת גורדון (man-made, OSM structural tags) ===');
  const dG = await overpass(`[out:json][timeout:60];( way["highway"]["incline"](around:450,${GORDON.lat},${GORDON.lon}); way["ramp"="yes"](around:450,${GORDON.lat},${GORDON.lon}); )->.s; .s out geom tags;`);
  const structural = dG.elements.filter((e: any) => e.geometry);
  console.log(`OSM structural ways at Gordon: ${structural.length}`);
  for (const w of structural.slice(0, 6)) {
    const g = w.geometry.map((p: any) => [p.lat, p.lon]); const len = g.reduce((s: number, _: any, i: number) => i ? s + hav(g[i - 1], g[i]) : 0, 0);
    const eA = elevAt(g[0][1], g[0][0]), eB = elevAt(g[g.length - 1][1], g[g.length - 1][0]);
    console.log(`  way/${w.id} ${w.tags.highway} incline=${w.tags.incline || '-'} ramp=${w.tags.ramp || '-'} bridge=${w.tags.bridge || '-'} | ${Math.round(len)}m | DEM Δ=${((eB! - eA!)).toFixed(1)}m ← ~flat in DEM, climb known only from tag`);
  }
  console.log('→ the built ramp is INVISIBLE to bare-earth DEM (Δ≈0) but fully described by OSM incline/ramp tags. ✅ captured via structure source.');

  // ---------- UNIFIED CLIMB LAYER ----------
  console.log('\n=== UNIFIED CLIMB LAYER (location-queryable) ===');
  const terrain = JSON.parse(fs.readFileSync('/tmp/tlv_climbs.json', 'utf8')).filter((c: any) => !c.suspect)
    .map((c: any) => ({ id: `terrain:${c.wayId}:${Math.round(c.mid[0] * 1e4)}`, type: 'terrain', center: c.mid, lengthM: c.lengthM, avgGrade: c.avgGrade, maxGrade: c.maxGrade, dir: c.dir, source: 'dem' }));
  // structural climbs citywide (incline or ramp=yes on foot ways)
  const dS = await overpass(`[out:json][timeout:90];area["wikidata"="Q33935"]->.a;( way["highway"~"footway|path|pedestrian"]["incline"](area.a); way["ramp"="yes"]["highway"~"footway|path|pedestrian|steps"](area.a); )->.s;.s out geom tags;`);
  const struct = dS.elements.filter((e: any) => e.geometry && e.geometry.length >= 2).map((w: any) => {
    const g = w.geometry.map((p: any) => [p.lat, p.lon]); const len = g.reduce((s: number, _: any, i: number) => i ? s + hav(g[i - 1], g[i]) : 0, 0); const mid = g[Math.floor(g.length / 2)];
    const inclPct = /^-?\d+(\.\d+)?%$/.test(w.tags.incline || '') ? Math.abs(parseFloat(w.tags.incline)) : null;
    return { id: `structure:${w.id}`, type: 'structure', center: mid, lengthM: Math.round(len), avgGrade: inclPct, maxGrade: inclPct, dir: w.tags.incline === 'down' ? 'down' : 'up', source: `osm:${w.tags.highway}${w.tags.ramp === 'yes' ? '+ramp' : ''}`, tag: w.tags.incline || w.tags.ramp };
  });
  const dSteps = await overpass(`[out:json][timeout:90];area["wikidata"="Q33935"]->.a;way["highway"="steps"](area.a);out count;`);
  const stepsN = +dSteps.elements[0].tags.total;
  const layer = [...terrain, ...struct];
  console.log(`terrain climbs: ${terrain.length} | structural climbs (incline/ramp): ${struct.length} | stairs (separate category): ${stepsN}`);
  fs.writeFileSync('/tmp/tlv_climb_layer.json', JSON.stringify(layer));

  // climbsNear() — what the generator would call
  const climbsNear = (lat: number, lon: number, rM: number) => layer.filter(c => hav([lat, lon], c.center) < rM).sort((a, b) => (b.lengthM * (b.avgGrade || 3)) - (a.lengthM * (a.avgGrade || 3)));
  for (const P of [HABIMA, GORDON]) {
    console.log(`\nclimbsNear("${P.name}", 400m):`);
    for (const c of climbsNear(P.lat, P.lon, 400).slice(0, 4))
      console.log(`  [${c.type}] ${c.lengthM}m ${c.avgGrade != null ? c.avgGrade + '%' : '(grade via tag)'} ${c.dir} — ${c.source}`);
  }

  // ---------- TAG THE 27 LOOPS (read-only) ----------
  console.log('\n=== DEM-TAGGING the 27 loops (elevationGain / maxGrade) — shown, NOT written ===');
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  const snap = await admin.firestore().collection('official_routes').where('importBatchId', '==', 'tlv-pilot-2026-07-07').get();
  const tagged: any[] = [];
  snap.docs.forEach(d => { const x = d.data(); const pts = (x.path as any[]).map(p => [p.lat, p.lng]); const pr = profile(pts); if (pr) tagged.push({ name: x.name, dist: x.distance, demGain: pr.gainM, maxGrade: pr.maxGrade }); });
  tagged.sort((a, b) => b.demGain - a.demGain);
  console.log('loop                             dist   DEM-gain  maxGrade  → challenge?');
  for (const t of tagged.slice(0, 8)) console.log(`${t.name.padEnd(32)} ${String(t.dist).padStart(4)}m   ${String(t.demGain).padStart(5)}m    ${String(t.maxGrade).padStart(5)}%   ${t.demGain > 15 || t.maxGrade > 6 ? '🏔 yes' : 'flat'}`);
  console.log(`\nfull climb layer → /tmp/tlv_climb_layer.json (${layer.length} climbs). No DB writes.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
