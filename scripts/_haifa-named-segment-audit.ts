// READ-ONLY audit. No writes, no --apply, no code changes to geo-discovery-routes.ts.
// Audits the 53 Haifa named-segment routes for genuine recreational value: OSM way-type
// composition, marked-trail relation membership, specialness (park/coast) proximity, a
// same-trail stitching-fragment check, and a proposed gate model.
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
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) named-segment-audit' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 5000)); }
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

const HAIFA_BBOX = { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 };
const DEDICATED = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);
const ORDINARY_STREET = new Set(['residential', 'tertiary', 'service', 'living_street', 'unclassified']);
const SPECIALNESS_RADIUS_M = 150;
const MIN_PARK_AREA_M2 = 5000;

interface RouteDoc { id: string; name: string; distance: number; activityType: string; externalId: string; sourceWayIds: string[]; path?: { lat: number; lng: number }[] }

// sourceWayIds is ONLY populated on stitched (multi-way) candidates — buildRouteDoc's
// `...(c.sourceWayIds ? {...} : {})` spread omits the field entirely for a plain
// single-way candidate. Falling back to parsing the way id out of externalId
// (osm:way/<id>) for that case — without this, every single-way route silently
// analyzes as zero constituent ways (confirmed: real 0%/0% rows on genuinely
// highway=footway/path ways, caught by spot-checking raw OSM tags before trusting
// the first pass of this script).
function effectiveWayIds(r: RouteDoc): number[] {
  if (r.sourceWayIds && r.sourceWayIds.length) return r.sourceWayIds.map(w => parseInt(w.replace('way/', ''), 10)).filter(n => !isNaN(n));
  const m = r.externalId.match(/^osm:way\/(\d+)$/);
  return m ? [parseInt(m[1], 10)] : [];
}

async function main() {
  const db = initFb();
  const routes: RouteDoc[] = JSON.parse(fs.readFileSync('/tmp/haifa-named-segments.json', 'utf8'));
  console.log(`Loaded ${routes.length} named-segment routes.\n`);

  // Also fetch full path geometry for each (needed for specialness-distance check + length-weighting cross-check).
  for (const r of routes) {
    const doc = await db.collection('official_routes').doc(r.id).get();
    r.path = doc.data()!.path;
  }

  // Collect all unique way IDs (numeric) across all 53 routes.
  const allWayIds = new Set<number>();
  for (const r of routes) for (const id of effectiveWayIds(r)) allWayIds.add(id);
  console.log(`${allWayIds.size} unique OSM way IDs across all 53 routes.`);

  // Fetch way tags + geometry (chunked — Overpass id-list queries can choke on huge lists).
  const wayIdList = Array.from(allWayIds);
  const wayData = new Map<number, { highway: string; name: string | null; lengthM: number; pts: number[][] }>();
  const CHUNK = 300;
  for (let i = 0; i < wayIdList.length; i += CHUNK) {
    const chunk = wayIdList.slice(i, i + CHUNK);
    console.log(`  fetching way tags+geometry ${i + 1}-${i + chunk.length}/${wayIdList.length} …`);
    const data = await overpass(`[out:json][timeout:180];way(id:${chunk.join(',')});out tags geom;`);
    for (const e of data.elements) {
      if (e.type !== 'way') continue;
      const pts = (e.geometry || []).map((p: any) => [p.lat, p.lon]);
      wayData.set(e.id, { highway: e.tags?.highway || '(none)', name: e.tags?.name || null, lengthM: pathLen(pts), pts });
    }
  }
  console.log(`  fetched tags+geometry for ${wayData.size}/${wayIdList.length} ways.\n`);

  // Find route relations (hiking/foot/bicycle) that backward-reference any of our ways.
  console.log('Finding marked-trail relations referencing these ways …');
  const relCandidates = new Map<number, { name: string; route: string }>();
  for (let i = 0; i < wayIdList.length; i += CHUNK) {
    const chunk = wayIdList.slice(i, i + CHUNK);
    const data = await overpass(`[out:json][timeout:180];way(id:${chunk.join(',')})->.w;rel(bw.w)["route"~"^(hiking|foot|bicycle)$"];out tags;`);
    for (const e of data.elements) if (e.type === 'relation') relCandidates.set(e.id, { name: e.tags?.name || '(unnamed)', route: e.tags?.route });
  }
  console.log(`  ${relCandidates.size} candidate route relations found.`);

  // For each candidate relation, fetch its member way ids, build wayId -> relation membership.
  const wayToRelations = new Map<number, Array<{ id: number; name: string }>>();
  if (relCandidates.size > 0) {
    const relIds = Array.from(relCandidates.keys());
    // One query per relation — a batched 'way(r)' across multiple relations loses which
    // relation each member way came from, so membership must be resolved individually.
    for (const relId of relIds) {
      const d2 = await overpass(`[out:json][timeout:60];relation(${relId});way(r);out ids;`);
      const memberWayIds = new Set<number>(d2.elements.filter((e: any) => e.type === 'way').map((e: any) => e.id));
      for (const wid of Array.from(memberWayIds)) {
        if (!allWayIds.has(wid)) continue;
        if (!wayToRelations.has(wid)) wayToRelations.set(wid, []);
        wayToRelations.get(wid)!.push({ id: relId, name: relCandidates.get(relId)!.name });
      }
    }
  }
  console.log(`  ${wayToRelations.size} of our ${allWayIds.size} ways are members of a marked route relation.\n`);

  // Fetch significant park rings (same gate as the committed script: area >= MIN_PARK_AREA_M2) + coastline.
  console.log('Fetching park/garden rings + coastline for specialness check …');
  const bb = `${HAIFA_BBOX.latMin},${HAIFA_BBOX.lonMin},${HAIFA_BBOX.latMax},${HAIFA_BBOX.lonMax}`;
  const parkData = await overpass(`[out:json][timeout:180];(way["leisure"~"^(park|garden)$"]["name"](${bb});relation["leisure"~"^(park|garden)$"]["name"](${bb}););(._;>;);out geom;`);
  const wayById = new Map<number, number[][]>();
  for (const e of parkData.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, e.geometry.map((p: any) => [p.lat, p.lon]));
  const parkRings: Array<{ name: string; ring: number[][] }> = [];
  for (const e of parkData.elements) if (e.type === 'way') { const t = e.tags || {}; if (t.name && e.geometry && e.geometry.length >= 3) parkRings.push({ name: t.name, ring: wayById.get(e.id)! }); }
  function ringAreaM2(ring: number[][]): number {
    if (ring.length < 3) return 0;
    const lat0 = ring[0][0]; const mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    const xy = ring.map(p => [p[1] * mLon, p[0] * mLat]);
    let area = 0; for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; area += x1 * y2 - x2 * y1; }
    return Math.abs(area) / 2;
  }
  const significantParks = parkRings.filter(p => ringAreaM2(p.ring) >= MIN_PARK_AREA_M2);
  console.log(`  ${parkRings.length} named park/garden rings, ${significantParks.length} clear the ${MIN_PARK_AREA_M2}m² significance threshold.`);
  const coastData = await overpass(`[out:json][timeout:90];way["natural"="coastline"](${bb});out geom;`);
  const coastlinePts: number[][] = [];
  for (const e of coastData.elements) if (e.type === 'way' && e.geometry) for (const p of e.geometry) coastlinePts.push([p.lat, p.lon]);
  console.log(`  ${coastlinePts.length} coastline points.\n`);

  function isNearSpecial(pts: number[][]): boolean {
    for (const p of pts) {
      for (const pr of significantParks) for (const rp of pr.ring) if (hav(p, rp) < SPECIALNESS_RADIUS_M) return true;
      for (const cp of coastlinePts) if (hav(p, cp) < SPECIALNESS_RADIUS_M) return true;
    }
    return false;
  }

  // ─── Per-route analysis ───
  type Row = {
    name: string; distance: number; activityType: string;
    dedicatedPct: number; ordinaryPct: number; otherPct: number;
    markedTrail: boolean; markedTrailNames: string[];
    nameHasShvil: boolean;
    special: boolean;
    classification: string;
    gateKeep: boolean; gateReason: string;
    lengthFloor: number; distToFloor: number;
  };
  const rows: Row[] = [];
  for (const r of routes) {
    const wayIds = effectiveWayIds(r);
    let dedicatedLen = 0, ordinaryLen = 0, otherLen = 0;
    const trailRels = new Set<string>();
    let nameHasShvil = /^שביל/.test(r.name) || r.name.includes(' שביל ');
    for (const wid of wayIds) {
      const w = wayData.get(wid);
      if (!w) continue;
      if (DEDICATED.has(w.highway)) dedicatedLen += w.lengthM;
      else if (ORDINARY_STREET.has(w.highway)) ordinaryLen += w.lengthM;
      else otherLen += w.lengthM;
      if (w.name && /^שביל/.test(w.name)) nameHasShvil = true;
      const rels = wayToRelations.get(wid);
      if (rels) for (const rel of rels) trailRels.add(rel.name);
    }
    const totalLen = dedicatedLen + ordinaryLen + otherLen || 1;
    const dedicatedPct = Math.round((dedicatedLen / totalLen) * 1000) / 10;
    const ordinaryPct = Math.round((ordinaryLen / totalLen) * 1000) / 10;
    const otherPct = Math.round((otherLen / totalLen) * 1000) / 10;
    const markedTrail = trailRels.size > 0;
    const pts = (r.path || []).map(p => [p.lat, p.lng]);
    const special = isNearSpecial(pts);

    let classification: string;
    if (markedTrail) classification = 'genuine recreational (marked trail member)';
    else if (dedicatedPct >= 70) classification = special || r.distance >= 800 ? 'genuine recreational (dedicated infra)' : 'short dedicated-infra fragment';
    else if (special && dedicatedPct >= 30) classification = 'genuine recreational (park/coast-adjacent)';
    else if (ordinaryPct >= 70) classification = 'ordinary named street';
    else classification = r.distance < 500 ? 'short fragment, mixed/ambiguous' : 'mixed, ambiguous';

    // FINALIZED gate (David, 23.08.2026): recreational-character test unchanged; length
    // floor now applies to trail members too — 600m for marked-trail, 800m for standalone.
    // No length exemption for being a trail member.
    const qualifiesByType = markedTrail || dedicatedPct >= 50 || (special && dedicatedPct >= 20);
    const lengthFloor = markedTrail ? 600 : 800;
    const qualifiesByLength = r.distance >= lengthFloor;
    const gateKeep = qualifiesByType && qualifiesByLength;
    const gateReason = !qualifiesByType
      ? `fails type test (dedicated ${dedicatedPct}%, marked-trail ${markedTrail}, special ${special})`
      : !qualifiesByLength
        ? `fails length floor (${r.distance}m < ${lengthFloor}m${markedTrail ? ', marked-trail' : ', standalone'})`
        : 'passes';
    const distToFloor = r.distance - lengthFloor;

    rows.push({ name: r.name, distance: r.distance, activityType: r.activityType, dedicatedPct, ordinaryPct, otherPct, markedTrail, markedTrailNames: Array.from(trailRels), nameHasShvil, special, classification, gateKeep, gateReason, lengthFloor, distToFloor });
  }

  fs.writeFileSync('/tmp/haifa-named-segment-rows.json', JSON.stringify(rows, null, 2));
  rows.sort((a, b) => a.distance - b.distance);
  console.log('=== Per-route audit (sorted by length) ===\n');
  console.log('Name'.padEnd(40) + 'Len'.padStart(6) + '  Activity'.padStart(10) + '  Dedic%'.padStart(9) + '  Ord%'.padStart(7) + '  Trail'.padStart(7) + '  Special'.padStart(9) + '  Classification');
  for (const row of rows) {
    console.log(
      row.name.padEnd(40) + `${row.distance}m`.padStart(6) +
      `  ${row.activityType}`.padStart(10) +
      `  ${row.dedicatedPct}%`.padStart(9) +
      `  ${row.ordinaryPct}%`.padStart(7) +
      `  ${row.markedTrail ? 'YES' : '-'}`.padStart(7) +
      `  ${row.special ? 'YES' : '-'}`.padStart(9) +
      `  ${row.classification}`
    );
  }

  console.log('\n=== Classification summary ===');
  const classCounts: Record<string, number> = {};
  for (const row of rows) classCounts[row.classification] = (classCounts[row.classification] || 0) + 1;
  console.log(JSON.stringify(classCounts, null, 2));

  console.log('\n=== FINALIZED gate: KEEP if (dedicated>=50% OR marked-trail OR (special AND dedicated>=20%)) AND (length >= 600m if marked-trail, else >= 800m) ===');
  const kept = rows.filter(r => r.gateKeep);
  const dropped = rows.filter(r => !r.gateKeep);
  console.log(`KEEP: ${kept.length}/${rows.length}`);
  for (const r of kept) console.log(`  ✓ ${r.name}  ${r.distance}m  (${r.gateReason})`);
  console.log(`\nDROP: ${dropped.length}/${rows.length}`);
  for (const r of dropped) console.log(`  ✗ ${r.name}  ${r.distance}m  (${r.gateReason})`);

  console.log(`\n=== Borderline cases (within 50m of the applicable length floor, or composition within 5pts of the 50%/20% type thresholds) ===`);
  for (const r of rows) {
    const nearLengthFloor = Math.abs(r.distToFloor) <= 50;
    const nearDedicatedThreshold = Math.abs(r.dedicatedPct - 50) <= 5;
    const nearSpecialThreshold = r.special && Math.abs(r.dedicatedPct - 20) <= 5;
    if (nearLengthFloor || nearDedicatedThreshold || nearSpecialThreshold) {
      const flags = [nearLengthFloor ? `length ${r.distance}m vs ${r.lengthFloor}m floor (${r.distToFloor >= 0 ? '+' : ''}${r.distToFloor}m)` : null, nearDedicatedThreshold ? `dedicated ${r.dedicatedPct}% vs 50% threshold` : null, nearSpecialThreshold ? `dedicated ${r.dedicatedPct}% vs 20% special-adjacent threshold` : null].filter(Boolean).join('; ');
      console.log(`  ⚠ ${r.name}  ${r.distance}m  ${r.gateKeep ? 'KEEP' : 'DROP'}  — ${flags}`);
    }
  }

  // ─── Stitching-fragment check: group by common "שביל X" trail-name prefix OR exact
  // duplicate name (a same-name stitch requires an exact string match — a duplicate
  // exact name that DIDN'T merge is itself evidence of a real gap, same as the prefix
  // case) ───
  console.log('\n\n=== Stitching-fragment check ===');
  const trailGroups = new Map<string, RouteDoc[]>();
  for (const r of routes) {
    const m = r.name.match(/^(שביל[^-]*)/);
    const key = m ? m[1].trim() : r.name;
    if (!trailGroups.has(key)) trailGroups.set(key, []); trailGroups.get(key)!.push(r);
  }
  for (const [key, group] of Array.from(trailGroups.entries())) {
    if (group.length < 2) continue;
    console.log(`\nTrail-name group "${key}" — ${group.length} separate docs:`);
    for (const g of group) console.log(`  ${g.name}  ${g.distance}m  [${g.id}]`);
    // Check pairwise endpoint proximity.
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i].path!, b = group[j].path!;
      const endpoints = [[a[0].lat, a[0].lng], [a[a.length - 1].lat, a[a.length - 1].lng]];
      const endpoints2 = [[b[0].lat, b[0].lng], [b[b.length - 1].lat, b[b.length - 1].lng]];
      let minGap = Infinity;
      for (const p of endpoints) for (const q of endpoints2) minGap = Math.min(minGap, hav(p, q));
      console.log(`    "${group[i].name}" <-> "${group[j].name}": nearest-endpoint gap = ${Math.round(minGap)}m`);
    }
  }

  console.log('\n=== AUDIT COMPLETE — read-only, no writes ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
