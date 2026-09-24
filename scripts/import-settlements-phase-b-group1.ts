#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-phase-b-group1.ts
 *
 * Phase B, group 1 — the first 3 regional councils by missing-count
 * (Mateh Yehuda 52, Mateh Binyamin 44, Emek Yizrael 35), same proven
 * create-only, single-parent-scoped, dry-run-gated template as Phase A.
 *
 * Parent doc ids HARDCODED below (resolved 15.08.2026 via exact name
 * match, exactly 1 Firestore doc each — belt and suspenders). None are
 * paying clients.
 *
 * Extra check for Phase B (councils have many settlements each, higher
 * risk of a name/coordinate slipping into the wrong council): --dry-run
 * prints the FULL settlement list per council, not just counts, so the
 * council→settlement mapping can be eyeballed before trusting it.
 *
 * NOTE — executed 15.08.2026. Two "MISMATCH" warnings at run end are
 * EXPECTED, not bugs: pre-existing stale Firestore children whose names
 * no longer match current static classification —
 * צור הדסה (promoted to its own top-level local_council, no longer a
 * Mateh Yehuda subLocation) and משמר העמק (belongs under Megiddo, already
 * 14/14 there — this copy is a stale duplicate under the wrong parent).
 * Neither collided with any of the 131 creates. Logged for a future
 * cleanup pass, not touched here (script never deletes/edits).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-group1.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-group1.ts
 */

import * as admin from 'firebase-admin';
import { ISRAELI_LOCATIONS } from '../src/lib/data/israel-locations';
import { DEFAULT_COORDINATES } from '../src/features/user/onboarding/components/steps/UnifiedLocation/location-constants';

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

const GROUP1: Record<string, string> = {
  'mateh-yehuda': 'YK7Rrs84IY5d1etXWAXx',  // מועצה אזורית מטה יהודה
  'binyamin': '4fzyIahk1bj8e68agAxP',      // מועצה אזורית מטה בנימין
  'emek-yizrael': 'lt6vK9gbVHf9TpFNiCrD',  // מועצה אזורית עמק יזרעאל
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Phase B group 1: ${Object.keys(GROUP1).length} regional councils ──\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const mismatches: string[] = [];

  for (const [staticId, parentAuthorityId] of Object.entries(GROUP1)) {
    const loc = ISRAELI_LOCATIONS.find(l => l.id === staticId);
    if (!loc) { console.error(`❌  static id not found: ${staticId}`); continue; }
    const subLocations = loc.subLocations || [];

    console.log(`── ${loc.name} (${parentAuthorityId}) — ${subLocations.length} static subLocations ──`);

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', parentAuthorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name));
    console.log(`   ${existingNames.size} existing settlement docs found:`, [...existingNames].join(', '));

    let created = 0;
    let skipped = 0;

    for (const sub of subLocations) {
      if (existingNames.has(sub.name)) {
        console.log(`   [existing] ${sub.name}`);
        skipped++;
        continue;
      }
      const coords = DEFAULT_COORDINATES[sub.id];
      if (!coords) {
        console.error(`   ❌  no DEFAULT_COORDINATES entry for ${sub.id} (${sub.name}) — SKIPPING`);
        continue;
      }

      const doc: Record<string, unknown> = {
        name: sub.name,
        type: sub.type,
        parentAuthorityId,
        logoUrl: null,
        managerIds: [] as string[],
        userCount: 0,
        status: 'inactive' as const,
        isActiveClient: false,
        coordinates: { lat: coords.lat, lng: coords.lng },
        pipelineStatus: 'draft' as const,
        unitCount: 0,
        hierarchyLevel: 2,
        vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`   WOULD CREATE: ${sub.name} @ ${coords.lat},${coords.lng}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`   ✓  CREATED: ${sub.name} → ${ref.id}`);
      }
      created++;
    }

    const totalAfter = existingNames.size + created;
    if (totalAfter !== subLocations.length) {
      mismatches.push(`${loc.name}: static=${subLocations.length} existing=${existingNames.size} created=${created} total=${totalAfter} (MISMATCH)`);
    }

    console.log(`   ${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}\n`);
    totalCreated += created;
    totalSkipped += skipped;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} total: ${totalCreated}, Skipped total: ${totalSkipped}`);
  if (mismatches.length) {
    console.log('\n⚠️  MISMATCHES:');
    mismatches.forEach(m => console.log('  ', m));
    process.exitCode = 1;
  } else {
    console.log('✓ No mismatches — every council\'s existing+created total equals its static subLocations count.');
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
