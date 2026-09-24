// READ-ONLY. No writes.
// Trail-relation bucket (39 docs): every doc is BY CONSTRUCTION a member of a marked
// route relation (route=hiking|foot|walking|running — see geo-discovery-routes.ts:481)
// — that's literally how they were discovered, so "marked-trail member" is trivially
// true for all 39. Under the finalized gate, "recreational character" is therefore
// unconditionally satisfied for every trail doc; the ONLY variable is the 600m length
// floor (previously no floor at all for trail members — this is the key change).
// Also: cross-bucket identical-name grouping (53 named-segment + 39 trail docs).
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';
const TRAIL_LENGTH_FLOOR = 600;

async function main() {
  const db = initFb();
  const snap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const trailDocs = docs.filter(d => d.source?.externalId?.startsWith('osm:rel/'));
  console.log(`=== Trail-relation bucket: ${trailDocs.length} docs ===\n`);
  console.log('Name'.padEnd(45) + 'Length'.padStart(8) + '  Verdict'.padStart(9) + '  DistToFloor');
  trailDocs.sort((a, b) => a.distance - b.distance);
  let trailKeep = 0;
  for (const d of trailDocs) {
    const keep = d.distance >= TRAIL_LENGTH_FLOOR;
    if (keep) trailKeep++;
    const diff = d.distance - TRAIL_LENGTH_FLOOR;
    const borderline = Math.abs(diff) <= 50 ? '  ⚠ BORDERLINE' : '';
    console.log(`${d.name.padEnd(45)}${(d.distance + 'm').padStart(8)}  ${(keep ? 'KEEP' : 'DROP').padStart(9)}  ${diff >= 0 ? '+' : ''}${diff}m${borderline}`);
  }
  console.log(`\nTrail bucket: KEEP ${trailKeep}/${trailDocs.length}, DROP ${trailDocs.length - trailKeep}/${trailDocs.length}`);

  console.log(`\n=== The four "שביל חיפה - הדר עליון ורמת הדר" fragments specifically ===`);
  const targetRel = trailDocs.filter(d => d.name.includes('הדר עליון ורמת הדר'));
  for (const d of targetRel) {
    const keep = d.distance >= TRAIL_LENGTH_FLOOR;
    console.log(`  ${d.id}  ${d.name}  ${d.distance}m  -> ${keep ? 'KEEP' : 'DROP'} (floor ${TRAIL_LENGTH_FLOOR}m)`);
  }

  // ─── Cross-bucket identical-name groups (53 named-segment + 39 trail) ───
  console.log(`\n\n=== Cross-bucket identical-name groups (named-segment + trail, informational only) ===`);
  const isLoop = (d: any) => d.routeShape === 'loop';
  const isCycling = (d: any) => d.activityType === 'cycling';
  const isPark = (d: any) => typeof d.name === 'string' && d.name.startsWith('הקפת ');
  const isOtherLoop = (d: any) => typeof d.name === 'string' && d.name.startsWith('לולאת ');
  const relevant = docs.filter(d => !isLoop(d) && !isCycling(d) && !isPark(d) && !isOtherLoop(d)); // named-segment (53) + trail (39) = 92
  console.log(`(${relevant.length} docs in scope: named-segment + trail combined)`);
  const byName = new Map<string, any[]>();
  for (const d of relevant) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name)!.push(d); }
  let groupCount = 0;
  for (const [name, group] of Array.from(byName.entries())) {
    if (group.length < 2) continue;
    groupCount++;
    console.log(`\n"${name}" — ${group.length} docs:`);
    for (const d of group) {
      const bucket = d.source.externalId.startsWith('osm:rel/') ? 'trail' : 'named-segment';
      console.log(`  ${d.id}  [${bucket}]  ${d.distance}m  status=${d.status}`);
    }
  }
  console.log(`\n${groupCount} duplicate-name group(s) found across both buckets.`);
  console.log('\n=== COMPLETE — read-only, no writes ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
