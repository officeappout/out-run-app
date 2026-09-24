// READ-ONLY investigation. No writes, no --apply, no changes to geo-discovery-routes.ts.
// Prototypes a "sidewalk-like footway" detector (tag signal + geometric near-road-and-
// parallel signal), sanity-checks it both directions, applies it to all 77 current Haifa
// routes via path-to-way snap-back matching (robust across all 5 route-type buckets,
// independent of whether sourceWayIds happens to be populated), and simulates a
// trim-from-the-ends-then-rescore fix against the existing recreational-quality gate.
import * as fs from 'fs';
import * as https from 'https';
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 8; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) sidewalk-detector' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
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
const GRID_DEG = 0.0006; // ~60-65m cells, same precision level as the rest of this pipeline.
function gridKey(p: number[]): string { return `${Math.floor(p[0] / GRID_DEG)}:${Math.floor(p[1] / GRID_DEG)}`; }

interface WaySeg { a: number[]; b: number[]; wayId: number }
interface WayInfo { id: number; highway: string; name: string | null; footwayTag: string | null; isSidepath: boolean; pts: number[][]; lenM: number }

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

// ─── Sidewalk-like detector ───
function detectSidewalk(way: WayInfo, roadGrid: Map<string, WaySeg[]>): { flagged: boolean; reason: string; parallelFrac: number } {
  if (way.footwayTag === 'sidewalk' || way.isSidepath) return { flagged: true, reason: 'tag (footway=sidewalk or is_sidepath=yes)', parallelFrac: 1 };
  // Densify to ~10m samples, for each find the nearest ROAD segment and test proximity+parallel.
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
      const nearby = nearbySegs(p, roadGrid);
      let best = Infinity, bestBearing = 0;
      for (const rs of nearby) {
        const { distM } = pointToSegDistM(p, rs.a, rs.b);
        if (distM < best) { best = distM; bestBearing = bearingDeg(rs.a, rs.b); }
      }
      const sampleLen = segLen / steps;
      if (best <= SIDEWALK_PROXIMITY_M && angleDiffMod180(wayBearing, bestBearing) <= SIDEWALK_ANGLE_DEG) parallelLen += sampleLen;
    }
  }
  const frac = way.lenM > 0 ? parallelLen / way.lenM : 0;
  return { flagged: frac >= SIDEWALK_FRACTION_THRESHOLD, reason: `geometric (${(frac * 100).toFixed(0)}% parallel-to-road)`, parallelFrac: frac };
}

async function main() {
  const db = initFb();
  const routes: any[] = JSON.parse(fs.readFileSync('/tmp/haifa-77-routes.json', 'utf8'));
  console.log(`Loaded ${routes.length} Haifa routes.\n`);
  for (const r of routes) { const doc = await db.collection('official_routes').doc(r.id).get(); r.path = doc.data()!.path.map((p: any) => [p.lat, p.lng]); }

  console.log('Fetching ALL relevant highway ways in Haifa bbox (dedicated + street + road vocabulary) — one combined fetch …');
  const bb = `${HAIFA_BBOX.latMin},${HAIFA_BBOX.lonMin},${HAIFA_BBOX.latMax},${HAIFA_BBOX.lonMax}`;
  const data = await overpass(`[out:json][timeout:180];way["highway"~"^(footway|path|pedestrian|cycleway|steps|track|residential|tertiary|service|living_street|unclassified|secondary|primary|trunk|motorway)$"](${bb});out geom tags;`);
  const allWays = new Map<number, WayInfo>();
  const allSegs: WaySeg[] = [];
  const roadSegs: WaySeg[] = [];
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const pts = e.geometry.map((p: any) => [p.lat, p.lon]);
    const t = e.tags || {};
    const info: WayInfo = { id: e.id, highway: t.highway || '(none)', name: t.name || null, footwayTag: t.footway || null, isSidepath: t.is_sidepath === 'yes', pts, lenM: pathLen(pts) };
    allWays.set(e.id, info);
    for (let i = 1; i < pts.length; i++) {
      allSegs.push({ a: pts[i - 1], b: pts[i], wayId: e.id });
      if (ROAD_HIGHWAY.has(info.highway)) roadSegs.push({ a: pts[i - 1], b: pts[i], wayId: e.id });
    }
  }
  console.log(`  fetched ${allWays.size} ways total, ${roadSegs.length} road segments for the parallel test.\n`);
  const allGrid = buildGrid(allSegs);
  const roadGrid = buildGrid(roadSegs);

  // ─── Sanity check ───
  console.log('=== SANITY CHECK ===');
  const merkazHacarmel = allWays.get(325283597);
  if (merkazHacarmel) {
    const r1 = detectSidewalk(merkazHacarmel, roadGrid);
    console.log(`way/325283597 (מרכז הכרמל, ${Math.round(merkazHacarmel.lenM)}m, highway=${merkazHacarmel.highway}): ${r1.flagged ? '✅ FLAGGED sidewalk-like' : '❌ NOT flagged'} — ${r1.reason}`);
  } else console.log('⚠️ way/325283597 not found in fetched data — check bbox/vocabulary coverage.');
  const kiryatEliezerIds = [132618938, 503049647, 504739132, 560398488, 560398489];
  for (const wid of kiryatEliezerIds) {
    const w = allWays.get(wid);
    if (!w) { console.log(`⚠️ way/${wid} (טיילת קרית אליעזר) not found.`); continue; }
    const r = detectSidewalk(w, roadGrid);
    console.log(`way/${wid} (טיילת קרית אליעזר leg, ${Math.round(w.lenM)}m, highway=${w.highway}): ${r.flagged ? '⚠️ FLAGGED sidewalk-like (unexpected!)' : '✅ not flagged'} — ${r.reason}`);
  }

  // ─── Per-route composition via path-to-way snap-back matching ───
  console.log('\n\n=== Per-route composition (path-to-way snap-back match) ===\n');
  type PathAssign = { wayId: number | null; atM: number; segLenM: number };
  function assignPathToWays(path: number[][]): PathAssign[] {
    const out: PathAssign[] = [];
    let cum = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const segLen = hav(a, b);
      if (segLen > 0) {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const nearby = nearbySegs(mid, allGrid, 2);
        let best = Infinity, bestWay: number | null = null;
        for (const s of nearby) { const { distM } = pointToSegDistM(mid, s.a, s.b); if (distM < best) { best = distM; bestWay = s.wayId; } }
        out.push({ wayId: best <= 20 ? bestWay : null, atM: cum, segLenM: segLen });
      }
      cum += segLen;
    }
    return out;
  }

  type RouteResult = {
    id: string; name: string; distance: number;
    sidewalkPct: number; genuineDedicatedPct: number; ordinaryPct: number; otherPct: number;
    unmatchedPct: number;
    trimStartM: number; trimEndM: number; trimmedLenM: number;
    trimVerdict: 'survives-intact' | 'survives-trimmed' | 'drops';
  };
  const results: RouteResult[] = [];

  for (const r of routes) {
    const assigns = assignPathToWays(r.path);
    let sidewalkLen = 0, genuineDedicatedLen = 0, ordinaryLen = 0, otherLen = 0, unmatchedLen = 0;
    const wayFlags = new Map<number, { sidewalk: boolean; category: 'sidewalk' | 'dedicated' | 'ordinary' | 'other' }>();
    for (const a of assigns) {
      let category: 'sidewalk' | 'dedicated' | 'ordinary' | 'other' | 'unmatched';
      if (a.wayId === null) category = 'unmatched';
      else {
        if (!wayFlags.has(a.wayId)) {
          const w = allWays.get(a.wayId);
          if (!w) { wayFlags.set(a.wayId, { sidewalk: false, category: 'other' }); }
          else if (w.highway === 'footway') {
            const d = detectSidewalk(w, roadGrid);
            wayFlags.set(a.wayId, { sidewalk: d.flagged, category: d.flagged ? 'sidewalk' : 'dedicated' });
          } else if (DEDICATED_HIGHWAY.has(w.highway)) wayFlags.set(a.wayId, { sidewalk: false, category: 'dedicated' });
          else if (ORDINARY_HIGHWAY.has(w.highway)) wayFlags.set(a.wayId, { sidewalk: false, category: 'ordinary' });
          else wayFlags.set(a.wayId, { sidewalk: false, category: 'other' });
        }
        category = wayFlags.get(a.wayId)!.category;
      }
      if (category === 'sidewalk') sidewalkLen += a.segLenM;
      else if (category === 'dedicated') genuineDedicatedLen += a.segLenM;
      else if (category === 'ordinary') ordinaryLen += a.segLenM;
      else if (category === 'other') otherLen += a.segLenM;
      else unmatchedLen += a.segLenM;
    }
    const totalLen = sidewalkLen + genuineDedicatedLen + ordinaryLen + otherLen + unmatchedLen || 1;

    // Trim sidewalk-like legs from the ENDS only.
    let startIdx = 0, endIdx = assigns.length - 1;
    let trimStartM = 0;
    while (startIdx <= endIdx) {
      const wid = assigns[startIdx].wayId;
      const isSidewalk = wid !== null && wayFlags.get(wid)?.category === 'sidewalk';
      if (!isSidewalk) break;
      trimStartM += assigns[startIdx].segLenM; startIdx++;
    }
    let trimEndM = 0;
    while (endIdx >= startIdx) {
      const wid = assigns[endIdx].wayId;
      const isSidewalk = wid !== null && wayFlags.get(wid)?.category === 'sidewalk';
      if (!isSidewalk) break;
      trimEndM += assigns[endIdx].segLenM; endIdx--;
    }
    const trimmedLenM = totalLen - trimStartM - trimEndM;

    // Recompute composition on the TRIMMED middle section only, for the rescore.
    let tSidewalk = 0, tDedicated = 0, tOrdinary = 0, tOther = 0, tUnmatched = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const a = assigns[i];
      const cat = a.wayId !== null ? wayFlags.get(a.wayId)?.category : 'unmatched';
      if (cat === 'sidewalk') tSidewalk += a.segLenM;
      else if (cat === 'dedicated') tDedicated += a.segLenM;
      else if (cat === 'ordinary') tOrdinary += a.segLenM;
      else if (cat === 'other') tOther += a.segLenM;
      else tUnmatched += a.segLenM;
    }
    const tTotal = tSidewalk + tDedicated + tOrdinary + tOther + tUnmatched || 1;
    const tDedicatedFrac = tDedicated / tTotal; // sidewalk-like no longer counts as dedicated in the rescore

    // Re-apply the existing codified gate (recreational character + length floor) to the trimmed route.
    const isTrailMember = r.externalId.startsWith('osm:rel/');
    const lengthFloor = isTrailMember ? 600 : 800;
    // Note: "special" (park/coast proximity) not recomputed here — trimming a few end
    // meters essentially never changes whether the route's midsection sits near a park/
    // coast, so the original candidate's own special-adjacency (implicit in it having
    // passed the gate originally) is assumed to still hold if it held before.
    const passesType = isTrailMember || tDedicatedFrac >= 0.5;
    const passesLength = trimmedLenM >= lengthFloor;
    let verdict: RouteResult['trimVerdict'];
    if (trimStartM === 0 && trimEndM === 0) verdict = 'survives-intact';
    else if (passesType && passesLength) verdict = 'survives-trimmed';
    else verdict = 'drops';

    results.push({
      id: r.id, name: r.name, distance: r.distance,
      sidewalkPct: Math.round((sidewalkLen / totalLen) * 1000) / 10,
      genuineDedicatedPct: Math.round((genuineDedicatedLen / totalLen) * 1000) / 10,
      ordinaryPct: Math.round((ordinaryLen / totalLen) * 1000) / 10,
      otherPct: Math.round((otherLen / totalLen) * 1000) / 10,
      unmatchedPct: Math.round((unmatchedLen / totalLen) * 1000) / 10,
      trimStartM: Math.round(trimStartM), trimEndM: Math.round(trimEndM), trimmedLenM: Math.round(trimmedLenM),
      trimVerdict: verdict,
    });
  }

  fs.writeFileSync('/tmp/haifa-sidewalk-results.json', JSON.stringify(results, null, 2));
  results.sort((a, b) => b.sidewalkPct - a.sidewalkPct);
  console.log('Name'.padEnd(38) + 'Len'.padStart(6) + '  Sidewalk%'.padStart(11) + '  GenuineDedic%'.padStart(15) + '  Ordinary%'.padStart(11) + '  TrimStart'.padStart(11) + '  TrimEnd'.padStart(9) + '  NewLen'.padStart(8) + '  Verdict');
  for (const row of results) {
    console.log(
      row.name.padEnd(38) + `${row.distance}m`.padStart(6) +
      `${row.sidewalkPct}%`.padStart(11) + `${row.genuineDedicatedPct}%`.padStart(15) + `${row.ordinaryPct}%`.padStart(11) +
      `${row.trimStartM}m`.padStart(11) + `${row.trimEndM}m`.padStart(9) + `${row.trimmedLenM}m`.padStart(8) +
      `  ${row.trimVerdict}`
    );
  }

  const verdictCounts: Record<string, number> = {};
  for (const r of results) verdictCounts[r.trimVerdict] = (verdictCounts[r.trimVerdict] || 0) + 1;
  console.log('\n=== Trim+rescore summary ===');
  console.log(JSON.stringify(verdictCounts, null, 2));
  console.log(`\n=== COMPLETE — read-only, no writes ===`);
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
