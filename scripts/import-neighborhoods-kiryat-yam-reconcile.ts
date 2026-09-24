#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-kiryat-yam-reconcile.ts
 *
 * Kiryat Yam neighborhood catch-up — PILOT for the broader neighborhood
 * data catch-up (Firestore `authorities` child docs vs israel-locations.ts
 * subLocations, 1,385 vs 2,416 gap found 15.08.2026). Mirrors the exact
 * pattern already proven safe on Ashkelon
 * (scripts/import-neighborhoods-ashkelon-reconcile.ts) — same field shape,
 * same idempotent dedup-by-name-under-parent, same dry-run gate.
 *
 * NOTE: Kiryat Yam's `authorities` doc (קרית ים, UvznR6YyVqRXmJiHIfap) has
 * isActiveClient: true (paying client). This script does NOT touch that
 * field or any field on the parent authority doc — it only creates new
 * CHILD neighborhood docs under it (hierarchyLevel: 2, isActiveClient:
 * false, status: 'inactive', pipelineStatus: 'draft' — the same
 * draft/inactive template used for every other city).
 *
 * Source: all 6 neighborhoods + coordinates come from the already-shipped
 * israel-locations.ts / location-constants.ts entries (id prefix 'ky-'),
 * built and gated in the locality-mapping project earlier this session —
 * not re-researched here.
 *
 * Gap found live 15.08.2026: 0 of 6 static subLocations exist as Firestore
 * child docs under this parent (parentAuthorityId query returned 0 rows).
 * The top-level Firestore authority doc name (קרית ים) is a diacritic
 * variant of the static entry's name (קריית ים) — matched by id
 * ('kryyt-ym') → hardcoded Firestore doc id below, not by name.
 *
 * Idempotent — checks for an existing doc with the same name +
 * parentAuthorityId before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-kiryat-yam-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-kiryat-yam-reconcile.ts
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
const KIRYAT_YAM_AUTHORITY_ID = 'UvznR6YyVqRXmJiHIfap';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'סביוני ים', lat: 32.85803, lon: 35.08409 },
  { name: 'פסגות ים', lat: 32.84417, lon: 35.0729 },
  { name: 'בנה ביתך', lat: 32.84475, lon: 35.07636 },
  { name: 'שיכון צבא קבע', lat: 32.84448, lon: 35.06854 },
  { name: 'אלמוגים', lat: 32.85463, lon: 35.07423 },
  { name: 'שכונת שפירא', lat: 32.84398, lon: 35.06207 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Kiryat Yam (${KIRYAT_YAM_AUTHORITY_ID}) ──`);
  console.log(`   NOTE: parent authority isActiveClient=true (paying client) — this script only touches child neighborhood docs, never the parent.`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', KIRYAT_YAM_AUTHORITY_ID)
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
      parentAuthorityId: KIRYAT_YAM_AUTHORITY_ID,
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
