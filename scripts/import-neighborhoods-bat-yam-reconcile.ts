#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-bat-yam-reconcile.ts
 *
 * Bat Yam neighborhood reconcile — second city of the second autonomous
 * Tier-1/50k+ mapping run (same policy: ship confident items
 * automatically, park anything uncertain, never ship a guessed
 * coordinate). Population confirmed: 128,895 (Wikipedia/CBS series,
 * June 2026) — updated from the prior rounded 129,000.
 *
 * Source: no official GIS/data.gov.il/ArcGIS dataset exists for Bat Yam
 * (exhaustively checked and ruled out — data.gov.il 0 results, no
 * ArcGIS Online org, municipal GIS front-ends 403/404, CBS statistical
 * layer has numeric codes only). A real municipal 5-רובע administrative
 * division exists (עמידר, צפון, דרום, רמת הנשיא, לב העיר ורמת יוסף) but
 * its primary source pages both 404'd — only reachable via AI-
 * summarized secondary mentions, so per policy NOT certified as a
 * structured cluster field, none added. Fallback used: OSM/Overpass
 * place-nodes cross-validated against Hebrew Wikipedia's neighborhood
 * list.
 *
 * Reconciliation: all 3 existing entries (טיילת הים, רמת יוסף, רמת
 * הנשיא) kept fully unchanged — clean matches, no umbrella/split
 * situations.
 *
 * 6 net-new entries shipped:
 *   - 4 HIGH confidence (own OSM place-node, name matches exactly):
 *     שיכון ותיקים, עמידר, קריית באבוב, שכונת הקרוואנים (this last one
 *     has no Wikipedia corroboration, OSM-only, but still a real
 *     coordinate — not a guess).
 *   - 2 landmark-anchored (still an acceptable coordinate source per
 *     policy): שכונת פארק הים (anchored to פארק תצפית הים, the park it's
 *     named after and sits within), מרכז העיר / לב העיר (anchored to Bat
 *     Yam city hall, matches the official רובע name "לב העיר ורמת
 *     יוסף"). Shipped as one dual-named entry rather than split, since
 *     splitting would give two picker entries the identical coordinate.
 *
 * Excluded — not bounded residential areas (PARKED, not shipped):
 * קהילת חב"ד-ליובאוויטש (~100 families, not a geographic area per
 * Wikipedia's own description); קהילת אורות התורה (resolves only to a
 * yeshiva/school building, not a distinct residential area).
 *
 * PARKED — unresolved identity, not shipped: רמות ים (a legacy 1950s
 * name in Wikipedia's list with no OSM match; may be an older name for
 * the same area now called "מרכז העיר"/"לב העיר" — one real-estate
 * listing on the same street uses that label — but not confirmed, so
 * not merged on a guess).
 *
 * No cluster/grouping field added (see source note above).
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original BAT YAM block's keys don't match any real picker id
 * — same recurring pattern this run). Left untouched, flagged for the
 * later cleanup commit.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-bat-yam-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-bat-yam-reconcile.ts
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
const BAT_YAM_AUTHORITY_ID = 'rKRy8AHMIqw7TrSTfO38';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'שיכון ותיקים', lat: 32.0210436, lon: 34.7523161 },
  { name: 'עמידר', lat: 32.0285187, lon: 34.7561268 },
  { name: 'קריית באבוב', lat: 32.0089901, lon: 34.7528765 },
  { name: 'שכונת הקרוואנים', lat: 32.0031317, lon: 34.7464864 },
  { name: 'שכונת פארק הים', lat: 32.0059250, lon: 34.7360370 },
  { name: 'מרכז העיר / לב העיר', lat: 32.0162006, lon: 34.7412740 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Bat Yam (${BAT_YAM_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', BAT_YAM_AUTHORITY_ID)
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
      parentAuthorityId: BAT_YAM_AUTHORITY_ID,
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
