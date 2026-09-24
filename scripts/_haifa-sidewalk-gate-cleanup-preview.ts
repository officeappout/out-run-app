// READ-ONLY. No writes. Matches the fully-fixed sidewalk-gate dry-run's 65 surviving
// candidates (name+length, extracted programmatically from the clean dry-run's own
// printed output — both the sidewalk-exclusion fix AND the trail-bonus-precedence
// bugfix applied) against LIVE Haifa official_routes, by name+length with drift
// tolerance. Whatever doesn't match is the drop-preview set. Verifies every one is
// status:pending/published:false (STOP condition if not — "we were surprised once"),
// checks downstream references (same collection set as every prior cleanup this
// session), then previews the delete. HOLD — no --apply in this script.
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';

// Exact 65 kept candidates from the final clean dry-run (both sidewalk-gate fixes
// applied), extracted programmatically from its own printed candidate list — not
// hand-transcribed, to avoid the transcription gaps found earlier this session.
const KEPT: Array<[string, number]> = [
  ['הקפת גן המייסדים', 1376], ['הקפת גן לוקיי', 973], ['הקפת גן אופירה', 1112],
  ['הקפת טכניון הגן האקולוגי', 958], ['הקפת גן אזולאי', 805], ['הקפת ספורטק חיפה', 600],
  ['הקפת פארק הלוחם היהודי', 554], ['הקפת גן קיסלק', 580], ['הקפת גן אלכס', 518],
  ['לולאת פינת גן', 513], ['הקפת גן האם', 410], ['שביל מסומן חיפה', 2963],
  ['נחל עמירם', 2798], ['שביל מסומן חיפה', 2642], ['מורדות כרמליה', 2642],
  ['שביל מסומן חיפה', 2426], ['נחל עמיק', 1772], ['דרך חיץ אש', 2834],
  ['שביל מסומן חיפה', 1789], ['המעונות', 1969], ['נחל עובדיה', 3218],
  ['ואדי ראש-מיה', 1798], ['שביל מסומן חיפה', 3123], ['ואדי עובדיה', 3035],
  ['מסדרון אקולוגי גבעת העיזים', 1367], ['שביל כרמל צרפתי', 2062], ['ואדי אבן', 1337],
  ['ואדי עמירם', 2371], ['קו הדלק הלבן', 1727], ['טיילת חוף הכרמל', 2047],
  ['יער הכרמליתים', 1275], ['ואדי התשבי', 1018], ['נחל זיו ונחל רמז', 1589],
  ['נחל נדר', 914], ['דרך נוף עובדיה', 1727], ['שביל רמת אלון', 1097],
  ['ואדי אחוזה תחתון', 892], ['Bahai Garden Upward tour', 918], ['שביל מסומן חיפה', 1764],
  ['טיילת איינשטיין', 1150], ['היער', 1531], ['נחל שיח', 1289], ['שביל מסומן חיפה', 1659],
  ['מורדות אחוזה', 1291], ['שביל סביוני הכרמל', 902], ['מורדות נווה שאנן', 827],
  ['Wadi Vardiya', 1352], ['סעדיה פז', 1298], ['ואדי נדר', 758], ['ואדי שיח', 678],
  ['הטיילת', 1005], ['יפה נוף', 880], ['שביל מסומן חיפה', 1179], ['אסתר המלכה', 1044],
  ['ואדי רמז', 1131], ['טיילת קרית אליעזר', 1116], ['שביל מסומן חיפה', 749],
  ['שביל מסומן חיפה', 661], ['ואדי בן-דור', 862], ['תל אהרון', 965], ['מורדות כבביר', 752],
  ['שביל הפסגה', 679], ['היסטורי', 781], ['ואדי זיו', 616], ['דרך התיכונים', 606],
];
const DRIFT_TOLERANCE_M = 40;

function classify(d: any): string {
  if (d.routeShape === 'loop' && typeof d.name === 'string' && d.name.startsWith('הקפת ')) return 'park loop';
  if (d.routeShape === 'loop') return 'other loop';
  if (d.source?.externalId?.startsWith('osm:rel/')) return 'trail';
  if (d.activityType === 'cycling') return 'cycling';
  return 'named segment';
}

async function main() {
  const db = initFb();
  console.log(`=== Haifa sidewalk-gate cleanup preview (post BOTH fixes) — READ-ONLY ===\n`);
  const snap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Live Haifa official_routes: ${allDocs.length}`);
  console.log(`Fresh dry-run kept candidates: ${KEPT.length}\n`);

  // Match each LIVE doc against the KEPT list (by name+length, drift-tolerant). Unmatched = drop candidate.
  const usedKeptIdx = new Set<number>();
  const dropCandidates: any[] = [];
  const keptDocs: any[] = [];
  for (const d of allDocs) {
    const len = d.distance;
    let bestIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < KEPT.length; i++) {
      if (usedKeptIdx.has(i)) continue;
      const [name, l] = KEPT[i];
      if (name !== d.name) continue;
      const delta = Math.abs(l - len);
      if (delta <= DRIFT_TOLERANCE_M && delta < bestDelta) { bestDelta = delta; bestIdx = i; }
    }
    if (bestIdx >= 0) { usedKeptIdx.add(bestIdx); keptDocs.push(d); }
    else dropCandidates.push(d);
  }

  console.log(`Matched to a fresh KEEP candidate: ${keptDocs.length}`);
  console.log(`NOT matched (drop-preview set): ${dropCandidates.length}\n`);
  const unmatchedKept = KEPT.filter((_, i) => !usedKeptIdx.has(i));
  if (unmatchedKept.length) {
    console.log(`⚠️ ${unmatchedKept.length} fresh KEEP candidates found no live doc match (likely a genuinely NEW discovery not yet in Firestore — informational only, does not affect the drop-preview):`);
    for (const [n, l] of unmatchedKept) console.log(`   "${n}" ${l}m`);
    console.log('');
  }

  console.log(`=== DROP-PREVIEW SET (${dropCandidates.length}) — by type ===`);
  const dropByType: Record<string, number> = {};
  for (const d of dropCandidates) { const c = classify(d); dropByType[c] = (dropByType[c] || 0) + 1; }
  console.log(JSON.stringify(dropByType, null, 2));
  console.log('');
  for (const d of dropCandidates) console.log(`  ${d.id}  ${d.name}  ${d.distance}m  [${classify(d)}]`);

  console.log(`\n=== SAFETY CHECK: status/published for the drop-preview set ===`);
  const statusCounts: Record<string, number> = {};
  const publishedCounts: Record<string, number> = {};
  for (const d of dropCandidates) { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; publishedCounts[String(d.published)] = (publishedCounts[String(d.published)] || 0) + 1; }
  console.log(`status: ${JSON.stringify(statusCounts)}`);
  console.log(`published: ${JSON.stringify(publishedCounts)}`);
  const notSafe = dropCandidates.filter(d => d.status !== 'pending' || d.published === true);
  if (notSafe.length) {
    console.log(`\n🛑 STOP — ${notSafe.length} of the drop-preview set are NOT pending/unpublished:`);
    for (const d of notSafe) console.log(`   NOT SAFE: ${d.id}  ${d.name}  status=${d.status} published=${d.published}`);
  } else {
    console.log(`✅ SAFE — all ${dropCandidates.length} are status:pending, published:false.`);
  }

  if (dropCandidates.length) {
    console.log(`\n=== Reference check: street_segments, route_adjacency, downstream collections ===`);
    const ids = dropCandidates.map(d => d.id);
    const CHUNK = 30;
    let segsTotal = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const segs = await db.collection('street_segments').where('officialRouteId', 'in', chunk).get();
      segsTotal += segs.size;
    }
    console.log(`street_segments broadcast back-refs: ${segsTotal} (expected 0 — pending routes are never broadcast)`);

    const adjSnap = await db.collection('route_adjacency').where('cityName', '==', 'חיפה').get();
    const adjHits = adjSnap.docs.filter(d => ids.includes((d.data() as any).routeIdA) || ids.includes((d.data() as any).routeIdB));
    console.log(`route_adjacency edges referencing the drop set: ${adjHits.length} (of ${adjSnap.size} total Haifa edges)`);

    for (const [coll, field] of [['workouts', 'routeId'], ['planned_sessions', 'routeId'], ['group_sessions', 'routeId'], ['curated_routes', 'sourceOfficialRouteId'], ['edit_requests', 'entityId']] as const) {
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
    const climbSnap = await db.collection('climb_segments').get();
    let climbHits = 0;
    for (const d of climbSnap.docs) { const c: any = d.data(); if (Array.isArray(c.routeIds) && c.routeIds.some((r: string) => ids.includes(r))) climbHits++; }
    console.log(`climb_segments.routeIds references: ${climbHits} (of ${climbSnap.size} total)`);
  }

  console.log(`\n${dropCandidates.length} would be deleted. ${keptDocs.length} remain untouched.`);
  console.log('\n=== PREVIEW COMPLETE — read-only, no writes. HOLD for explicit --apply go. ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
