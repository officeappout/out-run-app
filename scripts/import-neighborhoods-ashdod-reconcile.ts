#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-ashdod-reconcile.ts
 *
 * Ashdod neighborhood reconcile — writes 11 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against Ashdod's
 * official numbered רובע system. No GIS/open-data feed exists for Ashdod
 * (data.gov.il + ArcGIS Online both checked, empty) — used the
 * municipality's own site (ashdod.muni.il / digital.ashdod.muni.il, the 15
 * מינהלות רבעים district-admin pages) as primary, cross-checked against
 * Hebrew Wikipedia's independent "17 numbered quarters" count. Three
 * sources agree, no gaps — high confidence on the list. Coordinates are
 * OSM neighbourhood-tagged points (no polygon dataset available) —
 * medium-high confidence, not GIS-computed centroids.
 *
 * Reconciliation (additive, existing 6 kept untouched):
 *   - All 6 existing entries matched cleanly. הסיטי and המרינה are
 *     confirmed real official areas (not informal names). רובע י״א/י״ב was
 *     already correctly entered as the municipality's own combined
 *     administrative pairing.
 *   - 17 numbered רבעים total (א–י״ז), no gaps. Only 2 carry a colloquial
 *     alt-name (both excluded, see below) — the rest use their number as
 *     their sole identity.
 *
 * Excluded per David's decisions:
 *   - רובע י״ד, רובע פארק לכיש — under construction / not yet populated
 *     (same treatment as Netanya's under-construction entries). Revisit
 *     when residents move in.
 *   - מטרופול (formerly הרובע המיוחד → קריית פרס) — institutional/
 *     commercial (hospital, planned university, mall, rail station), not
 *     a home-neighborhood. Excluded alongside מע״ר / קריית התרבות /
 *     industrial zone, none of which were ever candidates.
 *
 * רובע ז׳ has a noted haredi-population characteristic (Wikipedia) — kept
 * as context only, no metadata field added.
 *
 * No cluster/quarter field this round (no reliable grouping source),
 * consistent with Netanya's decision.
 *
 * Note: a pre-existing, unrelated bug was found in location-constants.ts —
 * the file's original ASHDOD coordinate block uses an 'asd-' key prefix
 * that matches NONE of the real picker ids (all real ids use 'ad-'). Left
 * untouched this round (ambiguous 1:1 remap, flagged for the later
 * cleanup commit) — does not affect this script or the 11 new entries,
 * which use fresh, correctly-prefixed 'ad-' keys.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ashdod-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ashdod-reconcile.ts
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
const ASHDOD_AUTHORITY_ID = '9fDuM9W7dvMpaN1OPzrF';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'רובע ב׳', lat: 31.805012, lon: 34.654017 },
  { name: 'רובע ג׳', lat: 31.799647, lon: 34.662811 },
  { name: 'רובע ה׳', lat: 31.795897, lon: 34.646809 },
  { name: 'רובע ו׳', lat: 31.793337, lon: 34.655112 },
  { name: 'רובע ז׳', lat: 31.790419, lon: 34.664468 },
  { name: 'רובע ח׳', lat: 31.787615, lon: 34.653582 },
  { name: 'רובע ט׳', lat: 31.783634, lon: 34.662236 },
  { name: 'רובע י׳', lat: 31.782302, lon: 34.653499 },
  { name: 'רובע י״ג', lat: 31.776228, lon: 34.642795 },
  { name: 'רובע ט״ז', lat: 31.771354, lon: 34.637920 },
  { name: 'רובע י״ז', lat: 31.768858, lon: 34.625286 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Ashdod (${ASHDOD_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', ASHDOD_AUTHORITY_ID)
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
      parentAuthorityId: ASHDOD_AUTHORITY_ID,
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
