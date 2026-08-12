#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-rehovot-reconcile.ts
 *
 * Rehovot neighborhood reconcile — first city of the second autonomous
 * Tier-1/50k+ mapping run (same policy as the prior batch: ship
 * confident items automatically, park anything uncertain, never ship a
 * guessed coordinate). Population confirmed: 155,475 (CBS, June 2026;
 * 14th-largest Israeli locality) — two independent source pulls agreed.
 *
 * Source: no official GIS/data.gov.il/ArcGIS dataset exists for Rehovot
 * neighborhoods specifically (checked and ruled out — an ArcGIS
 * "שכונות" FeatureServer that surfaces in search is Tel Aviv-Yafo's
 * layer, a false lead; CBS's own statistical-area layer has numeric
 * codes only, no neighborhood-name field). Fallback used: OSM/Overpass
 * (31 named neighbourhood/suburb/quarter nodes inside Rehovot's admin
 * boundary), cross-validated against municipal pages, a municipal press
 * article, Wikipedia, and Hamichlol wherever possible.
 *
 * Reconciliation: רחובות החדשה, רחובות ההולנדית, מרכז העיר (kept as an
 * umbrella — its "גוש רוזנסקי"/"גוש בנימין" sub-block language is
 * informal press terminology, not a structured split, so not split),
 * and שעריים all kept unchanged. פארק המדע (existing entry) confirmed
 * non-residential — a hi-tech/business park near the train station, not
 * a home neighborhood. Left completely untouched (non-destructive,
 * already-shipped entry), flagged in-code and in the final consolidated
 * report for David's manual removal/keep call, same treatment as Ramat
 * Gan's מתחם הבורסה and Ashkelon's המרינה/אגמים.
 *
 * 22 net-new entries shipped:
 *   - 10 HIGH confidence (municipal page/article + independent
 *     corroboration): קריית משה, שכונת דניה, שכונת מילצ׳ן, שכונת
 *     חבצלת, אושיות, נווה יהודה, מרמורק, אחוזות הנשיא, קרית ההגנה,
 *     שכונת אפרים.
 *   - 12 MEDIUM confidence (real OSM neighbourhood-point coordinate,
 *     single-source, no municipal/press corroboration found — still an
 *     acceptable coordinate tier per policy, not a guess): אבן גבירול,
 *     נאות כרמים, סלע, נווה עמית, גבעתי, מקוב, רמת אהרון, עין גנים,
 *     אבני חן, קרית דוד, היובל, חצרות המושבה.
 *
 * Excluded as non-residential (PARKED, never candidates): 6 Weizmann
 * Institute dormitory/staff-housing compounds tagged as OSM
 * neighbourhoods (מעונות שיין/וילנר/ברזיל/וולפסון/ויקס, נווה מץ).
 *
 * PARKED — ambiguous, not shipped: אזורי ויצמן (527m from the
 * institute/science-park zone, genuinely unclear residential vs.
 * institute-adjacent); רחובות המדע (OSM tag carries a stray "בית"/house
 * description, suggesting a single building or branded development, not
 * a traditional neighborhood).
 *
 * PARKED — unresolved / could not confidently geocode (not shipped):
 * הרצוג, הנשיא הראשון (both resolve only to streets on the Weizmann
 * dorm campus), מנוחה ונחלה (inconsistent OSM parent-neighbourhood
 * context), המדע as a standalone name (the one municipal article
 * mentioning it has an internal count/list mismatch — 7 stated vs 8
 * comma-delimited items), מזרח העיר (reads as a directional descriptor,
 * zero geocode match), כפר גבירול / אלון גבירול (zero match; may be the
 * same place as the resolved אבן גבירול under a historical name —
 * unconfirmed, not merged), קריית קרעטשניף / פסגת קרעטשניף / קריית
 * ויזניץ (Hasidic-enclave names with zero OSM/Nominatim hits), שרונה
 * (Wikipedia lists it combined as "שרונה/היובל" — היובל resolved
 * independently, שרונה's own half did not).
 *
 * No cluster/grouping field found — none added.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original REHOVOT block uses a 'reh-' prefix that matches none
 * of the real 'rv-' picker ids — same recurring pattern this run). Left
 * untouched, flagged for the later cleanup commit.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-rehovot-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-rehovot-reconcile.ts
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
const REHOVOT_AUTHORITY_ID = 'k89XhZKXPFirYY9VN5ur';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'קריית משה', lat: 31.8873081, lon: 34.7869891 },
  { name: 'שכונת דניה', lat: 31.8912180, lon: 34.8210647 },
  { name: 'שכונת מילצ׳ן', lat: 31.8821774, lon: 34.8127600 },
  { name: 'שכונת חבצלת', lat: 31.8755549, lon: 34.8164292 },
  { name: 'אושיות', lat: 31.8821514, lon: 34.8218915 },
  { name: 'נווה יהודה', lat: 31.9015376, lon: 34.8016028 },
  { name: 'מרמורק', lat: 31.8834309, lon: 34.8024603 },
  { name: 'אחוזות הנשיא', lat: 31.9073835, lon: 34.8216548 },
  { name: 'קרית ההגנה', lat: 31.8862406, lon: 34.8301622 },
  { name: 'שכונת אפרים', lat: 31.8948311, lon: 34.7989718 },
  { name: 'אבן גבירול', lat: 31.8958781, lon: 34.7733980 },
  { name: 'נאות כרמים', lat: 31.8903778, lon: 34.7781748 },
  { name: 'סלע', lat: 31.8901649, lon: 34.7962547 },
  { name: 'נווה עמית', lat: 31.9100245, lon: 34.8008408 },
  { name: 'גבעתי', lat: 31.8828002, lon: 34.8066536 },
  { name: 'מקוב', lat: 31.8843790, lon: 34.8283892 },
  { name: 'רמת אהרון', lat: 31.8830984, lon: 34.8254635 },
  { name: 'עין גנים', lat: 31.8819441, lon: 34.8155991 },
  { name: 'אבני חן', lat: 31.8966164, lon: 34.8257040 },
  { name: 'קרית דוד', lat: 31.8916688, lon: 34.8242615 },
  { name: 'היובל', lat: 31.8877337, lon: 34.8260900 },
  { name: 'חצרות המושבה', lat: 31.8925728, lon: 34.7923660 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Rehovot (${REHOVOT_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', REHOVOT_AUTHORITY_ID)
    .get();
  const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));
  console.log(`✓  ${existingNames.size} existing neighborhood docs found`);

  let created = 0;
  let skipped = 0;

  for (const n of NEW_NEIGHBORHOODS) {
    if (existingNames.has(n.name)) {
      console.log(`⏭  SKIP (already exists): ${n.name}`);
      skipped++;
      continue;
    }

    const doc: Record<string, unknown> = {
      name: n.name,
      type: 'neighborhood' as const,
      parentAuthorityId: REHOVOT_AUTHORITY_ID,
      logoUrl: null,
      managerIds: [] as string[],
      userCount: 0,
      status: 'inactive' as const,
      isActiveClient: false,
      coordinates: { lat: n.lat, lng: n.lon },
      pipelineStatus: 'draft' as const,
      unitCount: 0,
      hierarchyLevel: 2,
      vertical: 'municipal' as const,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${n.name} @ ${n.lat},${n.lon}`);
    } else {
      const ref = await db.collection('authorities').add(doc);
      console.log(`✓  CREATED: ${n.name} → ${ref.id}`);
    }
    created++;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
