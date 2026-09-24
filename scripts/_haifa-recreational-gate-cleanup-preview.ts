// READ-ONLY. No writes. Re-identifies the audit's exact 28-doc drop list (21 named-
// segment + 7 trail-relation) by name+length match against LIVE Haifa Firestore data,
// verifies every one is status:pending/published:false (STOP condition if not), checks
// for dangling references (street_segments broadcast, route_adjacency, user-side —
// same collections checked for the park-loop cleanup), then previews the delete: exactly
// which 28 docs, confirming the 64 survivors + all other Haifa docs stay untouched.
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';

// The audit's exact drop list — [name, length] pairs, disambiguated by length since
// several names repeat (חסן שוקרי, שביל מסומן חיפה, etc.).
const NAMED_SEGMENT_DROPS: Array<[string, number]> = [
  ['פרישמן', 65], ['Nesher park unpaved path', 99], ['גן הפסלים', 128], ['רחבת בן-ארצי', 133],
  ['כורש', 181], ['אוליפנט', 209], ['מנדלי מוכר ספרים', 224], ['מנחם', 230],
  ['שניים בנובמבר', 261], ['מבצר ראשמיה', 269], ['אז"ר', 306], ['חטיבת עודד', 312],
  ['יער הכרמליתים', 361], ['חסן שוקרי', 395], ['חסן שוקרי', 441], ['עמל', 502],
  ['מרטין בובר', 559], ['נחמיה', 626], ['פבזנר', 678], ['אל כנסא', 732], ['צביה ויצחק', 957],
];
const TRAIL_DROPS: Array<[string, number]> = [
  ['שביל חיפה - הדר עליון ורמת הדר', 412], ['Ovadia Caves', 426], ['שביל מסומן חיפה', 476],
  ['לב הקפמוס', 525], ['שביל חיפה - העיר התחתית', 561], ['שביל מסומן חיפה', 577], ['Wadi Vardiya', 586],
];

async function main() {
  const db = initFb();
  const snap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Total Haifa official_routes: ${allDocs.length}\n`);

  const targets = [...NAMED_SEGMENT_DROPS, ...TRAIL_DROPS];
  const matched: any[] = [];
  const unmatched: Array<[string, number]> = [];
  for (const [name, len] of targets) {
    const candidates = allDocs.filter(d => d.name === name);
    const exact = candidates.find(d => d.distance === len);
    if (exact) matched.push(exact);
    else {
      // Live OSM drift tolerance — allow a small length difference, pick nearest.
      const nearest = candidates.filter(d => Math.abs(d.distance - len) <= 30).sort((a, b) => Math.abs(a.distance - len) - Math.abs(b.distance - len))[0];
      if (nearest) { console.log(`  (matched "${name}" ${len}m to live doc at ${nearest.distance}m — within drift tolerance)`); matched.push(nearest); }
      else unmatched.push([name, len]);
    }
  }
  console.log(`Matched ${matched.length}/${targets.length} target drop docs.`);
  if (unmatched.length) { console.log(`⚠️ UNMATCHED (could not find a live doc for these — investigate before proceeding):`); for (const [n, l] of unmatched) console.log(`   "${n}" ${l}m`); }
  if (matched.length !== 28) { console.log(`\n🛑 STOP — expected exactly 28 matched docs, got ${matched.length}. Do not proceed.`); process.exit(1); }

  // Dedup check — did any two targets accidentally match the same doc id?
  const idSet = new Set(matched.map(d => d.id));
  if (idSet.size !== matched.length) console.log(`🛑 STOP — duplicate doc id matches found (${matched.length} targets, ${idSet.size} unique ids). Investigate.`);

  console.log(`\n=== SAFETY CHECK: status for all 28 ===`);
  const statusCounts: Record<string, number> = {};
  const publishedCounts: Record<string, number> = {};
  for (const d of matched) { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; publishedCounts[String(d.published)] = (publishedCounts[String(d.published)] || 0) + 1; }
  console.log(`status breakdown: ${JSON.stringify(statusCounts)}`);
  console.log(`published breakdown: ${JSON.stringify(publishedCounts)}`);
  const anyNotPending = matched.some(d => d.status !== 'pending' || d.published === true);
  console.log(anyNotPending ? '🛑 STOP — at least one target is NOT pending/unpublished.' : '✅ SAFE — all 28 are status:pending, published:false.');
  if (anyNotPending) {
    for (const d of matched) if (d.status !== 'pending' || d.published === true) console.log(`   NOT SAFE: ${d.id}  ${d.name}  status=${d.status} published=${d.published}`);
    process.exit(1);
  }

  console.log(`\n=== Reference check: street_segments, route_adjacency, user-side (28 ids) ===`);
  const ids = matched.map(d => d.id);
  const CHUNK = 30; // Firestore 'in' query limit
  let segsTotal = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const segs = await db.collection('street_segments').where('officialRouteId', 'in', chunk).get();
    segsTotal += segs.size;
  }
  console.log(`street_segments broadcast back-refs: ${segsTotal} (expected 0 — all 28 are pending, never broadcast)`);

  const adjSnap = await db.collection('route_adjacency').where('cityName', '==', 'חיפה').get();
  const adjHits = adjSnap.docs.filter(d => ids.includes(d.data().routeIdA) || ids.includes(d.data().routeIdB));
  console.log(`route_adjacency edges referencing any of the 28: ${adjHits.length} (of ${adjSnap.size} total Haifa edges)`);

  for (const [coll, field] of [['workouts', 'routeId'], ['planned_sessions', 'routeId'], ['group_sessions', 'routeId']] as const) {
    let hits = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const r = await db.collection(coll).where(field, 'in', chunk).get();
      hits += r.size;
    }
    console.log(`${coll}.${field} references: ${hits}`);
  }
  const groupsSnap = await db.collection('community_groups').get();
  let groupHits = 0;
  for (const d of groupsSnap.docs) {
    const g: any = d.data();
    if (g.meetingLocation?.routeId && ids.includes(g.meetingLocation.routeId)) groupHits++;
    for (const slot of g.scheduleSlots || []) if (slot?.location?.routeId && ids.includes(slot.location.routeId)) groupHits++;
  }
  console.log(`community_groups references: ${groupHits} (of ${groupsSnap.size} total groups)`);
  const eventsSnap = await db.collection('community_events').get();
  const eventHits = eventsSnap.docs.filter(d => ids.includes((d.data() as any).location?.routeId)).length;
  console.log(`community_events references: ${eventHits} (of ${eventsSnap.size} total events)`);

  console.log(`\n=== DELETE PREVIEW — exactly these 28 docs, nothing else ===`);
  for (const d of matched) console.log(`  ${d.id}  ${d.name}  ${d.distance}m`);

  const survivorCount = allDocs.length - matched.length;
  console.log(`\n${matched.length} to delete. ${survivorCount} remain untouched (everything not in the list above — includes the 64 gate survivors and every other Haifa route in the batch).`);
  console.log('\n=== PREVIEW COMPLETE — read-only, no writes ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
