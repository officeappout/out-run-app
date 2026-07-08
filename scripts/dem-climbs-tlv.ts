/**
 * scripts/dem-climbs-tlv.ts  — PILOT, read-only (no DB writes)
 *
 * Builds a topography-based CLIMB layer for Tel Aviv:
 *  1. Pulls Mapbox Terrain-RGB tiles (terrain model = bare-earth-ish, NOT a DSM
 *     with building roofs) for a TLV bbox, decodes them (hand-rolled PNG decoder
 *     via zlib — no image libs on this machine).
 *  2. Pulls OSM foot ways in the bbox, samples elevation along each, computes
 *     grade, and detects CLIMB SEGMENTS (sustained grade over sustained length)
 *     with length + grade% + bearing.
 *  3. Feasibility probe: reports the climb near גשר המכביה (32.102, 34.823).
 *  4. Writes an SVG slope heat-map to .claude/previews/tlv-climbs.svg.
 *
 * Nothing is written to Firestore.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import * as zlib from 'zlib';
import * as https from 'https';
import * as fs from 'fs';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
if (!TOKEN) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN missing');

// bbox covering coast promenade + Yarkon (Maccabiah bridge) + central parks
const BBOX = { latMin: 32.050, latMax: 32.118, lonMin: 34.740, lonMax: 34.828 };
const Z = 14;
const MACCABIAH = { lat: 32.101993, lon: 34.8232596, name: 'גשר המכביה ה-15' };

// ---------- tile math ----------
const n = 2 ** Z;
const lon2gx = (lon: number) => (lon + 180) / 360 * 256 * n;
const lat2gy = (lat: number) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n;
};

// ---------- minimal PNG decoder (RGB/RGBA, 8-bit, no interlace) ----------
function decodePNG(buf: Buffer) {
  let p = 8, width = 0, height = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const rv = raw[pos++];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v = rv;
      if (ft === 1) v = rv + a;
      else if (ft === 2) v = rv + b;
      else if (ft === 3) v = rv + ((a + b) >> 1);
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, ch, data: out };
}

function fetchBuf(url: string): Promise<Buffer> {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
      const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b)));
    }).on('error', rej);
  });
}

const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() {
  const txMin = Math.floor(lon2gx(BBOX.lonMin) / 256), txMax = Math.floor(lon2gx(BBOX.lonMax) / 256);
  const tyMin = Math.floor(lat2gy(BBOX.latMax) / 256), tyMax = Math.floor(lat2gy(BBOX.latMin) / 256);
  const count = (txMax - txMin + 1) * (tyMax - tyMin + 1);
  console.log(`Terrain-RGB tiles z${Z}: x[${txMin}..${txMax}] y[${tyMin}..${tyMax}] = ${count} tiles`);
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) {
    const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`;
    try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(url))); }
    catch (e: any) { console.warn(`  tile ${tx}/${ty} failed: ${e.message}`); }
  }
  console.log(`decoded ${tiles.size}/${count} tiles`);
}

function pixelElev(ix: number, iy: number): number | null {
  const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256);
  const t = tiles.get(`${tx}_${ty}`); if (!t) return null;
  const lx = ix - tx * 256, ly = iy - ty * 256;
  const idx = (ly * t.width + lx) * t.ch;
  const R = t.data[idx], G = t.data[idx + 1], B = t.data[idx + 2];
  return -10000 + (R * 65536 + G * 256 + B) * 0.1;
}
function elevAt(lon: number, lat: number): number | null {
  const gx = lon2gx(lon), gy = lat2gy(lat);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const e00 = pixelElev(x0, y0), e10 = pixelElev(x0 + 1, y0), e01 = pixelElev(x0, y0 + 1), e11 = pixelElev(x0 + 1, y0 + 1);
  if (e00 == null || e10 == null || e01 == null || e11 == null) return e00;
  return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;
}

// ---------- geo ----------
const R = 6371000;
function hav(a: number[], b: number[]) {
  const [la1, lo1] = a, [la2, lo2] = b;
  const p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180;
  const dp = (la2 - la1) * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
}
function bearing(a: number[], b: number[]) {
  const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const d = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
}

async function overpass(q: string): Promise<any> {
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (let a = 0; a < 4; a++) for (const m of mirrors) {
    try {
      const body = 'data=' + encodeURIComponent(q);
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT-research/1.0 (office@appout.co.il)' } }, r => {
          const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode)));
        }); req.on('error', rej); req.write(body); req.end();
      });
      return JSON.parse(buf.toString());
    } catch { await new Promise(r => setTimeout(r, 6000)); }
  }
  throw new Error('overpass failed');
}

// ---------- climb detection ----------
const STEP = 12;            // resample interval (m)
const GRADE_MIN = 0.03;     // 3% sustained
const MIN_LEN = 40;         // m
const MIN_GAIN = 3;         // m
type Climb = { wayName: string; wayId: number; hw: string; lengthM: number; gainM: number; avgGrade: number; maxGrade: number; dir: string; suspect: boolean; start: number[]; end: number[]; mid: number[] };

function detectClimbs(pts: number[][], wayName: string, wayId: number, hw: string, isBridge: boolean): Climb[] {
  // resample to STEP
  const rs: number[][] = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let segLen = hav(pts[i - 1], pts[i]); let from = pts[i - 1];
    while (acc + segLen >= STEP) {
      const t = (STEP - acc) / segLen;
      const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t];
      rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0;
    }
    acc += segLen;
  }
  if (rs.length < 3) return [];
  const el = rs.map(p => elevAt(p[1], p[0]));
  if (el.some(e => e == null)) return [];
  // smooth (window 3) to reduce DEM noise
  const sm = el.map((_, i) => {
    const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[];
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const climbs: Climb[] = [];
  let i = 0;
  while (i < rs.length - 1) {
    // start a run where grade positive & >= GRADE_MIN
    const g0 = (sm[i + 1] - sm[i]) / STEP;
    if (g0 < GRADE_MIN) { i++; continue; }
    let j = i, dips = 0;
    while (j < rs.length - 1) {
      const g = (sm[j + 1] - sm[j]) / STEP;
      if (g >= 0) { j++; dips = 0; }
      else if (dips < 2 && g > -GRADE_MIN) { j++; dips++; }   // tolerate short flat/dip
      else break;
    }
    const seg = rs.slice(i, j + 1);
    const len = (j - i) * STEP;
    const gain = sm[j] - sm[i];
    if (len >= MIN_LEN && gain >= MIN_GAIN) {
      let maxG = 0; for (let k = i; k < j; k++) maxG = Math.max(maxG, (sm[k + 1] - sm[k]) / STEP);
      const avg = gain / len * 100, mx = maxG * 100;
      // grades this steep don't exist as runnable terrain in flat TLV → likely a
      // bridge/underpass/DEM artifact where terrain under a structure is sampled.
      const suspect = isBridge || mx > 18 || (avg > 12 && len < 100);
      climbs.push({ wayName, wayId, hw, lengthM: Math.round(len), gainM: +gain.toFixed(1), avgGrade: +avg.toFixed(1), maxGrade: +mx.toFixed(1), dir: bearing(seg[0], seg[seg.length - 1]), suspect, start: seg[0], end: seg[seg.length - 1], mid: seg[Math.floor(seg.length / 2)] });
    }
    i = j + 1;
  }
  return climbs;
}

// ---------- SVG heat-map ----------
function writeHeatmap(climbs: Climb[]) {
  const W = 900, H = Math.round(W * (BBOX.latMax - BBOX.latMin) / (BBOX.lonMax - BBOX.lonMin));
  const GX = 150, GY = Math.round(GX * H / W);
  const x = (lon: number) => (lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin) * W;
  const y = (lat: number) => (BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin) * H;
  let cells = '';
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const lon = BBOX.lonMin + (gx + 0.5) / GX * (BBOX.lonMax - BBOX.lonMin);
    const lat = BBOX.latMax - (gy + 0.5) / GY * (BBOX.latMax - BBOX.latMin);
    const e = elevAt(lon, lat), eE = elevAt(lon + 0.0009, lat), eN = elevAt(lon, lat + 0.0009);
    if (e == null || eE == null || eN == null) continue;
    const dz = Math.hypot((eE - e) / 85, (eN - e) / 100); // ~m per ~85-100m cell → grade
    const grade = Math.min(1, dz / 0.10); // normalize to 10%
    if (grade < 0.15) continue;
    const r = Math.round(255 * grade), g = Math.round(180 * (1 - grade));
    cells += `<rect x="${(gx / GX * W).toFixed(1)}" y="${(gy / GY * H).toFixed(1)}" width="${(W / GX).toFixed(1)}" height="${(H / GY).toFixed(1)}" fill="rgb(${r},${g},60)" opacity="${(0.25 + grade * 0.6).toFixed(2)}"/>`;
  }
  const segs = climbs.map(c => `<line x1="${x(c.start[1]).toFixed(1)}" y1="${y(c.start[0]).toFixed(1)}" x2="${x(c.end[1]).toFixed(1)}" y2="${y(c.end[0]).toFixed(1)}" stroke="${c.avgGrade >= 6 ? '#7c3aed' : '#111'}" stroke-width="${Math.min(6, 2 + c.avgGrade / 2)}" stroke-linecap="round" opacity="0.9"/>`).join('');
  const mac = `<circle cx="${x(MACCABIAH.lon).toFixed(1)}" cy="${y(MACCABIAH.lat).toFixed(1)}" r="9" fill="none" stroke="#00e5ff" stroke-width="3"/><text x="${(x(MACCABIAH.lon) + 12).toFixed(1)}" y="${y(MACCABIAH.lat).toFixed(1)}" fill="#00e5ff" font-size="15" font-family="sans-serif">מכביה</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#0b1020"/>${cells}${segs}${mac}<text x="12" y="24" fill="#fff" font-size="16" font-family="sans-serif">TLV climb heat-map — DEM slope (red=steep) + detected climb segments (purple ≥6%)</text></svg>`;
  fs.writeFileSync('.claude/previews/tlv-climbs.svg', svg);
  console.log('🗺  heat-map → .claude/previews/tlv-climbs.svg');
}

async function main() {
  await loadTiles();
  // sanity: elevation at a few known points
  console.log(`\nDEM sanity — Maccabiah bridge: ${elevAt(MACCABIAH.lon, MACCABIAH.lat)?.toFixed(1)}m | beach(34.763,32.083): ${elevAt(34.763, 32.083)?.toFixed(1)}m | Jaffa hill(34.752,32.052): ${elevAt(34.752, 32.052)?.toFixed(1)}m`);

  console.log('\npulling OSM foot ways in bbox ...');
  const q = `[out:json][timeout:120];(way["highway"~"^(footway|path|pedestrian|steps|track)$"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax}););out geom;`;
  const d = await overpass(q);
  const ways = d.elements.filter((e: any) => e.type === 'way' && e.geometry && e.geometry.length >= 2);
  console.log(`foot ways: ${ways.length}`);

  let all: Climb[] = []; let stepsCount = 0;
  for (const w of ways) {
    const hw = w.tags?.highway || '';
    if (hw === 'steps') { stepsCount++; continue; }   // stairs = separate category, not a runnable climb
    const pts = w.geometry.map((p: any) => [p.lat, p.lon]);
    if (pts.reduce((s: number, _: any, i: number) => i ? s + hav(pts[i - 1], pts[i]) : 0, 0) < MIN_LEN) continue;
    all.push(...detectClimbs(pts, w.tags?.name || `way/${w.id}`, w.id, hw, w.tags?.bridge === 'yes' || !!w.tags?.tunnel));
  }
  console.log(`(skipped ${stepsCount} highway=steps ways — stairs, not runnable climbs)`);
  // dedupe near-identical climbs (same mid within 25m)
  const uniq: Climb[] = [];
  for (const c of all.sort((a, b) => b.gainM - a.gainM)) {
    if (!uniq.some(u => hav(u.mid, c.mid) < 25)) uniq.push(c);
  }
  const real = uniq.filter(c => !c.suspect), suspect = uniq.filter(c => c.suspect);
  console.log(`\ndetected ${uniq.length} climb segments → ${real.length} real terrain climbs, ${suspect.length} suspect (bridge/artifact, excluded)\n`);
  console.log('TOP 15 REAL terrain climbs citywide:');
  console.log('LEN    GAIN  AVG%  MAX%  DIR  WHERE');
  for (const c of real.slice(0, 15))
    console.log(`${String(c.lengthM).padStart(4)}m  ${String(c.gainM).padStart(4)}m ${String(c.avgGrade).padStart(4)}% ${String(c.maxGrade).padStart(4)}%  ${c.dir.padEnd(3)}  ${c.wayName}`);

  // feasibility: climbs near Maccabiah bridge
  const near = uniq.filter(c => hav([MACCABIAH.lat, MACCABIAH.lon], c.mid) < 250).sort((a, b) => b.lengthM - a.lengthM);
  console.log(`\n=== FEASIBILITY — climbs within 250m of ${MACCABIAH.name} (${MACCABIAH.lat},${MACCABIAH.lon}) ===`);
  if (near.length === 0) console.log('  none detected at threshold — (see note)');
  for (const c of near)
    console.log(`  ${c.lengthM}m climb, avg ${c.avgGrade}% (max ${c.maxGrade}%), heading ${c.dir}, gain ${c.gainM}m — ${c.wayName}`);

  fs.writeFileSync('/tmp/tlv_climbs.json', JSON.stringify(uniq, null, 1));
  writeHeatmap(uniq);
  console.log(`\nfull list → /tmp/tlv_climbs.json (${uniq.length} climbs). No DB writes.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
