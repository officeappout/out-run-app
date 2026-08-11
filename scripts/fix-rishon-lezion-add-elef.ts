#!/usr/bin/env npx tsx
/**
 * scripts/fix-rishon-lezion-add-elef.ts
 *
 * Rishon LeZion spot-check follow-up — adds the single net-new residential
 * neighborhood found when checking the picker's existing 40-entry Rishon
 * LeZion list against the city's own official page
 * (rishonlezion.muni.il/Activities/Statistical/Pages/CityNeighborhoods.aspx).
 *
 * מתחם האלף — a mixed-use development (~5,400 planned housing units) west
 * of the city, genuinely residential. Coordinate via OSM Nominatim
 * (landuse=construction node), no municipal GIS layer available for
 * Rishon LeZion.
 *
 * Also found but NOT added here (David-confirmed, standing rule — official
 * municipal source is authoritative, no Wikipedia-only names):
 *   - 4 non-residential official-list names: מעויין שורק (Sorek industrial
 *     zone), מב"ת צפון + מב"ת מערב (old/new industrial zones), מכוני מחקר
 *     (Volcani Institute / Agricultural Research Administration campus).
 *   - 5 existing picker entries that don't match any official name: מערב
 *     ראשון, מרכז העיר, מזרח ראשון (coarse legacy labels), גורדון, כפר אריה
 *     (not on the official list at all) — left untouched, not deleted.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-rishon-lezion-add-elef.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-rishon-lezion-add-elef.ts
 */

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const RISHON_LEZION_AUTHORITY_ID = 'sWujgA3cuZiNJSBGQnpm';
const NAME = 'מתחם האלף';
const LAT = 31.985895;
const LON = 34.7456673;

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Adding ${NAME} to Rishon LeZion (${RISHON_LEZION_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', RISHON_LEZION_AUTHORITY_ID)
    .get();
  const exists = existingSnap.docs.some((d) => d.data().name === NAME);

  if (exists) {
    console.log(`⏭  SKIP (already exists): ${NAME}`);
    return;
  }

  const doc = {
    name: NAME,
    type: 'neighborhood' as const,
    parentAuthorityId: RISHON_LEZION_AUTHORITY_ID,
    logoUrl: null,
    managerIds: [] as string[],
    userCount: 0,
    status: 'inactive' as const,
    isActiveClient: false,
    coordinates: { lat: LAT, lng: LON },
    pipelineStatus: 'draft' as const,
    unitCount: 0,
    hierarchyLevel: 2,
    vertical: 'municipal' as const,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (DRY_RUN) {
    console.log(`  WOULD CREATE: ${NAME} @ ${LAT},${LON}`);
  } else {
    const ref = await db.collection('authorities').add(doc);
    console.log(`✓  CREATED: ${NAME} → ${ref.id}`);
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
