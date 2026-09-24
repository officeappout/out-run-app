// READ-ONLY. Checks every collection that could hold a dangling reference to the 14
// Haifa park-loop route IDs about to be removed (13 hard-delete + 1 archived). No writes.
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const DELETE_IDS = [
  '0arTwkOnlK3rvNqh5K9H', '2t8j7BmjwagCOdhqoxBO', '5qd1HWr0fkw6kHsjWzRa', '7HqEKVjbHzMzZbw2OmHc',
  'GPOgLShWca551I0KCInx', 'H0uzsinpKK0jUje6GDVM', 'HymTMD9lckO959MHWpv8', 'PFH1hOgcwPP5CTgsRi6c',
  'PgpBcxXj2HJlmUxkWRXK', 'muF5Jd97zNaHaui8QMxR', 'tDhlGTynusMi4K8H4DBc', 'uJbCVktXixlZqkEEkdW3',
  'xX4gMEr8tleqWd8Q1xjh',
];
const ARCHIVE_ID = '6shDNCtlTqSLfygsjC0b';
const ALL_14 = [...DELETE_IDS, ARCHIVE_ID];
const HAIFA_CITY = 'חיפה';
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';

async function main() {
  const db = initFb();
  console.log('=== Referential-integrity check for 14 Haifa park-loop route IDs (read-only) ===\n');

  // 1) curated_routes — re-confirm still 0 for Haifa.
  const curated = await db.collection('curated_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const curatedByCity = await db.collection('curated_routes').where('city', '==', HAIFA_CITY).get();
  console.log(`1) curated_routes for Haifa: by authorityId=${curated.size}, by city=${curatedByCity.size}`);

  // 2) climb_segments.routeIds array-contains-any our 14 ids.
  const climbs = await db.collection('climb_segments').where('routeIds', 'array-contains-any', ALL_14).get();
  console.log(`2) climb_segments referencing any of the 14 route IDs: ${climbs.size}`);
  for (const d of climbs.docs) console.log(`   ${d.id}  routeIds=${JSON.stringify(d.data().routeIds)}`);

  // 3) street_segments.officialRouteId broadcast back-refs.
  const segs = await db.collection('street_segments').where('officialRouteId', 'in', ALL_14).get();
  console.log(`3) street_segments broadcast back-refs to any of the 14 route IDs: ${segs.size}`);
  const segsByRoute: Record<string, number> = {};
  for (const d of segs.docs) { const rid = d.data().officialRouteId; segsByRoute[rid] = (segsByRoute[rid] || 0) + 1; }
  console.log('   ' + JSON.stringify(segsByRoute));

  // 4) edit_requests, pending, entityType='route', entityId in our 14.
  const edits = await db.collection('edit_requests').where('entityType', '==', 'route').where('entityId', 'in', ALL_14).get();
  console.log(`4) edit_requests referencing any of the 14 route IDs: ${edits.size}`);
  for (const d of edits.docs) console.log(`   ${d.id}  entityId=${d.data().entityId} status=${d.data().status}`);

  // 5) workouts.routeId
  const workouts = await db.collection('workouts').where('routeId', 'in', ALL_14).get();
  console.log(`5) workouts referencing any of the 14 route IDs: ${workouts.size}`);
  for (const d of workouts.docs) console.log(`   ${d.id}  routeId=${d.data().routeId}`);

  // 6) planned_sessions.routeId
  const planned = await db.collection('planned_sessions').where('routeId', 'in', ALL_14).get();
  console.log(`6) planned_sessions referencing any of the 14 route IDs: ${planned.size}`);
  for (const d of planned.docs) console.log(`   ${d.id}  routeId=${d.data().routeId}`);

  // 7) group_sessions.routeId
  const groupSessions = await db.collection('group_sessions').where('routeId', 'in', ALL_14).get();
  console.log(`7) group_sessions referencing any of the 14 route IDs: ${groupSessions.size}`);
  for (const d of groupSessions.docs) console.log(`   ${d.id}  routeId=${d.data().routeId}`);

  // 8) community_groups — nested fields, fetch all + filter client-side (collection is small, B2B feature).
  const groupsSnap = await db.collection('community_groups').get();
  const groupHits: string[] = [];
  for (const d of groupsSnap.docs) {
    const g: any = d.data();
    if (g.meetingLocation?.routeId && ALL_14.includes(g.meetingLocation.routeId)) groupHits.push(`${d.id} (meetingLocation)`);
    for (const slot of g.scheduleSlots || []) if (slot?.location?.routeId && ALL_14.includes(slot.location.routeId)) groupHits.push(`${d.id} (scheduleSlots)`);
  }
  console.log(`8) community_groups referencing any of the 14 route IDs (of ${groupsSnap.size} total groups): ${groupHits.length}`);
  for (const h of groupHits) console.log(`   ${h}`);

  // 9) community_events.location.routeId
  const eventsSnap = await db.collection('community_events').get();
  const eventHits: string[] = [];
  for (const d of eventsSnap.docs) {
    const e: any = d.data();
    if (e.location?.routeId && ALL_14.includes(e.location.routeId)) eventHits.push(d.id);
  }
  console.log(`9) community_events referencing any of the 14 route IDs (of ${eventsSnap.size} total events): ${eventHits.length}`);
  for (const h of eventHits) console.log(`   ${h}`);

  // 10) route_adjacency — Haifa edges referencing any of the 14 route IDs.
  const adjSnap = await db.collection('route_adjacency').where('cityName', '==', HAIFA_CITY).get();
  const adjHits = adjSnap.docs.filter(d => ALL_14.includes(d.data().routeIdA) || ALL_14.includes(d.data().routeIdB));
  console.log(`10) route_adjacency for חיפה: ${adjSnap.size} total edges, ${adjHits.length} reference one of the 14 route IDs`);
  for (const d of adjHits) console.log(`   ${d.id}  routeIdA=${d.data().routeIdA} routeIdB=${d.data().routeIdB}`);

  console.log('\n=== Check complete — nothing modified ===');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
