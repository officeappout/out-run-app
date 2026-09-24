/**
 * READ-ONLY investigation script — Sderot pilot park-add flow (23.09.2026).
 * Prints STRUCTURAL/status fields only — no names, no user IDs, no free-text
 * content (park name, description, comments) — per the audit's production
 * query constraint (counts / field-presence only, no PII).
 *
 * Checks:
 *  1. Most recently created `parks` docs — field presence for
 *     published/contentStatus/authorityId/neighborhoodId/origin/image vs imageUrl.
 *  2. Most recent `user_contributions` (type=new_location) — field presence
 *     for authorityId/photoUrl/status.
 *  3. Sderot's `authorities` doc — does it have boundaryGeoJSON or
 *     coordinates+radiusKm (needed for resolveAuthorityForPoint to work)?
 *  4. Aggregate count: how many `parks` docs are missing authorityId (scale
 *     context only, no doc content).
 *
 * Run: npx tsx --env-file=.env.local scripts/_investigate-sderot-park-flow.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  console.log('\n=== 1. Most recent `parks` docs (field presence only) ===');
  const parksSnap = await db.collection('parks').orderBy('createdAt', 'desc').limit(5).get();
  for (const doc of parksSnap.docs) {
    const d = doc.data();
    console.log({
      id: doc.id,
      createdAt: d.createdAt?.toDate?.() ?? d.createdAt ?? null,
      hasPublished: 'published' in d,
      publishedValue: d.published ?? null,
      hasContentStatus: 'contentStatus' in d,
      contentStatusValue: d.contentStatus ?? null,
      status: d.status ?? null,
      hasOrigin: 'origin' in d,
      originValue: d.origin ?? null,
      hasCreatedByUser: 'createdByUser' in d,
      hasAuthorityId: 'authorityId' in d,
      authorityIdValue: d.authorityId ?? null,
      hasNeighborhoodId: 'neighborhoodId' in d,
      hasImageField: 'image' in d && !!d.image,
      hasImageUrlField: 'imageUrl' in d && !!d.imageUrl,
      hasLocation: !!d.location && Number.isFinite(d.location?.lat) && Number.isFinite(d.location?.lng),
    });
  }

  console.log('\n=== 2. Most recent `user_contributions` (type=new_location) — field presence only ===');
  // No composite index for (type, createdAt) exists in production — filter
  // client-side instead of adding one (this script is read-only / throwaway).
  const contribAllSnap = await db
    .collection('user_contributions')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const contribDocs = contribAllSnap.docs.filter((d) => d.data().type === 'new_location').slice(0, 5);
  for (const doc of contribDocs) {
    const d = doc.data();
    let photoHost: string | null = null;
    try { photoHost = d.photoUrl ? new URL(d.photoUrl).host : null; } catch { photoHost = 'unparsable'; }
    console.log({
      id: doc.id,
      createdAt: d.createdAt?.toDate?.() ?? d.createdAt ?? null,
      status: d.status ?? null,
      hasAuthorityId: 'authorityId' in d,
      authorityIdValue: d.authorityId ?? null,
      hasPhotoUrl: 'photoUrl' in d && !!d.photoUrl,
      photoUrlHost: photoHost,
      approvedParkId: d.approvedParkId ?? null,
    });
  }

  console.log('\n=== 3. Sderot authority doc — boundary data presence ===');
  const authSnap = await db.collection('authorities').where('name', '==', 'שדרות').limit(3).get();
  if (authSnap.empty) {
    console.log('No exact match on name === "שדרות" — scanning type:city for a substring match...');
    const allCities = await db.collection('authorities').where('type', '==', 'city').get();
    const matches = allCities.docs.filter((d) => String(d.data().name || '').includes('שדרות'));
    console.log(`Found ${matches.length} candidate(s) by substring match.`);
    for (const doc of matches) {
      const d = doc.data();
      console.log({
        id: doc.id,
        hasBoundaryGeoJSON: 'boundaryGeoJSON' in d && !!d.boundaryGeoJSON,
        hasCoordinates: 'coordinates' in d && !!d.coordinates,
        hasRadiusKm: 'radiusKm' in d && !!d.radiusKm,
        status: d.status ?? null,
        isActiveClient: d.isActiveClient ?? null,
      });
    }
  } else {
    for (const doc of authSnap.docs) {
      const d = doc.data();
      console.log({
        id: doc.id,
        hasBoundaryGeoJSON: 'boundaryGeoJSON' in d && !!d.boundaryGeoJSON,
        hasCoordinates: 'coordinates' in d && !!d.coordinates,
        hasRadiusKm: 'radiusKm' in d && !!d.radiusKm,
        status: d.status ?? null,
        isActiveClient: d.isActiveClient ?? null,
      });
    }
  }

  console.log('\n=== 4. Aggregate counts (no doc content) ===');
  const allParksSnap = await db.collection('parks').select('authorityId', 'published', 'contentStatus').get();
  let missingAuthority = 0;
  let missingPublishedAndContentStatus = 0;
  for (const doc of allParksSnap.docs) {
    const d = doc.data();
    if (!d.authorityId) missingAuthority++;
    if (d.published === undefined && d.contentStatus === undefined) missingPublishedAndContentStatus++;
  }
  console.log({
    totalParks: allParksSnap.size,
    missingAuthorityId: missingAuthority,
    missingBothPublishedAndContentStatus: missingPublishedAndContentStatus,
  });

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
