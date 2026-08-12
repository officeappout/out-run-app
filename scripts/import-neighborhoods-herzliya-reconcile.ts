#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-herzliya-reconcile.ts
 *
 * Herzliya neighborhood reconcile — fourth city of the second
 * autonomous Tier-1/50k+ mapping run (same policy: ship confident
 * items automatically, park anything uncertain, never ship a guessed
 * coordinate). Population confirmed: 112,723 (CBS, most recent
 * estimate; cross-checked against an independent April figure of
 * 112,002, consistent monthly growth trend).
 *
 * NOTE: Firestore has two docs named "הרצליה" — the correct city
 * authority is 1O54R5EOghNYylTEhxJa (hierarchyLevel 1, parentAuthorityId
 * null, coordinates match Herzliya, real CRM history). The other
 * (a0AVB2oEDTaCCtfm6fcv) is an unrelated hierarchyLevel-2 neighborhood
 * doc under a different city, ~400km north — not touched here.
 *
 * Source: official municipal ArcGIS FeatureServer ("מפת קהילות",
 * owner tomer_herzliya — confirmed municipal via other layers on the
 * same account), 17 polygon features. herzliya.muni.il itself has no
 * plain neighborhood-list page. Coordinates for GIS-sourced entries are
 * a vertex-average of each polygon's ring (not an exact area-weighted
 * centroid) — for the roughly-convex shapes here the difference is
 * expected to be small, flagged for transparency. No genuine
 * cluster/grouping field exists (num_kehila duplicates OBJECTID, not a
 * real grouping).
 *
 * Reconciliation: הרצליה פיתוח, הרצליה הירוקה, גן רש״ל kept as legacy
 * umbrellas (each covers 2 official sub-polygons per the GIS layer,
 * subs added alongside). גליל ים clean 1:1 match, kept unchanged. מרכז
 * העיר: the municipality's own name for this exact zone is "שז״ר
 * המרכזית" — renamed (same id) to "שז״ר המרכזית · מרכז העיר" (official
 * · local, middle-dot format), coordinate left untouched (no fresh
 * confirmed value for this specific rename).
 *
 * 14 net-new entries shipped: נחלת עדה + נוף ים (umbrella subs), יד
 * התשעה, נווה עמל, הרצליה הצעירה, נווה ישראל, נווה אמירים, הרצליה ב׳,
 * הרצליה הילס, נבון, הנדיב, ויצמן · יבור (a real dual-named
 * quarter/sub-community per the source itself), ירוק בעיר - ברנר +
 * יוחנני הירוקה (הרצליה הירוקה umbrella subs).
 *
 * Excluded as non-residential (PARKED): אזור התעסוקה והתעשייה
 * (employment/industrial zone), פארק הרצליה (the ~650-dunam hi-tech/
 * office park containing Azrieli Business Park, near the Glilot
 * interchange).
 *
 * PARKED — identity uncertain, not shipped: אלון. Real official GIS
 * polygon, but evidence suggests "יגאל אלון" may primarily be a street
 * inside הרצליה הירוקה rather than its own distinct community — at
 * least one new-construction marketing page on that street describes
 * itself as being in "הרצליה הירוקה," not a separate "שכונת אלון."
 * Shipping it risked presenting a street as a neighborhood; parked per
 * the "any include-or-not uncertainty → park" rule.
 *
 * A pre-existing near-miss typo was found and fixed: the file's
 * original coordinate key 'hz-pituah' (missing the final ch) doesn't
 * match the real id 'hz-pituach' — 'hz-pituach' added below reusing
 * hz-pituah's value (same place, key-spelling fix only). Three other
 * pre-existing orphaned keys (hz-herzliya-gimmel, hz-shikun-vatikim,
 * hz-north) don't match any real id — left untouched, flagged for the
 * later cleanup commit.
 *
 * Idempotent — checks for an existing doc by name before creating; the
 * מרכז העיר rename is a separate, explicit step (safe to re-run).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-herzliya-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-herzliya-reconcile.ts
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
const HERZLIYA_AUTHORITY_ID = '1O54R5EOghNYylTEhxJa';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'נחלת עדה', lat: 32.1835, lon: 34.8381 },
  { name: 'יד התשעה', lat: 32.1751, lon: 34.8555 },
  { name: 'נווה עמל', lat: 32.1655, lon: 34.8585 },
  { name: 'הרצליה הצעירה', lat: 32.1567, lon: 34.8471 },
  { name: 'נווה ישראל', lat: 32.1576, lon: 34.8371 },
  { name: 'נווה אמירים', lat: 32.1541, lon: 34.8376 },
  { name: 'הרצליה ב׳', lat: 32.1667, lon: 34.8167 },
  { name: 'הרצליה הילס', lat: 32.1620, lon: 34.8134 },
  { name: 'נוף ים', lat: 32.1861, lon: 34.8098 },
  { name: 'נבון', lat: 32.1755, lon: 34.8354 },
  { name: 'הנדיב', lat: 32.1675, lon: 34.8323 },
  { name: 'ויצמן · יבור', lat: 32.1649, lon: 34.8367 },
  { name: 'ירוק בעיר - ברנר', lat: 32.1693, lon: 34.8476 },
  { name: 'יוחנני הירוקה', lat: 32.1740, lon: 34.8471 },
];

const MERKAZ_RENAME = {
  oldName: 'מרכז העיר',
  newName: 'שז״ר המרכזית · מרכז העיר',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Herzliya (${HERZLIYA_AUTHORITY_ID}): ${NEW_NEIGHBORHOODS.length} new + 1 rename ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', HERZLIYA_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  const merkazDoc = existingByName.get(MERKAZ_RENAME.oldName);
  if (merkazDoc) {
    if (DRY_RUN) {
      console.log(`  WOULD UPDATE (name only): ${MERKAZ_RENAME.oldName} → ${MERKAZ_RENAME.newName}`);
    } else {
      await merkazDoc.ref.update({
        name: MERKAZ_RENAME.newName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓  UPDATED: ${MERKAZ_RENAME.oldName} → ${MERKAZ_RENAME.newName}`);
    }
  } else {
    console.log(`⚠️  מרכז העיר doc not found by name — skipping rename (already renamed, or name mismatch)`);
  }

  let created = 0;
  let skipped = 0;

  for (const n of NEW_NEIGHBORHOODS) {
    if (existingByName.has(n.name)) {
      console.log(`⏭  SKIP (already exists): ${n.name}`);
      skipped++;
      continue;
    }

    const doc: Record<string, unknown> = {
      name: n.name,
      type: 'neighborhood' as const,
      parentAuthorityId: HERZLIYA_AUTHORITY_ID,
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
