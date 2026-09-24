// READ-ONLY. No writes, no deletes, no --apply. Full Haifa route triage: pulls ALL live
// Haifa official_routes fresh from Firestore, reuses the already-validated sidewalk
// detector (tag + geometric parallel-to-road, cross-checked both directions in a prior
// session) via path-to-way snap-back matching, computes composition (genuine-recreational
// / sidewalk-like / ordinary-street / other), simulates an end-trim (now covering BOTH
// sidewalk-like AND ordinary-street tail content, not sidewalk-only) to distinguish a
// trimmable bad tail from pervasive bad content, and suggests APPROVE / EDIT / DROP per
// route. Worst-first ranked table. No code changes, no writes.
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as https from 'https';
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 8; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) full-triage' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 4000)); }
  }
  throw new Error('overpass failed (all mirrors, all retries)');
}
const R = 6371000;
function hav(a: number[], b: number[]): number {
  const [la1, lo1] = a, [la2, lo2] = b;
  const dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function pathLen(pts: number[][]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += hav(pts[i - 1], pts[i]); return s; }

const HAIFA_BBOX = { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 };
const DEDICATED_HIGHWAY = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);
const ORDINARY_HIGHWAY = new Set(['residential', 'tertiary', 'service', 'living_street', 'unclassified']);
const ROAD_HIGHWAY = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service']);
const SIDEWALK_PROXIMITY_M = 15;
const SIDEWALK_ANGLE_DEG = 30;
const SIDEWALK_FRACTION_THRESHOLD = 0.6;
const GRID_DEG = 0.0006;
function gridKey(p: number[]): string { return `${Math.floor(p[0] / GRID_DEG)}:${Math.floor(p[1] / GRID_DEG)}`; }

interface WaySeg { a: number[]; b: number[]; wayId: number }
interface WayInfo { id: number; highway: string; footwayTag: string | null; isSidepath: boolean; pts: number[][]; lenM: number }

function pointToSegDistM(p: number[], a: number[], b: number[]): { distM: number; t: number } {
  const refLat = a[0]; const mLat = 111320, mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = (q: number[]): [number, number] => [q[1] * mLon, q[0] * mLat];
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(0, Math.min(1, t));
  return { distM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}
function bearingDeg(a: number[], b: number[]): number {
  const la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
  const y = Math.sin(dLo) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLo);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function angleDiffMod180(a: number, b: number): number { let d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; }

function buildGrid(segs: WaySeg[]): Map<string, WaySeg[]> {
  const grid = new Map<string, WaySeg[]>();
  for (const seg of segs) {
    const lat0 = Math.min(seg.a[0], seg.b[0]), lat1 = Math.max(seg.a[0], seg.b[0]);
    const lon0 = Math.min(seg.a[1], seg.b[1]), lon1 = Math.max(seg.a[1], seg.b[1]);
    for (let la = Math.floor(lat0 / GRID_DEG); la <= Math.floor(lat1 / GRID_DEG); la++) {
      for (let lo = Math.floor(lon0 / GRID_DEG); lo <= Math.floor(lon1 / GRID_DEG); lo++) {
        const key = `${la}:${lo}`; if (!grid.has(key)) grid.set(key, []); grid.get(key)!.push(seg);
      }
    }
  }
  return grid;
}
function nearbySegs(p: number[], grid: Map<string, WaySeg[]>, radiusCells = 1): WaySeg[] {
  const la = Math.floor(p[0] / GRID_DEG), lo = Math.floor(p[1] / GRID_DEG);
  const out: WaySeg[] = []; const seen = new Set<WaySeg>();
  for (let da = -radiusCells; da <= radiusCells; da++) for (let dob = -radiusCells; dob <= radiusCells; dob++) {
    const bucket = grid.get(`${la + da}:${lo + dob}`); if (!bucket) continue;
    for (const s of bucket) if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function detectSidewalk(way: WayInfo, roadGrid: Map<string, WaySeg[]>): boolean {
  if (way.footwayTag === 'sidewalk' || way.isSidepath) return true;
  const SPACING = 10;
  let parallelLen = 0;
  for (let i = 1; i < way.pts.length; i++) {
    const a = way.pts[i - 1], b = way.pts[i];
    const segLen = hav(a, b); if (segLen === 0) continue;
    const wayBearing = bearingDeg(a, b);
    const steps = Math.max(1, Math.round(segLen / SPACING));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      let best = Infinity, bestBearing = 0;
      for (const rs of nearbySegs(p, roadGrid)) { const { distM } = pointToSegDistM(p, rs.a, rs.b); if (distM < best) { best = distM; bestBearing = bearingDeg(rs.a, rs.b); } }
      const sampleLen = segLen / steps;
      if (best <= SIDEWALK_PROXIMITY_M && angleDiffMod180(wayBearing, bestBearing) <= SIDEWALK_ANGLE_DEG) parallelLen += sampleLen;
    }
  }
  return way.lenM > 0 ? (parallelLen / way.lenM) >= SIDEWALK_FRACTION_THRESHOLD : false;
}

function classify(d: any): string {
  if (d.routeShape === 'loop' && typeof d.name === 'string' && d.name.startsWith('הקפת ')) return 'park loop';
  if (d.routeShape === 'loop') return 'other loop';
  if (d.source?.externalId?.startsWith('osm:rel/')) return 'trail';
  if (d.activityType === 'cycling') return 'cycling';
  return 'named segment';
}

async function main() {
  const db = initFb();
  console.log('Fetching all live Haifa official_routes …');
  const snap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const routes = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Loaded ${routes.length} routes.\n`);
  for (const r of routes) r.pathPts = (r.path || []).map((p: any) => [p.lat, p.lng]);

  console.log('Fetching ALL relevant highway ways in Haifa bbox (dedicated + street + road vocabulary) …');
  const bb = `${HAIFA_BBOX.latMin},${HAIFA_BBOX.lonMin},${HAIFA_BBOX.latMax},${HAIFA_BBOX.lonMax}`;
  const data = await overpass(`[out:json][timeout:180];way["highway"~"^(footway|path|pedestrian|cycleway|steps|track|residential|tertiary|service|living_street|unclassified|secondary|primary|trunk|motorway)$"](${bb});out geom tags;`);
  const allWays = new Map<number, WayInfo>();
  const allSegs: WaySeg[] = [];
  const roadSegs: WaySeg[] = [];
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const pts = e.geometry.map((p: any) => [p.lat, p.lon]);
    const t = e.tags || {};
    const info: WayInfo = { id: e.id, highway: t.highway || '(none)', footwayTag: t.footway || null, isSidepath: t.is_sidepath === 'yes', pts, lenM: pathLen(pts) };
    allWays.set(e.id, info);
    for (let i = 1; i < pts.length; i++) {
      allSegs.push({ a: pts[i - 1], b: pts[i], wayId: e.id });
      if (ROAD_HIGHWAY.has(info.highway)) roadSegs.push({ a: pts[i - 1], b: pts[i], wayId: e.id });
    }
  }
  console.log(`  fetched ${allWays.size} ways total, ${roadSegs.length} road segments.\n`);
  const allGrid = buildGrid(allSegs);
  const roadGrid = buildGrid(roadSegs);

  type PathAssign = { wayId: number | null; segLenM: number };
  function assignPathToWays(path: number[][]): PathAssign[] {
    const out: PathAssign[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const segLen = hav(a, b);
      if (segLen > 0) {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let best = Infinity, bestWay: number | null = null;
        for (const s of nearbySegs(mid, allGrid, 2)) { const { distM } = pointToSegDistM(mid, s.a, s.b); if (distM < best) { best = distM; bestWay = s.wayId; } }
        out.push({ wayId: best <= 20 ? bestWay : null, segLenM: segLen });
      }
    }
    return out;
  }

  type Row = {
    id: string; name: string; type: string; distance: number; activityType: string;
    genuinePct: number; sidewalkPct: number; ordinaryPct: number; otherPct: number;
    trimStartM: number; trimEndM: number; trimmedLenM: number; trimmedGenuinePct: number;
    bucket: 'APPROVE' | 'EDIT' | 'DROP'; reason: string;
  };
  const rows: Row[] = [];
  const wayFlagCache = new Map<number, { category: 'sidewalk' | 'dedicated' | 'ordinary' | 'other' }>();

  for (const r of routes) {
    const assigns = assignPathToWays(r.pathPts);
    let sidewalkLen = 0, genuineLen = 0, ordinaryLen = 0, otherLen = 0, unmatchedLen = 0;
    const cats: Array<'sidewalk' | 'dedicated' | 'ordinary' | 'other' | 'unmatched'> = [];
    for (const a of assigns) {
      let category: 'sidewalk' | 'dedicated' | 'ordinary' | 'other' | 'unmatched';
      if (a.wayId === null) category = 'unmatched';
      else {
        if (!wayFlagCache.has(a.wayId)) {
          const w = allWays.get(a.wayId);
          if (!w) wayFlagCache.set(a.wayId, { category: 'other' });
          else if (w.highway === 'footway') wayFlagCache.set(a.wayId, { category: detectSidewalk(w, roadGrid) ? 'sidewalk' : 'dedicated' });
          else if (DEDICATED_HIGHWAY.has(w.highway)) wayFlagCache.set(a.wayId, { category: 'dedicated' });
          else if (ORDINARY_HIGHWAY.has(w.highway)) wayFlagCache.set(a.wayId, { category: 'ordinary' });
          else wayFlagCache.set(a.wayId, { category: 'other' });
        }
        category = wayFlagCache.get(a.wayId)!.category;
      }
      cats.push(category);
      if (category === 'sidewalk') sidewalkLen += a.segLenM;
      else if (category === 'dedicated') genuineLen += a.segLenM;
      else if (category === 'ordinary') ordinaryLen += a.segLenM;
      else if (category === 'other') otherLen += a.segLenM;
      else unmatchedLen += a.segLenM;
    }
    const totalLen = sidewalkLen + genuineLen + ordinaryLen + otherLen + unmatchedLen || 1;
    const genuinePct = Math.round((genuineLen / totalLen) * 1000) / 10;
    const sidewalkPct = Math.round((sidewalkLen / totalLen) * 1000) / 10;
    const ordinaryPct = Math.round((ordinaryLen / totalLen) * 1000) / 10;
    const otherPct = Math.round(((otherLen + unmatchedLen) / totalLen) * 1000) / 10;

    // Trim the PREDOMINANTLY-bad prefix/suffix (>= BAD_RUN_FRAC non-dedicated within the
    // window), not just a run that's purely bad — a real bad tail can contain a short
    // dedicated blip (e.g. a brief marked crossing) without stopping detection, and a bad
    // stretch doesn't have to touch the literal path endpoint to be the thing a human would
    // trim. Finds the LONGEST prefix/suffix whose own bad-fraction still clears the bar.
    const BAD_RUN_FRAC = 0.75;
    function longestBadPrefix(): number {
      let cumBad = 0, cumTotal = 0, cut = 0;
      for (let i = 0; i < assigns.length; i++) {
        cumTotal += assigns[i].segLenM;
        if (cats[i] !== 'dedicated') cumBad += assigns[i].segLenM;
        if (cumBad / cumTotal >= BAD_RUN_FRAC) cut = i + 1;
      }
      return cut;
    }
    function longestBadSuffix(fromIdx: number): number {
      let cumBad = 0, cumTotal = 0, cut = assigns.length;
      for (let i = assigns.length - 1; i >= fromIdx; i--) {
        cumTotal += assigns[i].segLenM;
        if (cats[i] !== 'dedicated') cumBad += assigns[i].segLenM;
        if (cumBad / cumTotal >= BAD_RUN_FRAC) cut = i;
      }
      return cut;
    }
    const prefixCut = longestBadPrefix();
    const suffixCut = Math.max(prefixCut, longestBadSuffix(prefixCut));
    let trimStartM = 0; for (let i = 0; i < prefixCut; i++) trimStartM += assigns[i].segLenM;
    let trimEndM = 0; for (let i = suffixCut; i < assigns.length; i++) trimEndM += assigns[i].segLenM;
    const trimmedLenM = totalLen - trimStartM - trimEndM;
    let tGenuine = 0, tTotal = 0;
    for (let i = prefixCut; i < suffixCut; i++) { tTotal += assigns[i].segLenM; if (cats[i] === 'dedicated') tGenuine += assigns[i].segLenM; }
    const trimmedGenuinePct = tTotal > 0 ? Math.round((tGenuine / tTotal) * 1000) / 10 : genuinePct;

    // A MEANINGFUL, QUALITY-IMPROVING trimmable tail is checked FIRST, before the flat
    // clean-as-is threshold — an otherwise-good route (e.g. 82% genuine) can still have a
    // real, visible bad tail worth trimming (the user's own example: אריה גוראל — real
    // seafront + a street-comb end that doesn't literally touch the endpoint). EDIT
    // requires the trim to be substantial (>=100m removed), leave a real route behind
    // (>=400m), and actually land somewhere GOOD (>=60% genuine after trim) — trimming that
    // only gets a route from e.g. 11% to 21% genuine hasn't fixed anything; that's still DROP.
    const meaningfulTrim = (trimStartM + trimEndM) >= 100 && trimmedLenM >= 400 && trimmedGenuinePct >= 60;
    let bucket: Row['bucket']; let reason: string;
    if (meaningfulTrim) {
      bucket = 'EDIT'; reason = `trim ${Math.round(trimStartM)}m start + ${Math.round(trimEndM)}m end -> ${trimmedGenuinePct}% genuine over ${Math.round(trimmedLenM)}m — clear trimmable tail`;
    } else if (genuinePct >= 70) {
      bucket = 'APPROVE'; reason = `${genuinePct}% genuine untrimmed — clean as-is`;
    } else if (genuinePct >= 40) {
      bucket = 'EDIT'; reason = `${genuinePct}% genuine, best-case trim only reaches ${trimmedGenuinePct}% (trim=${Math.round(trimStartM)}m/${Math.round(trimEndM)}m) — needs manual inspection, may not be a clean tail`;
    } else {
      bucket = 'DROP'; reason = `${genuinePct}% genuine even after best-case end-trim (${trimmedGenuinePct}%) — majority street/sidewalk, not salvageable`;
    }

    rows.push({
      id: r.id, name: r.name, type: classify(r), distance: r.distance, activityType: r.activityType || '(none)',
      genuinePct, sidewalkPct, ordinaryPct, otherPct,
      trimStartM: Math.round(trimStartM), trimEndM: Math.round(trimEndM), trimmedLenM: Math.round(trimmedLenM), trimmedGenuinePct,
      bucket, reason,
    });
  }

  require('fs').writeFileSync('/tmp/haifa-full-triage-results.json', JSON.stringify(rows, null, 2));
  rows.sort((a, b) => a.genuinePct - b.genuinePct);

  console.log('\n=== FULL HAIFA TRIAGE TABLE (worst-first) ===\n');
  console.log('Name'.padEnd(38) + 'Type'.padEnd(14) + 'Len'.padStart(6) + '  Activity'.padEnd(11) + '  Genuine%'.padStart(10) + '  Sidewalk%'.padStart(11) + '  Street%'.padStart(9) + '  Other%'.padStart(8) + '  Bucket'.padEnd(10));
  for (const row of rows) {
    console.log(
      row.name.padEnd(38) + row.type.padEnd(14) + `${row.distance}m`.padStart(6) + `  ${row.activityType}`.padEnd(11) +
      `${row.genuinePct}%`.padStart(10) + `${row.sidewalkPct}%`.padStart(11) + `${row.ordinaryPct}%`.padStart(9) + `${row.otherPct}%`.padStart(8) +
      `  ${row.bucket}`.padEnd(10) + `  — ${row.reason}`
    );
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;
  console.log('\n=== Bucket counts ===');
  console.log(JSON.stringify(counts, null, 2));

  console.log('\n=== Flagged routes (owner-observed) ===');
  for (const name of ['לולאת פינת גן', 'שביל סביוני הכרמל', 'שביל חיפה - הדר עליון ורמת הדר']) {
    const matches = rows.filter(r => r.name === name);
    for (const m of matches) console.log(`${m.name} (${m.distance}m, id=${m.id}): genuine=${m.genuinePct}% sidewalk=${m.sidewalkPct}% street=${m.ordinaryPct}% -> ${m.bucket} — ${m.reason}`);
  }

  console.log('\n=== COMPLETE — read-only, no writes, no deletes ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
