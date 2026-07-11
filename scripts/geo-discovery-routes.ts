/**
 * scripts/geo-discovery-routes.ts — GEO-DISCOVERY, step 1 (boundary-parameterized)
 *
 * Generalises the (previously TLV-embedded) OSM route discovery+enrichment probe
 * into a REGION-parameterized ingester. Discovers good running/walking routes from
 * OpenStreetMap inside a named region boundary, enriches them (DEM elevation, loop
 * detection), filters artifacts, and writes them to `official_routes` as
 * status:'pending' / published:false — so they appear in the Approval Center and
 * NEVER enter the live generator before David approves them.
 *
 * Sources (all "good for running/walking"):
 *   trail    — marked route relations (route=hiking|foot|walking) clipped to the
 *              region → e.g. שביל ישראל, שבילי רמת הנדיב
 *   loop     — closed footway/path/track ways (start≈end) — loops are PREFERRED
 *   segment  — named footway/path/track/pedestrian ways of usable length
 *
 * Filters:
 *   - drops steps / escalators (highway=steps, conveying=*) — routes are not stairs
 *   - drops access=private / foot=no / indoor ways
 *   - drops artifacts: geometry sitting over water or inside a building polygon
 *   - length window per source (see LEN_* below)
 *
 * Enrichment: elevationGain + maxGrade via Mapbox Terrain-RGB DEM, isLoop flag.
 * Idempotent: keyed on source.externalId — re-runs UPDATE, never duplicate.
 * Does NOT broadcast to street_segments (pending routes stay out of the generator).
 *
 * Usage:
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron --dry-run   # discover + print, no write
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron             # write pending docs
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron --delete    # remove this region's batch
 *
 * Adding a region = one entry in REGIONS below (boundary as a parameter). That is
 * the whole point of this step: nothing here is hardcoded to a single city.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as zlib from 'zlib'; import * as https from 'https'; import * as admin from 'firebase-admin';

// ─────────────────────────────── CLI + region config ───────────────────────────────
const DRY = process.argv.includes('--dry-run');
const DELETE = process.argv.includes('--delete');
const regionArg = (process.argv.find(a => a.startsWith('--region=')) || '--region=zichron').split('=')[1];

interface Region {
  key: string;
  label: string;        // city label persisted on each route
  /** Overpass area selector body (e.g. an admin boundary by wikidata) — the primary boundary. */
  areaWikidata?: string;
  /** Extra bounding boxes to also sweep (e.g. an adjacent nature park not in the admin area). */
  extraBboxes?: Array<{ latMin: number; lonMin: number; latMax: number; lonMax: number }>;
  /** Overall bbox that encloses the whole region — used for DEM tiles + blocking-polygon fetch. */
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  batchId: string;
}

const REGIONS: Record<string, Region> = {
  // זכרון יעקב (admin boundary rel/1392828, wikidata Q198399) + רמת הנדיב (nature park,
  // just south of the town — outside the admin area, swept via an explicit bbox).
  zichron: {
    key: 'zichron',
    label: 'זכרון יעקב',
    areaWikidata: 'Q198399',
    extraBboxes: [{ latMin: 32.530, lonMin: 34.910, latMax: 32.578, lonMax: 34.970 }], // Ramat HaNadiv
    bbox: { latMin: 32.530, lonMin: 34.900, latMax: 32.600, lonMax: 34.985 },
    batchId: 'zichron-geodiscovery-2026-07-10',
  },
};

const REGION = REGIONS[regionArg];
if (!REGION) { console.error(`Unknown region "${regionArg}". Known: ${Object.keys(REGIONS).join(', ')}`); process.exit(1); }

// Length windows (meters) per source.
const LEN_TRAIL_MIN = 400, LEN_TRAIL_MAX = 25000;
const LEN_LOOP_MIN = 400, LEN_LOOP_MAX = 15000;
const LEN_SEG_MIN = 500, LEN_SEG_MAX = 12000;
const LOOP_CLOSE_M = 60; // start↔end within this ⇒ a loop

// ─────────────────────────────── geometry helpers ───────────────────────────────
const R = 6371000;
const hav = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const pathLen = (pts: number[][]) => pts.reduce((s, _, i) => i ? s + hav(pts[i - 1], pts[i]) : 0, 0);
const bboxOf = (pts: number[][]) => ({ minLat: Math.min(...pts.map(p => p[0])), maxLat: Math.max(...pts.map(p => p[0])), minLng: Math.min(...pts.map(p => p[1])), maxLng: Math.max(...pts.map(p => p[1])) });
// internal [lat,lng] → persisted {lng,lat} objects (Firestore forbids nested arrays;
// matches official_routes.path — normalizeStoredRoutePath reads it back).
const toPath = (pts: number[][]) => pts.map(p => ({ lng: p[1], lat: p[0] }));
const inBbox = (p: number[], b: Region['bbox']) => p[0] >= b.latMin && p[0] <= b.latMax && p[1] >= b.lonMin && p[1] <= b.lonMax;
function inPoly(p: number[], poly: number[][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (((yi > p[0]) !== (yj > p[0])) && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
const wayGeom = (e: any): number[][] => (e.geometry || []).map((p: any) => [p.lat, p.lon]);

// ─────────────────────────────── Overpass ───────────────────────────────
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 6000)); }
  }
  throw new Error('overpass failed (all mirrors)');
}
// Region selector: an area (from wikidata) written to .rgn, PLUS any extra bboxes.
// Returns { areaDecl, forEach(bodyFn) } so each query targets the whole region.
function regionSelectors(): { decl: string; scopes: string[] } {
  const decl = REGION.areaWikidata ? `area["wikidata"="${REGION.areaWikidata}"]->.rgn;` : '';
  const scopes: string[] = [];
  if (REGION.areaWikidata) scopes.push('(area.rgn)');
  for (const bb of REGION.extraBboxes || []) scopes.push(`(${bb.latMin},${bb.lonMin},${bb.latMax},${bb.lonMax})`);
  return { decl, scopes };
}

// ─────────────────────────────── Mapbox Terrain-RGB DEM ───────────────────────────────
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const Z = 14, nTiles = 2 ** Z;
const lon2gx = (lo: number) => (lo + 180) / 360 * 256 * nTiles;
const lat2gy = (la: number) => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * nTiles; };
function decodePNG(buf: Buffer) {
  let p = 8, W = 0, H = 0, ct = 0; const idat: Buffer[] = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4; const stride = W * ch; const out = Buffer.alloc(H * stride); let pos = 0;
  for (let y = 0; y < H; y++) { const ft = raw[pos++]; for (let x = 0; x < stride; x++) { const rv = raw[pos++]; const a = x >= ch ? out[y * stride + x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0; let v = rv; if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b; else if (ft === 3) v = rv + ((a + b) >> 1); else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[y * stride + x] = v & 0xff; } }
  return { width: W, height: H, ch, data: out };
}
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }).on('error', rej));
const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() {
  if (!TOKEN) { console.warn('  ⚠ no NEXT_PUBLIC_MAPBOX_TOKEN — DEM enrichment skipped (elevationGain=0)'); return; }
  const b = REGION.bbox;
  const txMin = Math.floor(lon2gx(b.lonMin) / 256), txMax = Math.floor(lon2gx(b.lonMax) / 256), tyMin = Math.floor(lat2gy(b.latMax) / 256), tyMax = Math.floor(lat2gy(b.latMin) / 256);
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) { try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`))); } catch {} }
}
function pxElev(ix: number, iy: number): number | null { const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256), t = tiles.get(`${tx}_${ty}`); if (!t) return null; const idx = ((iy - ty * 256) * t.width + (ix - tx * 256)) * t.ch; return -10000 + (t.data[idx] * 65536 + t.data[idx + 1] * 256 + t.data[idx + 2]) * 0.1; }
function elevAt(lon: number, lat: number): number | null { const gx = lon2gx(lon), gy = lat2gy(lat), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const e00 = pxElev(x0, y0), e10 = pxElev(x0 + 1, y0), e01 = pxElev(x0, y0 + 1), e11 = pxElev(x0 + 1, y0 + 1); if (e00 == null || e10 == null || e01 == null || e11 == null) return e00; return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy; }
// DEM elevation profile → total ascent + max local grade over a polyline.
function demProfile(pts: number[][]): { gainM: number; maxGrade: number } | null {
  if (!tiles.size) return null;
  const STEP = 15; const rs: number[][] = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { let from = pts[i - 1], segLen = hav(from, pts[i]); while (acc + segLen >= STEP) { const t = (STEP - acc) / segLen; const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t]; rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0; } acc += segLen; }
  const el = rs.map(p => elevAt(p[1], p[0])); if (el.some(e => e == null)) return null;
  const sm = (el as number[]).map((_, i) => { const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[]; return w.reduce((a, b) => a + b, 0) / w.length; });
  let gain = 0, maxG = 0; for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) gain += d; maxG = Math.max(maxG, d / STEP); }
  return { gainM: +gain.toFixed(1), maxGrade: +(maxG * 100).toFixed(1) };
}

// ─────────────────────────────── discovery ───────────────────────────────
type Candidate = {
  externalId: string; osmName: string | null; kind: 'trail' | 'loop' | 'segment';
  pts: number[][]; lengthM: number; isLoop: boolean; surface: 'road' | 'trail'; highway?: string; relRef?: string;
};

// Stitch relation member ways (that intersect the region) into ordered polylines by
// greedily chaining nearest endpoints. Splits into separate lines where a gap is large
// (the trail leaves + re-enters the region). Each returned line is one local segment.
function stitch(ways: number[][][], gapM = 80): number[][][] {
  const segs = ways.filter(w => w.length >= 2);
  if (!segs.length) return [];
  const used = new Array(segs.length).fill(false);
  const out: number[][][] = [];
  let curIdx = 0;
  while (used.some(u => !u)) {
    let start = used.findIndex(u => !u); used[start] = true;
    let line = segs[start].slice();
    let extended = true;
    while (extended) {
      extended = false;
      const tail = line[line.length - 1], head = line[0];
      let best = -1, bestD = gapM, bestRev = false, atTail = true;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const s = segs[i], a = s[0], b = s[s.length - 1];
        const dTA = hav(tail, a), dTB = hav(tail, b), dHA = hav(head, a), dHB = hav(head, b);
        const m = Math.min(dTA, dTB, dHA, dHB);
        if (m < bestD) { bestD = m; best = i; if (m === dTA) { atTail = true; bestRev = false; } else if (m === dTB) { atTail = true; bestRev = true; } else if (m === dHA) { atTail = false; bestRev = true; } else { atTail = false; bestRev = false; } }
      }
      if (best >= 0) { used[best] = true; const s = bestRev ? segs[best].slice().reverse() : segs[best].slice(); if (atTail) line = line.concat(s); else line = s.concat(line); extended = true; }
    }
    out.push(line);
    curIdx++;
    if (curIdx > 5000) break;
  }
  return out;
}

async function discover(): Promise<{ candidates: Candidate[]; blockPolys: { poly: number[][]; label: string }[]; stats: any }> {
  const { decl, scopes } = regionSelectors();
  const stats: any = { relations: 0, relLines: 0, ways: 0, loops: 0, segments: 0 };

  // 1) marked route relations (hiking/foot/walking) intersecting the region → clip members.
  console.log('discovering marked trails (route relations) …');
  const relParts = scopes.map(sc => `rel["route"~"^(hiking|foot|walking|running)$"]${sc};`).join('');
  const relData = await overpass(`[out:json][timeout:180];${decl}(${relParts})->.r;.r out tags;(.r;>;);out geom;`);
  const relTags = new Map<number, any>();
  const relMembersByRel = new Map<number, number[][][]>();
  // Overpass returns the relation (with members list) + member ways (with geometry).
  const wayById = new Map<number, number[][]>();
  for (const e of relData.elements) { if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e)); }
  for (const e of relData.elements) {
    if (e.type !== 'relation') continue;
    relTags.set(e.id, e.tags || {});
    const memberWays: number[][][] = [];
    for (const m of e.members || []) if (m.type === 'way' && wayById.has(m.ref)) {
      const g = wayById.get(m.ref)!;
      // clip: keep member ways that actually touch the region (any point in overall bbox)
      if (g.some(p => inBbox(p, REGION.bbox))) memberWays.push(g);
    }
    if (memberWays.length) relMembersByRel.set(e.id, memberWays);
  }
  stats.relations = relMembersByRel.size;

  const candidates: Candidate[] = [];
  const seenWayIds = new Set<number>(); // way ids consumed by a trail relation → don't re-emit as standalone
  for (const [relId, memberWays] of relMembersByRel) {
    for (const m of (relData.elements.find((e: any) => e.type === 'relation' && e.id === relId)?.members || [])) if (m.type === 'way') seenWayIds.add(m.ref);
    const tags = relTags.get(relId) || {};
    const lines = stitch(memberWays);
    let part = 0;
    for (const line of lines) {
      const L = pathLen(line);
      if (L < LEN_TRAIL_MIN || L > LEN_TRAIL_MAX) continue;
      const isLoop = hav(line[0], line[line.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
      candidates.push({ externalId: `osm:rel/${relId}${lines.length > 1 ? `#${part}` : ''}`, osmName: tags.name || null, kind: 'trail', pts: line, lengthM: Math.round(L), isLoop, surface: 'trail', relRef: `rel/${relId}` });
      part++; stats.relLines++;
    }
  }

  // 2) standalone footway/path/track/pedestrian ways (exclude steps, private, indoor).
  console.log('discovering standalone paths / loops (footway|path|track|pedestrian|cycleway) …');
  const wayParts = scopes.map(sc => `way["highway"~"^(footway|path|track|pedestrian|cycleway)$"]["highway"!~"steps"]${sc};`).join('');
  const wayData = await overpass(`[out:json][timeout:180];${decl}(${wayParts})->.w;.w out geom tags;`);
  stats.ways = wayData.elements.filter((e: any) => e.type === 'way').length;
  for (const e of wayData.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    if (seenWayIds.has(e.id)) continue; // already covered by a trail relation
    const t = e.tags || {};
    if (t.conveying && t.conveying !== 'no') continue;       // escalator / moving walkway
    if (t.highway === 'steps') continue;                      // stairs are not routes
    if (t.access === 'private' || t.foot === 'no' || t.foot === 'private') continue;
    if (t.indoor === 'yes' || t.tunnel === 'building_passage') continue;
    const pts = wayGeom(e);
    const L = pathLen(pts);
    const isLoop = hav(pts[0], pts[pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
    const surface: 'road' | 'trail' = (t.highway === 'pedestrian' || t.surface === 'paved' || t.surface === 'asphalt') ? 'road' : 'trail';
    if (isLoop) {
      if (L < LEN_LOOP_MIN || L > LEN_LOOP_MAX) continue;
      candidates.push({ externalId: `osm:way/${e.id}`, osmName: t.name || null, kind: 'loop', pts, lengthM: Math.round(L), isLoop: true, surface, highway: t.highway });
      stats.loops++;
    } else {
      // standalone non-loop segments: only keep NAMED ways of usable length (an unnamed
      // 300m path fragment is rarely a route on its own; named ones are real trails/promenades)
      if (!t.name) continue;
      if (L < LEN_SEG_MIN || L > LEN_SEG_MAX) continue;
      candidates.push({ externalId: `osm:way/${e.id}`, osmName: t.name, kind: 'segment', pts, lengthM: Math.round(L), isLoop: false, surface, highway: t.highway });
      stats.segments++;
    }
  }

  // 3) blocking polygons (water + buildings) for artifact filtering.
  console.log('fetching blocking polygons (water + buildings) for artifact filter …');
  const b = REGION.bbox;
  const bb = `${b.latMin - 0.003},${b.lonMin - 0.003},${b.latMax + 0.003},${b.lonMax + 0.003}`;
  const blockData = await overpass(`[out:json][timeout:120];(way["natural"="water"](${bb});way["building"](${bb});way["leisure"~"^(swimming_pool|water_park)$"](${bb});relation["natural"="water"](${bb}););out geom;`);
  const blockPolys: { poly: number[][]; label: string }[] = [];
  for (const e of blockData.elements) {
    const label = e.tags?.name || e.tags?.natural || (e.tags?.building ? 'building' : e.tags?.leisure) || 'block';
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) blockPolys.push({ poly: wayGeom(e), label });
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.geometry && m.geometry.length >= 3) blockPolys.push({ poly: m.geometry.map((p: any) => [p.lat, p.lon]), label });
  }
  return { candidates, blockPolys, stats };
}

// A candidate is an artifact if a meaningful fraction of its vertices sit inside a
// blocking polygon (over water / inside a building). One stray point is tolerated
// (OSM ways can graze a building corner); >20% inside ⇒ reject.
function artifactReason(pts: number[][], blockPolys: { poly: number[][]; label: string }[]): string | null {
  let inside = 0; let label = '';
  for (const p of pts) { const b = blockPolys.find(bp => inPoly(p, bp.poly)); if (b) { inside++; label = b.label; } }
  return inside / pts.length > 0.2 ? `over ${label} (${inside}/${pts.length} pts)` : null;
}

// ─────────────────────────────── route doc builder ───────────────────────────────
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat: number, lon: number, prec = 7) { let idx = 0, bit = 0, even = true, h = ''; const la = [-90, 90], lo = [-180, 180]; while (h.length < prec) { if (even) { const m = (lo[0] + lo[1]) / 2; if (lon >= m) { idx = idx * 2 + 1; lo[0] = m; } else { idx = idx * 2; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m) { idx = idx * 2 + 1; la[0] = m; } else { idx = idx * 2; la[1] = m; } } even = !even; if (++bit === 5) { h += B32[idx]; bit = 0; idx = 0; } } return h; }

function buildRouteDoc(c: Candidate, dem: { gainM: number; maxGrade: number } | null) {
  // Persist distance in KILOMETRES — the unit the client + player expect
  // (`setGuidedRouteDistanceKm`, `RouteDetailSheet.formatDistance(km)`) and the
  // unit `InventoryService.recalculateAllDistances` writes. `c.lengthM` (meters)
  // stays internal for the length-window filters + loop-first sort only.
  const distanceKm = +(c.lengthM / 1000).toFixed(2);
  // walking is the safe default for nature trails; paved pedestrian promenades also run well.
  const activityTypes = ['walking', 'running'];
  const activityType = c.surface === 'road' ? 'running' : 'walking';
  const kindHe = c.isLoop ? 'לולאה' : c.kind === 'trail' ? 'שביל מסומן' : 'מסלול';
  const name = c.osmName
    ? (c.isLoop ? `לולאת ${c.osmName}` : c.osmName)
    : `${kindHe} ${REGION.label}${c.isLoop ? ' (לולאה)' : ''}`;
  const mid = c.pts[Math.floor(c.pts.length / 2)];
  const gain = dem?.gainM ?? 0;
  // difficulty from length + climb (simple, transparent heuristic)
  const difficulty: 'easy' | 'moderate' | 'hard' = (distanceKm > 8 || gain > 200) ? 'hard' : (distanceKm > 3.5 || gain > 80) ? 'moderate' : 'easy';
  return {
    name,
    description: `${kindHe} ${c.surface === 'trail' ? 'שטח' : 'סלול'} ב${REGION.label}${c.osmName ? ` — ${c.osmName}` : ''}`,
    distance: distanceKm,
    // minutes @100 m/min — matches recalculateAllDistances' duration formula so a
    // later global recalc is idempotent for these docs.
    duration: Math.round((distanceKm * 1000) / 100),
    score: Math.round(distanceKm * 10),
    rating: c.isLoop ? 5 : 4,
    calories: Math.round(distanceKm * 65),
    type: activityType,
    activityType,
    activityTypes,
    difficulty,
    path: toPath(c.pts),
    segments: [],
    features: {
      hasGym: false, hasBenches: false,
      scenic: c.surface === 'trail' || c.kind === 'trail',
      lit: c.surface === 'road',
      terrain: c.surface === 'trail' ? 'dirt' : 'asphalt',
      environment: c.surface === 'trail' ? 'nature' : 'urban',
      trafficLoad: 'none',
      surface: c.surface,
    },
    source: { type: 'official_api', name: 'OSM Geo-Discovery', externalId: c.externalId, ...(c.relRef ? { osmRef: c.relRef } : {}) },
    elevationGain: gain,
    maxGrade: dem?.maxGrade ?? 0,
    isLoop: c.isLoop,
    geohash: geohash(mid[0], mid[1]),
    city: REGION.label,
    importBatchId: REGION.batchId,
    origin: 'osm_import',
    status: 'pending',
    published: false,
  };
}

// ─────────────────────────────── firebase ───────────────────────────────
function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function main() {
  console.log(`\n=== GEO-DISCOVERY — region: ${REGION.label} (${REGION.key}) ===`);
  const db = initFb();
  const col = db.collection('official_routes');

  if (DELETE) {
    const snap = await col.where('importBatchId', '==', REGION.batchId).get();
    console.log(`deleting ${snap.size} routes from batch ${REGION.batchId} …`);
    let b = db.batch(), n = 0; for (const d of snap.docs) { b.delete(d.ref); if (++n % 450 === 0) { await b.commit(); b = db.batch(); } } await b.commit();
    console.log('✅ deleted'); return;
  }

  console.log('loading Terrain-RGB DEM tiles …'); await loadTiles(); console.log(`  decoded ${tiles.size} tiles`);
  const { candidates, blockPolys, stats } = await discover();
  console.log(`\ndiscovered: ${stats.relations} trail-relations → ${stats.relLines} local lines · ${stats.loops} loops · ${stats.segments} named segments (from ${stats.ways} ways). blocking polygons: ${blockPolys.length}`);

  // filter artifacts + enrich
  const kept: { doc: ReturnType<typeof buildRouteDoc>; c: Candidate }[] = [];
  const dropped: { name: string; reason: string }[] = [];
  for (const c of candidates) {
    const reason = artifactReason(c.pts, blockPolys);
    if (reason) { dropped.push({ name: c.osmName || c.externalId, reason }); continue; }
    const dem = demProfile(c.pts);
    kept.push({ doc: buildRouteDoc(c, dem), c });
  }
  // Prefer loops: loops first, then by (climb-weighted) length descending.
  kept.sort((a, b) => (Number(b.c.isLoop) - Number(a.c.isLoop)) || (b.doc.distance * (1 + (b.doc.elevationGain || 0) / 100) - a.doc.distance * (1 + (a.doc.elevationGain || 0) / 100)));

  const nLoops = kept.filter(k => k.c.isLoop).length;
  const nTrails = kept.filter(k => k.c.kind === 'trail').length;
  console.log(`\nAFTER FILTER: ${kept.length} routes kept (${nLoops} loops, ${nTrails} marked-trail lines), ${dropped.length} artifacts dropped.`);
  if (dropped.length) dropped.slice(0, 10).forEach(d => console.log(`   ✗ ${d.name} — ${d.reason}`));

  console.log('\n── candidates (loops first) ──');
  for (const k of kept) {
    const d = k.doc;
    console.log(`  ${k.c.isLoop ? '🔁' : k.c.kind === 'trail' ? '🥾' : '·'} ${String(d.distance).padStart(6)}km  (${String(k.c.lengthM)}m)  gain ${String(d.elevationGain).padStart(4)}m  ${d.difficulty.padEnd(8)} ${d.name}  [${k.c.externalId}]`);
  }

  if (DRY) { console.log(`\n[dry-run] no writes. ${kept.length} pending routes would be written to official_routes (batch ${REGION.batchId}).`); return; }

  // idempotent upsert by source.externalId; preserve moderation state on re-run.
  let created = 0, updated = 0;
  for (const k of kept) {
    const existing = await col.where('source.externalId', '==', k.c.externalId).limit(1).get();
    if (existing.empty) {
      await col.add({ ...k.doc, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      created++;
    } else {
      const prev = existing.docs[0].data();
      // never resurrect an already-moderated route back to pending
      const status = prev.status && prev.status !== 'pending' ? prev.status : 'pending';
      const published = prev.published === true ? true : false;
      await existing.docs[0].ref.set({ ...k.doc, status, published, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      updated++;
    }
  }
  console.log(`\n✅ official_routes: ${created} created, ${updated} updated — all status:'pending', published:false (batch ${REGION.batchId}). NO street_segments broadcast, NO merge.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
