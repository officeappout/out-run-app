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
 *              region → e.g. שביל ישראל, שבילי רמת הנדיב. A relation-line
 *              exceeding LEN_TRAIL_MAX is not just discarded: any individually-
 *              NAMED member way is rescued and re-offered to the segment/loop
 *              pipeline below (see "relation-rejection rescue"), so a short,
 *              locally-special way isn't silently swallowed by its parent
 *              trail's own length cap.
 *   park     — NEW: named leisure=park/garden polygons (way or relation) inside
 *              the region → a perimeter loop tracing the park's own real OSM
 *              boundary ring (never a synthetic circle). See buildLoop() below
 *              for why this is a real trace and not a reuse of the live app's
 *              generator (checked, infeasible: Firebase-client entanglement,
 *              and it has zero polygon awareness anyway).
 *   loop     — closed footway/path/track ways (start≈end) — loops are PREFERRED
 *   segment  — NAMED footway/path/track/pedestrian/cycleway ways, PLUS named
 *              living_street/residential/service/tertiary/unclassified ways
 *              ("street-based promenades stay continuous" — a promenade tagged
 *              as an ordinary street is no longer invisible to discovery).
 *              Same-named and geometrically-adjacent fragments are STITCHED
 *              into one continuous candidate before length/name filtering —
 *              see "promenade stitching" below — instead of being emitted as
 *              separate, shorter, easily-length-filtered stubs.
 *
 * Promenade stitching (two passes, before length/name filters apply):
 *   pass 1 — same-name: every standalone named way sharing an exact `name` tag
 *            is greedily chained (stitchWithIds, SAME_NAME_GAP_M) into one or
 *            more continuous lines.
 *   pass 2 — geometric continuity, across DIFFERENT names: pass 1's results
 *            (plus any unmerged singly-named way) are chained again, ignoring
 *            name, purely by endpoint proximity — a tighter gap tolerance
 *            (CROSS_NAME_GAP_M) than pass 1, and only within a compatible tag
 *            family (foot/track/street/bicycle), since cross-name merging
 *            carries real false-positive risk. The canonical name of a
 *            cross-name merge is the LONGEST constituent segment's real name;
 *            every constituent way id is preserved on `source.sourceWayIds`
 *            for traceability. A stitched candidate's `source.externalId` is
 *            deterministic — `osm:stitched/<sorted way ids>` — so re-running
 *            discovery against unchanged OSM data always regenerates the same
 *            id, never a duplicate (stitch()/stitchWithIds' greedy chaining is
 *            input-order-sensitive, and Overpass mirror response order isn't
 *            guaranteed stable run-to-run).
 *
 * Filters:
 *   - drops steps / escalators (highway=steps, conveying=*) — routes are not stairs
 *   - drops access=private / foot=no / indoor ways
 *   - drops artifacts: geometry sitting over water or inside a building polygon
 *   - length window per source (see LEN_* below) — LEN_SEG_MIN_NAMED (50m) applies
 *     to named NON-LOOP segments/promenades specifically; LOOP candidates (park or
 *     otherwise) keep LEN_LOOP_MIN (400m) regardless of naming — a loop is a
 *     different length regime by nature, not a "specialness" question.
 *   - every standalone-way candidate (loop or not) must carry a real OSM name —
 *     no anonymous filler loops (a bare unnamed closed way used to be exempt from
 *     the named-only rule; that exemption is removed). Trail-RELATION candidates
 *     are a deliberate, stated exception — a relation is already real, human-
 *     mapped, officially-classified evidence of "specialness" even without a
 *     `name` tag (Israel's paint-color-marked-trail convention), so an unnamed
 *     trail relation still gets the existing generic fallback name rather than
 *     being dropped.
 *
 * Enrichment: elevationGain + maxGrade via Mapbox Terrain-RGB DEM, routeShape ('loop' when geometrically closed, omitted otherwise).
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
import { mapOsmSurfaceToType } from '../src/lib/route-collections/surface-type';

// ─────────────────────────────── CLI + region config ───────────────────────────────
const DRY = process.argv.includes('--dry-run');
const DELETE = process.argv.includes('--delete');
const ROUNDTRIPS = process.argv.includes('--roundtrips'); // add Mapbox foot round-trip loops
const SKIP_OSM = process.argv.includes('--skip-osm');      // skip Overpass discovery (round-trips only)
const regionArg = (process.argv.find(a => a.startsWith('--region=')) || '--region=zichron').split('=')[1];

interface Region {
  key: string;
  label: string;        // city label persisted on each route
  /** Overpass area selector body (e.g. an admin boundary by wikidata) — the primary boundary. */
  areaWikidata?: string;
  /** Wikidata id of the real admin boundary, used ONLY as a post-discovery clipping
   *  filter — deliberately decoupled from areaWikidata. Using the admin area as
   *  Overpass DISCOVERY SCOPE collapses marked-trail RELATION matching (Overpass's
   *  area-vs-bbox relation-containment semantics differ for relations that only
   *  partially cross the boundary — confirmed empirically on Haifa: 51→0
   *  trail-relations when areaWikidata was used for both). Optional — a region
   *  without this field simply gets no boundary clip (fail-open, same as every
   *  region before this field existed). */
  boundaryClipWikidata?: string;
  /** Extra bounding boxes to also sweep (e.g. an adjacent nature park not in the admin area). */
  extraBboxes?: Array<{ latMin: number; lonMin: number; latMax: number; lonMax: number }>;
  /** Overall bbox that encloses the whole region — used for DEM tiles + blocking-polygon fetch. */
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  /** Named anchor points for the Mapbox round-trip source (--roundtrips). Loops are also
   *  generated around every `parks` gym whose coords fall inside this region's bbox. */
  roundTripAnchors?: Array<{ key: string; label: string; lat: number; lng: number }>;
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
  // אשקלון — full municipal boundary (rel/1376782, wikidata Q60956, admin_level 8).
  // Whole city: coast promenade + marina, national park, and every neighbourhood are
  // all inside the admin area, so no extra bbox is needed. The bbox below is the
  // nominatim bounding box of the boundary (used for DEM tiles + blocking polygons).
  ashkelon: {
    key: 'ashkelon',
    label: 'אשקלון',
    areaWikidata: 'Q60956',
    bbox: { latMin: 31.619, lonMin: 34.492, latMax: 31.719, lonMax: 34.615 },
    batchId: 'ashkelon-geodiscovery-2026-07-22',
  },

  // ── אשקלון by neighbourhood — smaller, focused bboxes (Overpass returns more, 504s less).
  // All keep label 'אשקלון' so the persisted `city` stays consistent; only the batchId differs,
  // so each neighbourhood batch is reviewable/deletable on its own. bboxes ≈ 2km, from Nominatim.
  // Overlap between adjacent boxes is harmless: a shared way is upserted once (by externalId).
  'ashkelon-marina': {   // מרינה + טיילת החוף (coastal strip)
    key: 'ashkelon-marina', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.665, lonMin: 34.548, latMax: 31.690, lonMax: 34.562 }],
    bbox: { latMin: 31.665, lonMin: 34.548, latMax: 31.690, lonMax: 34.562 },
    batchId: 'ashkelon-marina-2026-07-22',
  },
  'ashkelon-afridar': {  // אפרידר (Nominatim place=neighbourhood 31.6775,34.5673)
    key: 'ashkelon-afridar', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6675, lonMin: 34.5573, latMax: 31.6875, lonMax: 34.5773 }],
    bbox: { latMin: 31.6675, lonMin: 34.5573, latMax: 31.6875, lonMax: 34.5773 },
    batchId: 'ashkelon-afridar-2026-07-22',
  },
  'ashkelon-barnea': {   // ברנע / גני ברנע (Nominatim 31.6835,34.5805)
    key: 'ashkelon-barnea', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6735, lonMin: 34.5705, latMax: 31.6935, lonMax: 34.5905 }],
    bbox: { latMin: 31.6735, lonMin: 34.5705, latMax: 31.6935, lonMax: 34.5905 },
    batchId: 'ashkelon-barnea-2026-07-22',
  },
  'ashkelon-neve-yam': { // נווה ים (south, by Tel Ashkelon / שביל החומה, ~31.650,34.533)
    key: 'ashkelon-neve-yam', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.640, lonMin: 34.525, latMax: 31.660, lonMax: 34.543 }],
    bbox: { latMin: 31.640, lonMin: 34.525, latMax: 31.660, lonMax: 34.543 },
    batchId: 'ashkelon-neve-yam-2026-07-22',
  },
  'ashkelon-national-park': { // גן לאומי אשקלון (real protected_area bbox)
    key: 'ashkelon-national-park', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6438, lonMin: 34.5335, latMax: 31.6718, lonMax: 34.5568 }],
    bbox: { latMin: 31.6438, lonMin: 34.5335, latMax: 31.6718, lonMax: 34.5568 },
    batchId: 'ashkelon-national-park-2026-07-22',
  },
  'ashkelon-sderot-yerushalayim': { // שדרות ירושלים (north segment, עיר ימים ~31.702,34.581)
    key: 'ashkelon-sderot-yerushalayim', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6924, lonMin: 34.5710, latMax: 31.7080, lonMax: 34.5910 }],
    bbox: { latMin: 31.6924, lonMin: 34.5710, latMax: 31.7080, lonMax: 34.5910 },
    batchId: 'ashkelon-sderot-yerushalayim-2026-07-22',
  },
  'ashkelon-park': {     // פארק אשקלון — ⚠ ambiguous in OSM; boxed on central הסיטי area
    key: 'ashkelon-park', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6666, lonMin: 34.5470, latMax: 31.6866, lonMax: 34.5640 }],
    bbox: { latMin: 31.6666, lonMin: 34.5470, latMax: 31.6866, lonMax: 34.5640 },
    batchId: 'ashkelon-park-2026-07-22',
  },

  // Dedicated batch for the Mapbox foot round-trip loops (run with --roundtrips --skip-osm).
  // bbox = whole city (for park-anchor filtering + DEM + blocking polygons). Anchors below +
  // every `parks` gym inside the city bbox, each × 3/5/10 km.
  'ashkelon-roundtrips': {
    key: 'ashkelon-roundtrips', label: 'אשקלון',
    bbox: { latMin: 31.619, lonMin: 34.492, latMax: 31.719, lonMax: 34.615 },
    roundTripAnchors: [
      { key: 'marina', label: 'מרינה אשקלון', lat: 31.6826, lng: 34.5559 },
      { key: 'promenade', label: 'טיילת אשקלון', lat: 31.6670, lng: 34.5490 },
      { key: 'national-park', label: 'גן לאומי אשקלון', lat: 31.6577, lng: 34.5444 },
    ],
    batchId: 'ashkelon-roundtrip-2026-07-22',
  },

  // חיפה — full municipal boundary (rel/1387888, wikidata Q41621, admin_level 8).
  // Discovery scope is bbox-only (areaWikidata deliberately NOT set — see
  // boundaryClipWikidata's doc comment on the Region interface: using the admin
  // area as discovery scope collapses marked-trail relation matching). bbox
  // matches scripts/map-city.ts's CITY_CONFIGS.haifa exactly (estimated ±0.06°
  // around the authority's center — no existing route/segment geometry to derive
  // a tighter one from as of 19.08.2026). boundaryClipWikidata drives the
  // post-discovery clip only, dropping real-but-out-of-bounds candidates (e.g.
  // שוויצריה הקטנה / Little Switzerland, ~2km outside the real boundary).
  haifa: {
    key: 'haifa',
    label: 'חיפה',
    extraBboxes: [{ latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 }],
    bbox: { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 },
    boundaryClipWikidata: 'Q41621',
    batchId: 'haifa-geodiscovery-2026-08-19',
  },
};

const REGION = REGIONS[regionArg];
if (!REGION) { console.error(`Unknown region "${regionArg}". Known: ${Object.keys(REGIONS).join(', ')}`); process.exit(1); }

// Length windows (meters) per source.
const LEN_TRAIL_MIN = 400, LEN_TRAIL_MAX = 25000;
const LEN_LOOP_MIN = 400, LEN_LOOP_MAX = 15000;
const LEN_SEG_MIN = 500, LEN_SEG_MAX = 12000;
// Named non-loop segments/promenades (post-stitching) get a much lower floor
// than the general LEN_SEG_MIN — filters true noise (a several-meter OSM
// stub) without dropping a real, short, famous promenade (e.g. a ~288m
// named promenade that LEN_SEG_MIN would otherwise silently drop). Deliberately
// NOT applied to loop-kind candidates (see LEN_LOOP_MIN) — a loop is a
// different length regime by nature. Starting number, flagged for review —
// not derived from data (Stage 7 plan, item C).
const LEN_SEG_MIN_NAMED = 50;
const LOOP_CLOSE_M = 60; // start↔end within this ⇒ a loop
// Stitching gap tolerances (meters) — also starting numbers, flagged for
// review (Stage 7 plan, item B). Same-name merges are lower-risk (both
// fragments already share a real name) than cross-name geometric-continuity
// merges (higher false-positive risk — a wrong-direction street crossing
// could chain two unrelated nearby paths), hence the tighter cross-name gap.
const SAME_NAME_GAP_M = 100;
const CROSS_NAME_GAP_M = 35;

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
// OSM `name` tags on different fragments of the SAME real promenade sometimes
// disagree only in whitespace — found live in this exact run: two of three
// Kiryat Eliezer promenade fragments use U+00A0 (non-breaking space) between
// words, the third uses a plain space, so exact-string matching silently
// treated them as different names and only 2/3 fragments stitched together.
// Collapse any whitespace run (including nbsp) to a single plain space before
// using a name as a same-name-stitching grouping key or promenade-name lookup
// — the DISPLAYED name benefits from this too (an invisible nbsp reads
// identically to a space either way).
const normalizeName = (name: string): string => name.replace(/[\s ]+/g, ' ').trim();

// ─────────────────────────────── Overpass ───────────────────────────────
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
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
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => { const req = https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }); req.on('error', rej); req.setTimeout(30000, () => req.destroy(new Error('socket timeout'))); });
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
  externalId: string; osmName: string | null; kind: 'trail' | 'loop' | 'segment' | 'park';
  pts: number[][]; lengthM: number; isLoop: boolean; surface: 'road' | 'trail'; highway?: string; relRef?: string;
  sourceName?: string; // overrides source.name (round-trips → 'Mapbox Round-Trip (foot)'); OSM → default
  // Individual OSM way refs ("way/<id>") merged into this candidate by the
  // same-name/geometric-continuity stitching passes, or by the relation-
  // rejection rescue path — undefined for a plain single-way/single-relation
  // candidate (no behavior change there). See buildValidatedDoc's
  // RouteFieldsSchema.sourceWayIds and route.types.ts's Route['source'].
  sourceWayIds?: string[];
  // Raw OSM surface=* tag, when available — only the standalone/loop/segment
  // branch below has direct way-tag access; trail-relation-derived and
  // Mapbox-round-trip candidates have none (undefined, never guessed).
  // Mapped to the granular SurfaceType in buildRouteDoc via mapOsmSurfaceToType.
  osmSurface?: string;
  // Broad bicycle-infrastructure detection (19.08.2026, standard for every region,
  // not a fallback): set when highway=cycleway (dedicated way), bicycle=designated|
  // yes on a footway/path (shared/permitted-cycling path), segregated=yes (shared
  // foot/bike path), OR the way was fetched via the dedicated road-bike-lane query
  // (cycleway=lane|track|opposite_lane|opposite_track / cycleway:left|right=* — a
  // lane painted onto an ordinary street). Length/name floor deliberately left
  // as-is for these candidates (same 500-12000m + named-only bar as every other
  // segment) — real dedicated cycleway fragments that are unnamed or individually
  // short (a common OSM way-splitting pattern) are correctly NOT surfaced by this
  // floor; confirmed via direct Overpass query against Haifa's real Bat Galim /
  // Hulda Gurevich promenade cycleway. Deferred, not silently dropped — see the
  // Haifa runbook's Part A for the concrete example.
  isBicycle?: boolean;
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

// Same greedy nearest-endpoint chaining as stitch() above, but also tracks
// which input item(s) contributed to each output line — needed for the
// promenade-stitching passes' `sourceWayIds` provenance and for the
// relation-rejection rescue's per-line (not per-relation) way lookup.
// stitch() itself is left untouched — still used unmodified for trail-
// relation members and the admin-boundary ring — so this is purely additive.
function stitchWithIds<T>(items: Array<{ pts: number[][]; id: T }>, gapM: number): Array<{ pts: number[][]; ids: T[] }> {
  const segs = items.filter(it => it.pts.length >= 2);
  if (!segs.length) return [];
  const used = new Array(segs.length).fill(false);
  const out: Array<{ pts: number[][]; ids: T[] }> = [];
  let curIdx = 0;
  while (used.some(u => !u)) {
    let start = used.findIndex(u => !u); used[start] = true;
    let line = segs[start].pts.slice();
    let ids: T[] = [segs[start].id];
    let extended = true;
    while (extended) {
      extended = false;
      const tail = line[line.length - 1], head = line[0];
      let best = -1, bestD = gapM, bestRev = false, atTail = true;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const s = segs[i].pts, a = s[0], b = s[s.length - 1];
        const dTA = hav(tail, a), dTB = hav(tail, b), dHA = hav(head, a), dHB = hav(head, b);
        const m = Math.min(dTA, dTB, dHA, dHB);
        if (m < bestD) { bestD = m; best = i; if (m === dTA) { atTail = true; bestRev = false; } else if (m === dTB) { atTail = true; bestRev = true; } else if (m === dHA) { atTail = false; bestRev = true; } else { atTail = false; bestRev = false; } }
      }
      if (best >= 0) {
        used[best] = true;
        const s = bestRev ? segs[best].pts.slice().reverse() : segs[best].pts.slice();
        if (atTail) { line = line.concat(s); ids.push(segs[best].id); } else { line = s.concat(line); ids = [segs[best].id, ...ids]; }
        extended = true;
      }
    }
    out.push({ pts: line, ids });
    curIdx++;
    if (curIdx > 5000) break;
  }
  return out;
}

async function discover(): Promise<{ candidates: Candidate[]; blockPolys: { poly: number[][]; label: string }[]; stats: any }> {
  const { decl, scopes } = regionSelectors();
  const stats: any = { relations: 0, relLines: 0, relRescued: 0, ways: 0, loops: 0, segments: 0, stitchedSameName: 0, stitchedCrossName: 0, parks: 0 };

  type RawWay = { id: number; name: string; pts: number[][]; highway: string; osmSurface?: string; isBicycle: boolean };
  // Named member ways rescued from a trail-relation line that exceeded
  // LEN_TRAIL_MAX (item D) — fed into the SAME same-name/geometric-continuity
  // stitching pipeline as standalone ways below, so a rescue doesn't just
  // re-fragment the relation into disconnected named stubs.
  const rescuedRawWays: RawWay[] = [];

  // 1) marked route relations (hiking/foot/walking) intersecting the region → clip members.
  console.log('discovering marked trails (route relations) …');
  const relParts = scopes.map(sc => `rel["route"~"^(hiking|foot|walking|running)$"]${sc};`).join('');
  const relData = await overpass(`[out:json][timeout:180];${decl}(${relParts})->.r;.r out tags;(.r;>;);out geom;`);
  const relTags = new Map<number, any>();
  const relMembersByRel = new Map<number, Array<{ id: number; pts: number[][] }>>();
  // Overpass returns the relation (with members list) + member ways (with geometry + tags).
  const wayById = new Map<number, number[][]>();
  const wayTagsById = new Map<number, any>(); // needed for item D's rescue (named member-way lookup)
  for (const e of relData.elements) { if (e.type === 'way' && e.geometry) { wayById.set(e.id, wayGeom(e)); wayTagsById.set(e.id, e.tags || {}); } }
  for (const e of relData.elements) {
    if (e.type !== 'relation') continue;
    relTags.set(e.id, e.tags || {});
    const memberWays: Array<{ id: number; pts: number[][] }> = [];
    for (const m of e.members || []) if (m.type === 'way' && wayById.has(m.ref)) {
      const g = wayById.get(m.ref)!;
      // clip: keep member ways that actually touch the region (any point in overall bbox)
      if (g.some(p => inBbox(p, REGION.bbox))) memberWays.push({ id: m.ref, pts: g });
    }
    if (memberWays.length) relMembersByRel.set(e.id, memberWays);
  }
  stats.relations = relMembersByRel.size;

  const candidates: Candidate[] = [];
  const seenWayIds = new Set<number>(); // way ids consumed by a trail relation → don't re-emit as standalone
  for (const [relId, memberWays] of Array.from(relMembersByRel)) {
    for (const m of (relData.elements.find((e: any) => e.type === 'relation' && e.id === relId)?.members || [])) if (m.type === 'way') seenWayIds.add(m.ref);
    const tags = relTags.get(relId) || {};
    const lines = stitchWithIds(memberWays, 80); // same default gapM as the original stitch()
    let part = 0;
    for (const line of lines) {
      const L = pathLen(line.pts);
      if (L > LEN_TRAIL_MAX) {
        // item D: rescue individually-named member ways FROM THIS REJECTED LINE
        // ONLY (not the whole relation — a sibling line from the same relation
        // may already be kept, and rescuing its ways too would duplicate them).
        for (const wid of line.ids) {
          const mt = wayTagsById.get(wid) || {};
          if (mt.name) rescuedRawWays.push({ id: wid, name: normalizeName(mt.name), pts: wayById.get(wid)!, highway: mt.highway, osmSurface: mt.surface, isBicycle: false });
        }
        stats.relRescued++;
        continue;
      }
      if (L < LEN_TRAIL_MIN) continue;
      const isLoop = hav(line.pts[0], line.pts[line.pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
      candidates.push({ externalId: `osm:rel/${relId}${lines.length > 1 ? `#${part}` : ''}`, osmName: tags.name || null, kind: 'trail', pts: line.pts, lengthM: Math.round(L), isLoop, surface: 'trail', relRef: `rel/${relId}` });
      part++; stats.relLines++;
    }
  }

  // 2) standalone NAMED footway/path/track/pedestrian/cycleway ways (the
  // proven-safe vocabulary, unchanged) PLUS — "street-based promenades stay
  // continuous", item B, NARROWLY scoped — named living_street/residential/
  // service/tertiary/unclassified ways, but ONLY when a way's name EXACTLY
  // MATCHES the name of an already-real pedestrian-tagged way found in the
  // SAME fetch. A first implementation admitted ANY named street-type way
  // unconditionally and was caught live in this exact dry-run: combined with
  // item C's low named-segment floor, it flooded Haifa with ~640 ordinary
  // named residential streets (e.g. a bare 51m "סלים ג'ובראן" block) — real
  // named streets, but not promenades, and not what this stage exists to
  // surface. The fix: a street-type way only ever joins as a same-named
  // CONTINUATION of a genuine footway/path/pedestrian/track/cycleway
  // promenade (e.g. a promenade that briefly changes OSM highway tag at one
  // intersection) — never as an independently-viable candidate on its own,
  // which is what let ordinary streets in before. Every standalone candidate
  // (loop or not) must be named — item F: no anonymous filler loops, so
  // unnamed ways are filtered out at collection time, before stitching runs.
  console.log('discovering standalone paths / loops (footway|path|track|pedestrian|cycleway) + same-named street continuations …');
  const wayParts = scopes.map(sc =>
    `way["highway"~"^(footway|path|track|pedestrian|cycleway)$"]["highway"!~"steps"]${sc};` +
    `way["highway"~"^(living_street|residential|service|tertiary|unclassified)$"]["name"]${sc};`
  ).join('');
  const wayData = await overpass(`[out:json][timeout:180];${decl}(${wayParts})->.w;.w out geom tags;`);
  stats.ways = wayData.elements.filter((e: any) => e.type === 'way').length;
  const PRIMARY_HIGHWAY_RE = /^(footway|path|track|pedestrian|cycleway)$/;
  const primaryRawWays: RawWay[] = [];
  const streetTypeRawWays: RawWay[] = [];
  const seenStandaloneWayIds = new Set<number>(); // item B: avoid double-discovery vs the bike-lane query below
  for (const e of wayData.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    if (seenWayIds.has(e.id)) continue; // already covered by a trail relation
    const t = e.tags || {};
    if (!t.name) continue;                                    // item F: named-only, unconditionally
    if (t.conveying && t.conveying !== 'no') continue;         // escalator / moving walkway
    // Canonical stairs model (Stage 0, route-enrichment-pipeline plan): stairs
    // are never route candidates. OSM-derived stairs live exclusively in
    // climb_segments (type:'stairs', scripts/write-climb-segments-tlv.ts).
    if (t.highway === 'steps') continue;                      // stairs are not routes
    if (t.access === 'private' || t.foot === 'no' || t.foot === 'private') continue;
    if (t.indoor === 'yes' || t.tunnel === 'building_passage') continue;
    const isBicycle = t.highway === 'cycleway' || t.bicycle === 'designated' || t.bicycle === 'yes' || t.segregated === 'yes';
    const raw: RawWay = { id: e.id, name: normalizeName(t.name), pts: wayGeom(e), highway: t.highway, osmSurface: t.surface, isBicycle };
    (PRIMARY_HIGHWAY_RE.test(t.highway) ? primaryRawWays : streetTypeRawWays).push(raw);
    seenStandaloneWayIds.add(e.id);
  }
  const promenadeNames = new Set(primaryRawWays.map(w => w.name));
  const rawWays: RawWay[] = [...primaryRawWays, ...streetTypeRawWays.filter(w => promenadeNames.has(w.name))];
  // item D: rescued relation-member ways join the same stitching pipeline.
  // Deduplicate by way id — a way can be a member of MULTIPLE overlapping
  // trail relations (a real, common OSM pattern for Haifa's wadi network,
  // where one physical path segment is shared by several regional hiking
  // routes); if two or more of those relations each get rejected for
  // LEN_TRAIL_MAX, the SAME way was rescued once per rejecting relation.
  // Caught live in this exact dry-run: without this dedup, a doubly-rescued
  // way got stitched into its own candidate twice, geometrically doubling
  // back over itself (e.g. "osm:stitched/35014061+35014061+1470987339" — a
  // real way id appearing twice) — a genuine geometry bug, not cosmetic.
  const rawWayIdsSoFar = new Set(rawWays.map(w => w.id));
  for (const w of rescuedRawWays) { if (rawWayIdsSoFar.has(w.id)) continue; rawWayIdsSoFar.add(w.id); rawWays.push(w); }

  // Pass 1 — same-name stitching (item B): every raw way sharing an exact
  // `name` tag is greedily chained into one or more continuous lines. A name
  // with only one way is a trivial pass-through (no merge needed).
  const byName = new Map<string, RawWay[]>();
  for (const w of rawWays) { const arr = byName.get(w.name) || []; arr.push(w); byName.set(w.name, arr); }
  type StitchedGroup = { name: string; ids: number[]; pts: number[][]; highway: string; osmSurface?: string; isBicycle: boolean };
  const pass1: StitchedGroup[] = [];
  for (const [name, ways] of Array.from(byName)) {
    const lines = stitchWithIds(ways.map(w => ({ pts: w.pts, id: w.id })), SAME_NAME_GAP_M);
    for (const line of lines) {
      if (line.ids.length > 1) stats.stitchedSameName++;
      const rep = ways.find(w => w.id === line.ids[0])!;
      pass1.push({ name, ids: line.ids, pts: line.pts, highway: rep.highway, osmSurface: rep.osmSurface, isBicycle: line.ids.every(id => ways.find(w => w.id === id)!.isBicycle) });
    }
  }

  // Pass 2 — geometric-continuity stitching, ACROSS different names (item B):
  // pass 1's results are chained again purely by endpoint proximity, at a
  // tighter gap tolerance, only within a compatible tag family (a footway
  // never silently absorbs an unrelated cycleway). Canonical name of a
  // cross-name merge = the LONGEST constituent segment's real name.
  function tagFamily(highway: string, isBicycle: boolean): string {
    if (isBicycle) return 'bicycle';
    if (highway === 'footway' || highway === 'path' || highway === 'pedestrian') return 'foot';
    if (highway === 'track') return 'track';
    return 'street'; // living_street/residential/service/tertiary/unclassified
  }
  const families = new Map<string, StitchedGroup[]>();
  for (const g of pass1) { const f = tagFamily(g.highway, g.isBicycle); const arr = families.get(f) || []; arr.push(g); families.set(f, arr); }
  const pass2: StitchedGroup[] = [];
  for (const [, groups] of Array.from(families)) {
    const lines = stitchWithIds(groups.map(g => ({ pts: g.pts, id: g })), CROSS_NAME_GAP_M);
    for (const line of lines) {
      if (line.ids.length === 1) { pass2.push(line.ids[0]); continue; }
      stats.stitchedCrossName++;
      const longest = line.ids.reduce((a, b) => pathLen(b.pts) > pathLen(a.pts) ? b : a);
      pass2.push({ name: longest.name, ids: line.ids.flatMap(g => g.ids), pts: line.pts, highway: longest.highway, osmSurface: longest.osmSurface, isBicycle: line.ids.every(g => g.isBicycle) });
    }
  }

  // Final classification of the (possibly stitched) named candidates: loop vs
  // segment, computed AFTER stitching (a promenade merged from several
  // fragments might now close back on itself) — item C's length floor split.
  for (const g of pass2) {
    const L = pathLen(g.pts);
    const isLoopG = hav(g.pts[0], g.pts[g.pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
    const surface: 'road' | 'trail' = (g.highway === 'pedestrian' || g.osmSurface === 'paved' || g.osmSurface === 'asphalt') ? 'road' : 'trail';
    if (isLoopG) {
      if (L < LEN_LOOP_MIN || L > LEN_LOOP_MAX) continue; // loops keep the unchanged floor regardless of naming
    } else {
      if (L < LEN_SEG_MIN_NAMED || L > LEN_SEG_MAX) continue; // item C: named non-loop gets the low floor
    }
    const stitched = g.ids.length > 1;
    const externalId = stitched ? `osm:stitched/${[...g.ids].sort((a, b) => a - b).join('+')}` : `osm:way/${g.ids[0]}`;
    candidates.push({
      externalId, osmName: g.name, kind: isLoopG ? 'loop' : 'segment',
      pts: g.pts, lengthM: Math.round(L), isLoop: isLoopG, surface,
      highway: g.highway, osmSurface: g.osmSurface, isBicycle: g.isBicycle,
      ...(stitched ? { sourceWayIds: g.ids.map(id => `way/${id}`) } : {}),
    });
    if (isLoopG) stats.loops++; else stats.segments++;
  }

  // 2b) road bike lanes: cycleway=lane|track|opposite_lane|opposite_track, or
  // cycleway:left/right=* (a lane painted onto an ordinary street, not a
  // dedicated way) — a separate highway-type universe (residential/primary/
  // secondary/etc.) not covered by the footway|path|track|pedestrian|cycleway
  // fetch above, so this is its own dedicated Overpass query.
  console.log('discovering road bike lanes (cycleway=lane|track|opposite_lane|opposite_track or cycleway:left/right) …');
  const bikeLaneParts = scopes.map(sc => `way["cycleway"~"^(lane|track|opposite_lane|opposite_track)$"]${sc};way["cycleway:left"]${sc};way["cycleway:right"]${sc};`).join('');
  const bikeLaneData = await overpass(`[out:json][timeout:180];${decl}(${bikeLaneParts})->.bl;.bl out geom tags;`);
  stats.bikeLaneWays = bikeLaneData.elements.filter((e: any) => e.type === 'way').length;
  for (const e of bikeLaneData.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    if (seenWayIds.has(e.id)) continue;
    if (seenStandaloneWayIds.has(e.id)) continue; // item B: already discovered via the broadened standalone-way query
    const t = e.tags || {};
    if (!t.name) continue; // same named-only bar as standalone segments — street name counts as a name
    const pts = wayGeom(e);
    const L = pathLen(pts);
    if (L < LEN_SEG_MIN || L > LEN_SEG_MAX) continue;
    const isLoop = hav(pts[0], pts[pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
    candidates.push({ externalId: `osm:way/${e.id}`, osmName: t.name, kind: isLoop ? 'loop' : 'segment', pts, lengthM: Math.round(L), isLoop, surface: 'road', highway: t.highway, osmSurface: t.surface, isBicycle: true });
    stats.bikeLaneSegments = (stats.bikeLaneSegments || 0) + 1;
  }

  // 3) NEW — named park/garden-anchored perimeter loops (item A). See
  // discoverParkLoops()'s own header comment for why this traces the park's
  // real OSM boundary ring rather than reusing the live app's generator or a
  // synthetic circle.
  const parkCandidates = await discoverParkLoops(decl, scopes);
  candidates.push(...parkCandidates);
  stats.parks = parkCandidates.length;

  // 4) blocking polygons (water + buildings) for artifact filtering.
  const blockPolys = await fetchBlockPolys(REGION.bbox);
  return { candidates, blockPolys, stats };
}

// ─────────────────── park/garden-anchored loops (item A, new) ───────────────────
// Fetches every NAMED leisure=park/garden polygon (way or relation) inside the
// region and emits ONE perimeter-loop Candidate per park: the ring's own
// OSM-mapped boundary vertices, used directly as route geometry — never a
// synthetic circle. Checked and confirmed infeasible/inapplicable to reuse the
// live app's own loop generator (route-generator.service.ts's generateLoopRoutes):
// it can't be imported into a Node/Admin-SDK script (hard Firebase-CLIENT-SDK
// dependency for its waypoint fetch + a 'use client' DEM-tile loader), and even
// if it could be, it has zero polygon/perimeter awareness — like buildLoop()
// below, it's fundamentally "synthetic anchor + Mapbox Directions," never a
// real boundary trace. Structural template mirrors fetchAdminBoundaryPoly
// (below) — same query shape, same stitch()-for-ring-assembly, same
// role!=='inner' outer-only member filtering (single-outer-ring only, no true
// multipolygon/hole support — a known, carried-forward simplification, same as
// fetchAdminBoundaryPoly's own).
async function discoverParkLoops(decl: string, scopes: string[]): Promise<Candidate[]> {
  console.log('discovering named parks/gardens (leisure=park|garden) for perimeter loops …');
  const parts = scopes.map(sc => `way["leisure"~"^(park|garden)$"]["name"]${sc};relation["leisure"~"^(park|garden)$"]["name"]${sc};`).join('');
  const data = await overpass(`[out:json][timeout:180];${decl}(${parts})->.p;.p out tags;(.p;>;);out geom;`);
  const wayById = new Map<number, number[][]>();
  for (const e of data.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e));
  const candidates: Candidate[] = [];
  const seenRefs = new Set<string>();
  for (const e of data.elements) {
    if (e.type === 'way') {
      const t = e.tags || {};
      if (!t.name || !e.geometry || e.geometry.length < 3) continue;
      const ref = `way/${e.id}`;
      if (seenRefs.has(ref)) continue; seenRefs.add(ref);
      const cand = buildParkLoopCandidate(ref, t.name, wayGeom(e));
      if (cand) candidates.push(cand);
    } else if (e.type === 'relation') {
      const t = e.tags || {};
      if (!t.name) continue;
      const outerWays: number[][][] = [];
      for (const m of e.members || []) if (m.type === 'way' && m.role !== 'inner' && wayById.has(m.ref)) outerWays.push(wayById.get(m.ref)!);
      if (!outerWays.length) continue;
      const rings = stitch(outerWays, 80);
      if (!rings.length) continue;
      const ring = rings.reduce((a, b) => b.length > a.length ? b : a);
      const ref = `rel/${e.id}`;
      if (seenRefs.has(ref)) continue; seenRefs.add(ref);
      const cand = buildParkLoopCandidate(ref, t.name, ring);
      if (cand) candidates.push(cand);
    }
  }
  return candidates;
}

function buildParkLoopCandidate(ref: string, name: string, ring: number[][]): Candidate | null {
  if (ring.length < 3) return null;
  // A park polygon must be a real closed ring to be treated as a walkable
  // loop — today's admin-boundary fetcher never needed this check (an admin
  // boundary is always closed by definition), but a park `way` result could
  // in principle come back open if OSM tagging/geometry is incomplete.
  if (hav(ring[0], ring[ring.length - 1]) >= LOOP_CLOSE_M) return null;
  const L = pathLen(ring);
  if (L < LEN_LOOP_MIN || L > LEN_LOOP_MAX) return null;
  return {
    externalId: `osm:${ref}`,
    osmName: name,
    kind: 'park',
    pts: ring,
    lengthM: Math.round(L),
    isLoop: true,
    surface: 'trail',
    ...(ref.startsWith('rel/') ? { relRef: ref } : {}),
  };
}

// Blocking polygons (water + buildings) consumed by artifactReason. Extracted from discover()
// so the round-trip source can reuse the SAME artifact filter when --skip-osm bypasses discovery.
async function fetchBlockPolys(b: Region['bbox']): Promise<{ poly: number[][]; label: string }[]> {
  console.log('fetching blocking polygons (water + buildings) for artifact filter …');
  const bb = `${b.latMin - 0.003},${b.lonMin - 0.003},${b.latMax + 0.003},${b.lonMax + 0.003}`;
  const blockData = await overpass(`[out:json][timeout:120];(way["natural"="water"](${bb});way["building"](${bb});way["leisure"~"^(swimming_pool|water_park)$"](${bb});relation["natural"="water"](${bb}););out geom;`);
  const blockPolys: { poly: number[][]; label: string }[] = [];
  for (const e of blockData.elements) {
    const label = e.tags?.name || e.tags?.natural || (e.tags?.building ? 'building' : e.tags?.leisure) || 'block';
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) blockPolys.push({ poly: wayGeom(e), label });
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.geometry && m.geometry.length >= 3) blockPolys.push({ poly: m.geometry.map((p: any) => [p.lat, p.lon]), label });
  }
  return blockPolys;
}

// A candidate is an artifact if a meaningful fraction of its vertices sit inside a
// blocking polygon (over water / inside a building). One stray point is tolerated
// (OSM ways can graze a building corner); >20% inside ⇒ reject.
function artifactReason(pts: number[][], blockPolys: { poly: number[][]; label: string }[]): string | null {
  let inside = 0; let label = '';
  for (const p of pts) { const b = blockPolys.find(bp => inPoly(p, bp.poly)); if (b) { inside++; label = b.label; } }
  return inside / pts.length > 0.2 ? `over ${label} (${inside}/${pts.length} pts)` : null;
}

// ─────────────────── municipal-boundary clip (standing capability) ───────────────────
// Fetches the real admin boundary polygon for a region's `boundaryClipWikidata` (when
// set), used ONLY as a post-discovery clipping filter — see the Region interface's
// doc comment for why this is deliberately never used as discovery scope. Any region
// may opt in by supplying the field; a region without it gets no boundary clip
// (outsideBoundaryReason fails open below), matching every region's behavior before
// this capability existed.
async function fetchAdminBoundaryPoly(wikidataId: string): Promise<number[][] | null> {
  const q = `[out:json][timeout:120];rel["wikidata"="${wikidataId}"]["boundary"="administrative"];out geom;(._;>;);out geom;`;
  const data = await overpass(q);
  const rel = data.elements.find((e: any) => e.type === 'relation');
  if (!rel) return null;
  const wayById = new Map<number, number[][]>();
  for (const e of data.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e));
  const outerWays: number[][][] = [];
  for (const m of rel.members || []) if (m.type === 'way' && m.role !== 'inner' && wayById.has(m.ref)) outerWays.push(wayById.get(m.ref)!);
  const rings = stitch(outerWays, 200);
  if (!rings.length) return null;
  return rings.reduce((a, b) => b.length > a.length ? b : a);
}
// Mirrors artifactReason's fraction style, inverted: drop a candidate if a majority
// of its points fall OUTSIDE the real municipal boundary. Fail-open (never filters)
// when no polygon was loaded — this file's "never silently guess" discipline.
function outsideBoundaryReason(pts: number[][], boundaryPoly: number[][] | null): string | null {
  if (!boundaryPoly) return null;
  let outside = 0;
  for (const p of pts) if (!inPoly(p, boundaryPoly)) outside++;
  return outside / pts.length > 0.5 ? `outside boundary (${outside}/${pts.length} pts)` : null;
}

// ─────────────────────────────── route doc builder ───────────────────────────────
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat: number, lon: number, prec = 7) { let idx = 0, bit = 0, even = true, h = ''; const la = [-90, 90], lo = [-180, 180]; while (h.length < prec) { if (even) { const m = (lo[0] + lo[1]) / 2; if (lon >= m) { idx = idx * 2 + 1; lo[0] = m; } else { idx = idx * 2; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m) { idx = idx * 2 + 1; la[0] = m; } else { idx = idx * 2; la[1] = m; } } even = !even; if (++bit === 5) { h += B32[idx]; bit = 0; idx = 0; } } return h; }

function buildRouteDoc(c: Candidate, dem: { gainM: number; maxGrade: number } | null, authorityId: string) {
  const distance = c.lengthM; // meters (matches formatDistance + TLV pilot)
  // walking is the safe default for nature trails; paved pedestrian promenades also run well.
  // Bicycle-tagged candidates (isBicycle) get their own activityType — see Candidate.isBicycle.
  const activityTypes = c.isBicycle ? ['cycling'] : ['walking', 'running'];
  const activityType = c.isBicycle ? 'cycling' : (c.surface === 'road' ? 'running' : 'walking');
  const kindHe = c.isLoop ? 'לולאה' : c.kind === 'trail' ? 'שביל מסומן' : 'מסלול';
  // Park-anchored perimeter loops (item A) get their own naming convention —
  // "הקפת X" ("circuit of X"), distinct from the general "לולאת X" loop
  // prefix — both because it reads more naturally for "loop around a park"
  // in Hebrew, and because it's the exact naming pattern the lost TLV probe
  // used (e.g. "הקפת פארק חופי רידינג"), giving this rebuild continuity with
  // the capability it's replacing. discoverParkLoops() only ever emits
  // NAMED candidates (Overpass query requires ["name"]), so the fallback
  // here is defensive only.
  const name = c.kind === 'park'
    ? `הקפת ${c.osmName ?? REGION.label}`
    : c.osmName
      ? (c.isLoop ? `לולאת ${c.osmName}` : c.osmName)
      : `${kindHe} ${REGION.label}${c.isLoop ? ' (לולאה)' : ''}`;
  const distanceKm = distance / 1000;
  const mid = c.pts[Math.floor(c.pts.length / 2)];
  const gain = dem?.gainM ?? 0;
  // difficulty from length + climb (simple, transparent heuristic)
  // NOTE: must match Route.difficulty exactly ('easy'|'medium'|'hard') — a prior
  // version of this line used 'moderate', which isn't a valid Route.difficulty
  // value and silently broke calorie calc (NaN) + ranking (mis-scored as hardest)
  // + DifficultyBolts (mis-rendered as easiest) wherever it landed. Don't reintroduce it.
  const difficulty: 'easy' | 'medium' | 'hard' = (distanceKm > 8 || gain > 200) ? 'hard' : (distanceKm > 3.5 || gain > 80) ? 'medium' : 'easy';
  return {
    name,
    description: `${kindHe} ${c.surface === 'trail' ? 'שטח' : 'סלול'} ב${REGION.label}${c.osmName ? ` — ${c.osmName}` : ''}`,
    distance,
    // Cycling divisor/multiplier are feel-based estimates, same rigor level as the
    // walking/running constants they sit beside — flagged for calibration review.
    duration: Math.round(distance / (c.isBicycle ? 250 : activityType === 'running' ? 150 : 90)),
    score: Math.round(distanceKm * 10),
    rating: c.isLoop ? 5 : 4,
    calories: Math.round(distanceKm * (c.isBicycle ? 35 : 65)),
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
    source: { type: 'official_api', name: c.sourceName ?? 'OSM Geo-Discovery', externalId: c.externalId, ...(c.relRef ? { osmRef: c.relRef } : {}) },
    // Top-level, not nested under `source` (see RouteFieldsSchema.sourceWayIds's
    // doc comment — `source` itself isn't schema-validated as a nested object).
    ...(c.sourceWayIds ? { sourceWayIds: c.sourceWayIds } : {}),
    elevationGain: gain,
    maxGrade: dem?.maxGrade ?? 0,
    // Granular ground-material vocabulary — deliberately a NEW top-level
    // field, not a rewrite of features.surface above (that field is a
    // different, coarser concept, actively read elsewhere as 'road'/'trail'
    // — see surface-type.ts's header comment). mapOsmSurfaceToType always
    // returns a value ('unknown' when c.osmSurface is absent, e.g.
    // trail-relation-derived candidates never had a raw way tag) — never
    // undefined, so no conditional-spread needed here.
    surfaceType: mapOsmSurfaceToType(c.osmSurface),
    // routeShape retires the old isLoop boolean (Stage 1A) — c.isLoop only means
    // "geometrically closed" (start≈end); when false the candidate is a plain
    // linear trail/segment, which is neither 'loop' nor 'out_and_back', so we
    // omit the field rather than guess (Firestore admin SDK write — omit,
    // don't set undefined, matching this file's existing conditional-spread
    // convention for optional fields like osmRef above).
    ...(c.isLoop ? { routeShape: 'loop' as const } : {}),
    geohash: geohash(mid[0], mid[1]),
    city: REGION.label,
    // Stage 1B: this script never set authorityId before — resolved once per
    // run in main() (REGION.label -> authorityId via findAuthorityByCityName)
    // and threaded through here. Required by the chokepoint's CREATE-mode
    // validation (hard rule 1).
    authorityId,
    importBatchId: REGION.batchId,
    origin: 'osm_import',
    status: 'pending',
    published: false,
  };
}

// ─────────────────────────── Mapbox round-trip loops (foot) ───────────────────────────
// Synthetic loops around anchor points (named anchors + our `parks` gyms) at 3/5/10 km via the
// Mapbox Directions *walking* profile. Added to compensate for Ashkelon having no OSM route
// relations. Emits the SAME Candidate shape → flows through buildRouteDoc + the artifact filter
// + DEM enrichment unchanged. Enabled with --roundtrips (add --skip-osm for round-trips only).
type Anchor = { key: string; label: string; lat: number; lng: number };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const RT_DISTS = [3000, 5000, 10000];

// geodesic destination point (haversine forward) — places loop waypoints around an anchor.
function destPoint(lat: number, lon: number, brgDeg: number, distM: number): number[] {
  const br = brgDeg * Math.PI / 180, dr = distM / R, la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}

// Mapbox Directions, walking profile. waypts as [lat,lon]; returns the snapped foot polyline + length.
async function mapboxWalk(waypts: number[][]): Promise<{ pts: number[][]; lengthM: number } | null> {
  const coordStr = waypts.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?geometries=geojson&overview=full&access_token=${TOKEN}`;
  try {
    const j = JSON.parse((await fetchBuf(url)).toString());
    const r = j.routes?.[0];
    if (!r?.geometry?.coordinates?.length) return null;
    return { pts: r.geometry.coordinates.map((c: number[]) => [c[1], c[0]]), lengthM: Math.round(r.distance) };
  } catch { return null; }
}

// One foot loop of ~targetM around an anchor: 4 waypoints on a circle, back to the start.
// One radius-correction retry (street routing inflates length beyond the straight-line circle).
async function buildLoop(a: Anchor, targetM: number, seed: number): Promise<Candidate | null> {
  const K = 4, targetKm = Math.round(targetM / 1000);
  let radius = targetM / (2 * Math.PI) / 1.25; // first guess; corrected once below
  for (let attempt = 0; attempt < 2; attempt++) {
    const rot = (seed * 47) % 360;
    const waypts: number[][] = [[a.lat, a.lng]];
    for (let i = 0; i < K; i++) waypts.push(destPoint(a.lat, a.lng, rot + i * (360 / K), radius));
    waypts.push([a.lat, a.lng]);
    const res = await mapboxWalk(waypts);
    if (!res || res.pts.length < 2) return null;
    if (attempt === 0 && (res.lengthM < targetM * 0.7 || res.lengthM > targetM * 1.5)) { radius *= targetM / res.lengthM; continue; }
    if (res.lengthM < LEN_LOOP_MIN || res.lengthM > LEN_LOOP_MAX) return null; // same window as OSM loops
    return {
      externalId: `mapbox:roundtrip/${a.key}/${targetKm}km`,
      osmName: `${a.label} · ${targetKm} ק"מ`,
      kind: 'loop', pts: res.pts, lengthM: res.lengthM,
      isLoop: hav(res.pts[0], res.pts[res.pts.length - 1]) < LOOP_CLOSE_M,
      surface: 'road', sourceName: 'Mapbox Round-Trip (foot)',
    };
  }
  return null;
}

// Anchors = region.roundTripAnchors + every `parks` gym in the region (city == אשקלון OR coords
// inside the region bbox). Coordinates at location.lat/lng (Explore-verified). Read-only.
async function loadParkAnchors(db: admin.firestore.Firestore, region: Region): Promise<Anchor[]> {
  const snap = await db.collection('parks').get();
  const b = region.bbox; const out: Anchor[] = [];
  for (const doc of snap.docs) {
    const p: any = doc.data();
    const lat = p.location?.lat ?? p.lat, lng = p.location?.lng ?? p.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const cityMatch = typeof p.city === 'string' && /אשקלון|ashkelon/i.test(p.city);
    const inBox = lat >= b.latMin && lat <= b.latMax && lng >= b.lonMin && lng <= b.lonMax;
    if (!cityMatch && !inBox) continue;
    out.push({ key: `park-${doc.id}`, label: (p.name && String(p.name).trim()) || 'גינת כושר', lat, lng });
  }
  const CAP = 60;
  if (out.length > CAP) { console.log(`  ⚠ ${out.length} park anchors → capping to ${CAP} (rest skipped — NOT silently dropped)`); return out.slice(0, CAP); }
  return out;
}

async function discoverRoundTrips(db: admin.firestore.Firestore, region: Region): Promise<{ candidates: Candidate[]; stats: any }> {
  const stats: any = { attempted: 0, built: 0, failed: 0, closed: 0, perDist: { 3: 0, 5: 0, 10: 0 } };
  if (!TOKEN) { console.warn('  ⚠ no NEXT_PUBLIC_MAPBOX_TOKEN — round-trip source skipped'); return { candidates: [], stats }; }
  const named = region.roundTripAnchors || [];
  const parks = await loadParkAnchors(db, region);
  const anchors: Anchor[] = [...named, ...parks];
  console.log(`\nround-trip anchors: ${named.length} named + ${parks.length} park gyms = ${anchors.length}, each × [3,5,10]km (foot)`);
  const candidates: Candidate[] = [];
  let seed = 0;
  for (const a of anchors) {
    for (const d of RT_DISTS) {
      stats.attempted++;
      const c = await buildLoop(a, d, seed++);
      await sleep(120); // be polite to the Mapbox Directions API
      if (!c) { stats.failed++; continue; }
      candidates.push(c); stats.built++; stats.perDist[d / 1000]++;
      if (c.isLoop) stats.closed++;
    }
  }
  return { candidates, stats };
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

  // Stage 1B — this script never set authorityId before (confirmed absent
  // via grep during the route-enrichment-pipeline investigation). Resolve
  // it once for the whole region: REGION.label is a city NAME (not raw
  // coordinates), so the fuzzy name-matcher is the right tool, not the
  // polygon resolver. Fail fast if it doesn't resolve — every candidate in
  // this run shares the same authority, so an unresolved region means
  // nothing in this run can pass the chokepoint anyway.
  const { findAuthorityByCityName, buildValidatedDoc } = await import('../src/lib/route-collections');
  const authoritySnap = await db.collection('authorities').get();
  const authorityList = authoritySnap.docs.map(d => ({ id: d.id, name: (d.data().name as string) || '' }));
  const knownAuthorityIds = new Set(authorityList.map(a => a.id));
  const resolvedAuthorityId = findAuthorityByCityName(REGION.label, authorityList);
  if (!resolvedAuthorityId) {
    console.error(`❌ Could not resolve an authority for REGION.label="${REGION.label}" — checked against ${authorityList.length} known authorities. Aborting (no candidate in this run could pass the chokepoint without it).`);
    process.exit(1);
  }
  console.log(`resolved authority: ${REGION.label} → ${resolvedAuthorityId}`);

  console.log('loading Terrain-RGB DEM tiles …'); await loadTiles(); console.log(`  decoded ${tiles.size} tiles`);
  let boundaryPoly: number[][] | null = null;
  if (REGION.boundaryClipWikidata) {
    console.log(`fetching admin boundary polygon (wikidata=${REGION.boundaryClipWikidata}, clip-filter only — not used as discovery scope) …`);
    boundaryPoly = await fetchAdminBoundaryPoly(REGION.boundaryClipWikidata);
    console.log(boundaryPoly ? `  boundary polygon loaded: ${boundaryPoly.length} vertices` : '  ⚠ boundary polygon not found — clip filter skipped');
  }
  let candidates: Candidate[] = [];
  let blockPolys: { poly: number[][]; label: string }[] = [];
  let stats: any = {};
  if (!SKIP_OSM) {
    const d = await discover();
    candidates = d.candidates; blockPolys = d.blockPolys; stats = d.stats;
    console.log(`\ndiscovered: ${stats.relations} trail-relations → ${stats.relLines} local lines (${stats.relRescued || 0} rejected-for-length, rescued named members) · ${stats.parks || 0} named park/garden loops · ${stats.loops} loops · ${stats.segments} named segments (from ${stats.ways} ways, ${stats.stitchedSameName || 0} same-name + ${stats.stitchedCrossName || 0} cross-name stitches). road bike lanes: ${stats.bikeLaneSegments || 0} named (from ${stats.bikeLaneWays || 0} tagged ways). blocking polygons: ${blockPolys.length}`);
  } else {
    console.log('--skip-osm: skipping Overpass discovery; fetching blocking polygons only (for the round-trip artifact filter) …');
    blockPolys = await fetchBlockPolys(REGION.bbox);
  }
  if (ROUNDTRIPS) {
    const rt = await discoverRoundTrips(db, REGION);
    candidates.push(...rt.candidates);
    stats.roundtrip = rt.stats;
    console.log(`round-trips: attempted ${rt.stats.attempted}, built ${rt.stats.built} (3km:${rt.stats.perDist[3]} · 5km:${rt.stats.perDist[5]} · 10km:${rt.stats.perDist[10]}), loop-closed ${rt.stats.closed}, failed ${rt.stats.failed}. blocking polygons: ${blockPolys.length}`);
  }

  // filter artifacts + enrich + validate through the Stage 1B chokepoint.
  // Validated in the SAME code path regardless of --dry-run, so the dry-run
  // preview reflects what would actually be allowed to write, not just what
  // buildRouteDoc happened to produce. A validation failure drops just that
  // one candidate (logged, not silent) rather than aborting the whole run —
  // in practice none should fail, since authorityId is resolved above and
  // difficulty was fixed in Stage 0, but this is the safety net for
  // anything this investigation missed.
  const kept: { doc: ReturnType<typeof buildRouteDoc>; c: Candidate }[] = [];
  const dropped: { name: string; reason: string }[] = [];
  const boundaryDropped: { name: string; reason: string }[] = [];
  for (const c of candidates) {
    const reason = artifactReason(c.pts, blockPolys);
    if (reason) { dropped.push({ name: c.osmName || c.externalId, reason }); continue; }
    const boundaryReason = outsideBoundaryReason(c.pts, boundaryPoly);
    if (boundaryReason) { boundaryDropped.push({ name: c.osmName || c.externalId, reason: boundaryReason }); continue; }
    const dem = demProfile(c.pts);
    const doc = buildRouteDoc(c, dem, resolvedAuthorityId);
    try {
      const validatedDoc = buildValidatedDoc('official_routes', doc, { mode: 'create', knownAuthorityIds }) as typeof doc;
      kept.push({ doc: validatedDoc, c });
    } catch (e: any) {
      dropped.push({ name: c.osmName || c.externalId, reason: `chokepoint: ${e.message}` });
    }
  }

  // Prefer loops: loops first, then by (climb-weighted) length descending.
  kept.sort((a, b) => (Number(b.c.isLoop) - Number(a.c.isLoop)) || (b.doc.distance * (1 + (b.doc.elevationGain || 0) / 100) - a.doc.distance * (1 + (a.doc.elevationGain || 0) / 100)));

  const nParks = kept.filter(k => k.c.kind === 'park').length;
  const nLoops = kept.filter(k => k.c.isLoop && !k.c.isBicycle && k.c.kind !== 'park').length;
  const nTrails = kept.filter(k => k.c.kind === 'trail' && !k.c.isBicycle).length;
  const nSegments = kept.filter(k => k.c.kind === 'segment' && !k.c.isLoop && !k.c.isBicycle).length;
  const nCycling = kept.filter(k => k.c.isBicycle).length;
  const nStitched = kept.filter(k => (k.c.sourceWayIds?.length ?? 0) > 0).length;
  console.log(`\nAFTER FILTER: ${kept.length} routes kept (${nParks} park loops, ${nLoops} loops, ${nTrails} marked-trail lines), ${dropped.length} artifacts dropped, ${boundaryDropped.length} dropped as outside the boundary.`);
  console.log(`  by type: ${nTrails} trail · ${nParks} park · ${nLoops} loop · ${nSegments} named segment · ${nCycling} cycling  (${nStitched} of these are stitched from >1 OSM way)`);
  if (dropped.length) dropped.slice(0, 10).forEach(d => console.log(`   ✗ artifact: ${d.name} — ${d.reason}`));
  if (boundaryDropped.length) boundaryDropped.slice(0, 15).forEach(d => console.log(`   ✗ outside boundary: ${d.name} — ${d.reason}`));

  console.log('\n── candidates (loops first) ──');
  for (const k of kept) {
    const d = k.doc;
    const icon = k.c.kind === 'park' ? '🌳' : k.c.isBicycle ? '🚲' : k.c.isLoop ? '🔁' : k.c.kind === 'trail' ? '🥾' : '·';
    const stitchNote = (k.c.sourceWayIds?.length ?? 0) > 0 ? ` (stitched from ${k.c.sourceWayIds!.length} ways)` : '';
    console.log(`  ${icon} ${String(d.distance).padStart(5)}m  gain ${String(d.elevationGain).padStart(4)}m  ${d.difficulty.padEnd(8)} ${d.activityType.padEnd(8)} ${d.name}  [${k.c.externalId}]${stitchNote}`);
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
