#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-beer-sheva-reconcile.ts
 *
 * Beer Sheva neighborhood reconcile — part of the autonomous Tier-1 city
 * mapping run (policy approved by David 12.08.2026: ship confident items
 * automatically, park anything uncertain in the consolidated final
 * report, never ship a guessed coordinate).
 *
 * Source: municipal GIS point layer "neighborhood_centers_br7"
 * (beer-sheva.maps.arcgis.com, owner helberg2 — Beer Sheva municipality's
 * own GIS account), fields שכונה/eng/GlobalID. 19 named features, real
 * GIS points (not geocoded guesses). A companion polygon layer exists but
 * its service endpoint returns a server-side error on every attempt
 * (Esri/municipal proxy issue, not fixable client-side) — point layer
 * used instead, still an authoritative municipal source.
 *
 * Reconciliation:
 *   - All 6 existing entries matched cleanly. נחל עשן is a same-place
 *     alias — the GIS layer's own preferred name for that location is
 *     נווה מנחם (independently confirmed via madlan/homeless.co.il/
 *     Wikipedia as two names for one physical neighborhood). Renamed
 *     (same id, doc UPDATED not recreated) to "נווה מנחם · נחל עשן"
 *     (official · local, middle-dot format) with the real GIS coordinate.
 *   - 9 net-new entries added, all real GIS centroids.
 *
 * Excluded as non-residential (PARKED): מרכז אזרחי (civic/business
 * center).
 *
 * PARKED — under construction per the municipality's own project pages
 * ("בביצוע"), not shipped: כלניות, שכונת הפארק / פארק הנחל.
 *
 * PARKED — unresolved, not shipped: 1 unnamed GIS point (OSM suburb
 * tagging suggests "רמות ב'" but the municipal source itself left the
 * name field blank — not treated as a confirmed official name).
 * קריית מאיר בץ — real neighborhood, absent from the GIS layer entirely;
 * only a Wikipedia-infobox coordinate available, and a landmark-anchor
 * resolve pass (zoo, agricultural farm, IAF college, alternate spelling)
 * found nothing on Nominatim — medium confidence, parked per the
 * never-ship-a-guess rule.
 *
 * No cluster/grouping field found in the source (only שכונה/eng/GlobalID)
 * — none added, consistent with the "only if a clean structured source
 * exists" rule.
 *
 * A pre-existing key-prefix mismatch was found (bs-dalet doesn't match
 * the real bs-d id) — fixed by adding bs-d reusing bs-dalet's value
 * (semantic match, not a fresh guess); bs-center (no matching real id —
 * excluded civic-center area) left untouched.
 *
 * Idempotent — checks for an existing doc by name before creating; the
 * נחל עשן rename is a separate, explicit step (safe to re-run).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-beer-sheva-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-beer-sheva-reconcile.ts
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
const BEER_SHEVA_AUTHORITY_ID = 'X505lUcEWgiih0WJ3yP7';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'שכונה א׳', lat: 31.24833, lon: 34.79098 },
  { name: 'שכונה ג׳', lat: 31.25494, lon: 34.80518 },
  { name: 'שכונה ה׳', lat: 31.25221, lon: 34.77852 },
  { name: 'שכונה ו׳', lat: 31.26461, lon: 34.77935 },
  { name: 'שכונה ט׳', lat: 31.24599, lon: 34.77375 },
  { name: 'שכונה יא', lat: 31.25838, lon: 34.76738 },
  { name: 'נחל בקע', lat: 31.22396, lon: 34.77501 },
  { name: 'נווה נוי', lat: 31.23082, lon: 34.78619 },
  { name: 'נאות לון', lat: 31.24829, lon: 34.76232 },
];

const NAHAL_ASHAN_RENAME = {
  oldName: 'נחל עשן',
  newName: 'נווה מנחם · נחל עשן',
  lat: 31.26685,
  lon: 34.76268,
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Beer Sheva (${BEER_SHEVA_AUTHORITY_ID}): ${NEW_NEIGHBORHOODS.length} new + 1 rename ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', BEER_SHEVA_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  const nahalAshanDoc = existingByName.get(NAHAL_ASHAN_RENAME.oldName);
  if (nahalAshanDoc) {
    const update = {
      name: NAHAL_ASHAN_RENAME.newName,
      coordinates: { lat: NAHAL_ASHAN_RENAME.lat, lng: NAHAL_ASHAN_RENAME.lon },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (DRY_RUN) {
      console.log(`  WOULD UPDATE: ${NAHAL_ASHAN_RENAME.oldName} → ${NAHAL_ASHAN_RENAME.newName} @ ${NAHAL_ASHAN_RENAME.lat},${NAHAL_ASHAN_RENAME.lon}`);
    } else {
      await nahalAshanDoc.ref.update(update);
      console.log(`✓  UPDATED: ${NAHAL_ASHAN_RENAME.oldName} → ${NAHAL_ASHAN_RENAME.newName}`);
    }
  } else {
    console.log(`⚠️  נחל עשן doc not found by name — skipping rename (already renamed, or name mismatch)`);
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
      parentAuthorityId: BEER_SHEVA_AUTHORITY_ID,
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
