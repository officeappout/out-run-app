/**
 * scripts/climb-segments-tlv.ts — PILOT, READ-ONLY (no DB writes)
 *
 * ISOLATES discrete climb segments (not route averages) via multi-scale sliding
 * windows over the dense DEM elevation profile, and classifies each:
 *   short-sharp  : avgGrade ≥8%,  50–150m
 *   repeats      : avgGrade 5–8%, 150–300m
 *   long-gentle  : avgGrade 3–5%, 300m+
 * Writes a climbType onto every terrain climb; structural(OSM ramp) + stairs kept separate.
 *
 * Proof probe: isolates the specific steep pitch on שדרות רוטשילד toward הבימה
 * (80–200m window) and reports ITS grade alone — not the 4.7km boulevard average.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import * as zlib from 'zlib'; import * as https from 'https'; import * as fs from 'fs';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const BBOX = { latMin: 32.040, latMax: 32.118, lonMin: 34.740, lonMax: 34.800 };
const Z = 14, n = 2 ** Z, STEP = 10;
const lon2gx = (lo: number) => (lo + 180) / 360 * 256 * n;
const lat2gy = (la: number) => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n; };
function decodePNG(buf: Buffer) { let p = 8, W = 0, H = 0, ct = 0; const idat: Buffer[] = []; while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; } const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4, stride = W * ch, out = Buffer.alloc(H * stride); let pos = 0; for (let y = 0; y < H; y++) { const ft = raw[pos++]; for (let x = 0; x < stride; x++) { const rv = raw[pos++]; const a = x >= ch ? out[y * stride + x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0; let v = rv; if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b; else if (ft === 3) v = rv + ((a + b) >> 1); else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[y * stride + x] = v & 0xff; } } return { width: W, height: H, ch, data: out }; }
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }).on('error', rej));
const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() { const txMin = Math.floor(lon2gx(BBOX.lonMin) / 256), txMax = Math.floor(lon2gx(BBOX.lonMax) / 256), tyMin = Math.floor(lat2gy(BBOX.latMax) / 256), tyMax = Math.floor(lat2gy(BBOX.latMin) / 256); for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) { try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`))); } catch {} } }
function pxElev(ix: number, iy: number): number | null { const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256), t = tiles.get(`${tx}_${ty}`); if (!t) return null; const idx = ((iy - ty * 256) * t.width + (ix - tx * 256)) * t.ch; return -10000 + (t.data[idx] * 65536 + t.data[idx + 1] * 256 + t.data[idx + 2]) * 0.1; }
function elevAt(lon: number, lat: number): number | null { const gx = lon2gx(lon), gy = lat2gy(lat), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const e00 = pxElev(x0, y0), e10 = pxElev(x0 + 1, y0), e01 = pxElev(x0, y0 + 1), e11 = pxElev(x0 + 1, y0 + 1); if (e00 == null || e10 == null || e01 == null || e11 == null) return e00; return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy; }
const Rd = 6371000;
const hav = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return 2 * Rd * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const bearing = (a: number[], b: number[]) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(Math.sin((b[1] - a[1]) * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180), Math.cos(a[0] * Math.PI / 180) * Math.sin(b[0] * Math.PI / 180) - Math.sin(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.cos((b[1] - a[1]) * Math.PI / 180)) * 180 / Math.PI + 360) % 360) / 45) % 8];
async function overpass(q: string): Promise<any> { for (let a = 0; a < 4; a++) for (const m of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) { try { const buf: Buffer = await new Promise((res, rej) => { const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); }); req.on('error', rej); req.write('data=' + encodeURIComponent(q)); req.end(); }); return JSON.parse(buf.toString()); } catch { await new Promise(r => setTimeout(r, 6000)); } } throw new Error('overpass failed'); }

// dense resample + smoothed elevation
function densify(pts: number[][]) { const rs: number[][] = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { let from = pts[i - 1], segLen = hav(from, pts[i]); while (acc + segLen >= STEP) { const t = (STEP - acc) / segLen; const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t]; rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0; } acc += segLen; } const el = rs.map(p => elevAt(p[1], p[0])); if (el.some(e => e == null)) return null; const sm = (el as number[]).map((_, i) => { const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[]; return w.reduce((a, b) => a + b, 0) / w.length; }); return { rs, sm }; }

// steepest sliding window of `Wm` meters over a smoothed profile
function steepestWindow(rs: number[][], sm: number[], Wm: number) {
  const k = Math.round(Wm / STEP); if (k >= sm.length) return null;
  let bi = -1, bg = -Infinity;
  for (let i = 0; i + k < sm.length; i++) { const g = sm[i + k] - sm[i]; if (g > bg) { bg = g; bi = i; } }
  if (bi < 0 || bg <= 0) return null;
  let maxStep = 0; for (let j = bi; j < bi + k; j++) maxStep = Math.max(maxStep, (sm[j + 1] - sm[j]) / STEP);
  return { lengthM: k * STEP, gainM: +bg.toFixed(1), avgGrade: +(bg / (k * STEP) * 100).toFixed(1), maxGrade: +(maxStep * 100).toFixed(1), start: rs[bi], end: rs[bi + k], mid: rs[bi + Math.floor(k / 2)], dir: bearing(rs[bi], rs[bi + k]) };
}
// classify: pick highest-priority bucket that matches an isolated window
function classify(rs: number[][], sm: number[]) {
  const w = (m: number) => steepestWindow(rs, sm, m);
  for (const W of [50, 100, 150]) { const s = w(W); if (s && s.avgGrade >= 8) return { climbType: 'short-sharp', seg: s }; }
  for (const W of [150, 200, 300]) { const s = w(W); if (s && s.avgGrade >= 5 && s.avgGrade < 8) return { climbType: 'repeats', seg: s }; }
  { const s = w(300) || w(200); if (s && s.avgGrade >= 3 && s.avgGrade < 5) return { climbType: 'long-gentle', seg: s }; }
  return null;
}

async function main() {
  console.log('loading Terrain-RGB tiles ...'); await loadTiles(); console.log(`decoded ${tiles.size} tiles`);

  // ---------- PROOF: isolate the steep pitch on Rothschild → Habima ----------
  console.log('\n=== ISOLATION PROOF — שדרות רוטשילד → כיכר הבימה ===');
  const center = [[32.0632, 34.7695], [32.0655, 34.7720], [32.0672, 34.7741], [32.0690, 34.7766], [32.0703, 34.7786], [32.0715, 34.7806]];
  const d = densify(center)!;
  const whole = ((d.sm[d.sm.length - 1] - d.sm[0]) / ((d.rs.length - 1) * STEP) * 100);
  console.log(`whole-boulevard average: ${whole.toFixed(2)}%  ← useless (dilutes the pitch)`);
  console.log('sliding-window steepest pitch, per scale:');
  for (const W of [50, 80, 100, 150, 200]) { const s = steepestWindow(d.rs, d.sm, W); if (s) console.log(`  ${String(W).padStart(3)}m window → avg ${s.avgGrade}%  max ${s.maxGrade}%  ${s.dir}  @${s.mid.map(x => x.toFixed(4)).join(',')}`); }
  const cls = classify(d.rs, d.sm);
  console.log(`ISOLATED climb → ${cls ? `${cls.seg.lengthM}m @ ${cls.seg.avgGrade}% (max ${cls.seg.maxGrade}%), ${cls.seg.dir} → climbType='${cls.climbType}'` : 'below thresholds'}`);

  // ---------- rebuild terrain climb_segments with climbType ----------
  console.log('\n=== rebuilding climb_segments (isolated windows + climbType) ===');
  const q = `[out:json][timeout:120];(way["highway"~"^(footway|path|pedestrian)$"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax}););out geom;`;
  const dd = await overpass(q);
  const ways = dd.elements.filter((e: any) => e.type === 'way' && e.geometry && e.geometry.length >= 2);
  const segs: any[] = [];
  for (const w of ways) {
    const pts = w.geometry.map((p: any) => [p.lat, p.lon]);
    if (pts.reduce((s: number, _: any, i: number) => i ? s + hav(pts[i - 1], pts[i]) : 0, 0) < 50) continue;
    const den = densify(pts); if (!den || den.sm.length < 6) continue;
    const cls = classify(den.rs, den.sm);
    if (!cls || cls.seg.maxGrade > 18) continue; // artifact guard
    segs.push({ id: `terrain:${w.id}`, type: 'terrain', climbType: cls.climbType, center: cls.seg.mid, start: cls.seg.start, end: cls.seg.end, lengthM: cls.seg.lengthM, avgGrade: cls.seg.avgGrade, maxGrade: cls.seg.maxGrade, dir: cls.seg.dir, wayName: w.tags?.name || `way/${w.id}`, source: 'dem' });
  }
  // dedupe by proximity
  const uniq: any[] = []; for (const c of segs.sort((a, b) => b.avgGrade - a.avgGrade)) if (!uniq.some(u => hav(u.center, c.center) < 30)) uniq.push(c);
  const dist: any = { 'short-sharp': 0, 'repeats': 0, 'long-gentle': 0 };
  uniq.forEach(c => dist[c.climbType]++);
  console.log(`isolated ${uniq.length} climb segments → short-sharp:${dist['short-sharp']}  repeats:${dist['repeats']}  long-gentle:${dist['long-gentle']}`);
  console.log('\nexamples per climbType:');
  for (const ct of ['short-sharp', 'repeats', 'long-gentle']) {
    const ex = uniq.filter(c => c.climbType === ct).sort((a, b) => b.avgGrade - a.avgGrade).slice(0, 3);
    console.log(` ${ct}:`);
    for (const c of ex) console.log(`   ${c.lengthM}m @ ${c.avgGrade}% (max ${c.maxGrade}%) ${c.dir} — ${c.wayName}`);
  }
  fs.writeFileSync('/tmp/tlv_climb_segments.json', JSON.stringify(uniq));
  console.log(`\nclimb_segments → /tmp/tlv_climb_segments.json (${uniq.length}). No DB writes.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
