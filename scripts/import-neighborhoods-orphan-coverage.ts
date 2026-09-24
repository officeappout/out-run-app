#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-orphan-coverage.ts
 *
 * Seeds the 6 orphan-coverage cities' neighborhoods/settlements under
 * their EXISTING Firestore authority docs (CBS-registry import — these
 * are NOT new top-level docs, just newly-added static subLocations
 * matching the already-existing parent). Same proven create-only,
 * single-parent-scoped, dry-run-gated template as Phase A/B.
 *
 * Parent doc ids HARDCODED below (already-known Firestore doc ids from
 * the 16.08.2026 orphan-authorities investigation). None are paying
 * clients. Not run for real yet — HOLD for David's approval per his
 * explicit instruction, dry-run only until then.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-orphan-coverage.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-orphan-coverage.ts
 */

import * as admin from 'firebase-admin';
import { ISRAELI_LOCATIONS } from '../src/lib/data/israel-locations';
import { DEFAULT_COORDINATES } from '../src/features/user/onboarding/components/steps/UnifiedLocation/location-constants';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const key = JSON.parse(rawKey);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

const ORPHAN_COVERAGE: Record<string, string> = {
  'kedumim': 'SjPvnb6HM0Jrk4WMnApa',
  'dayr-al-asad': '3mJuUfM3l4CI1GLo7TKt',
  'kiryat-arba': 'PzpTlHdSx2iYzT1CXcLf',
  'bueine-nujeidat': 'cUWM00vVsZKByuZO3Jsl',
  'beit-arye-ofarim': 'emk5immqkk8wWjBgvsKB',
  'kisra-sumei': 'kax8PoJHMdIIN6R7tEpA',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Orphan coverage seed: ${Object.keys(ORPHAN_COVERAGE).length} cities ──\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const mismatches: string[] = [];

  for (const [staticId, parentAuthorityId] of Object.entries(ORPHAN_COVERAGE)) {
    const loc = ISRAELI_LOCATIONS.find(l => l.id === staticId);
    if (!loc) { console.error(`❌  static id not found: ${staticId}`); continue; }
    const subLocations = loc.subLocations || [];

    // Sanity check: confirm the Firestore doc's own name matches this static entry's name.
    const parentSnap = await db.collection('authorities').doc(parentAuthorityId).get();
    if (!parentSnap.exists) { console.error(`❌  parent doc not found: ${parentAuthorityId} for ${loc.name}`); continue; }
    const parentData = parentSnap.data()!;
    if (parentData.name !== loc.name) {
      console.error(`❌  NAME MISMATCH for ${staticId}: static="${loc.name}" firestore="${parentData.name}" — ABORTING this city`);
      continue;
    }
    if (parentData.isActiveClient === true) {
      console.error(`🛑  ${loc.name} is isActiveClient=true — ABORTING this city, never touch a paying client`);
      continue;
    }

    console.log(`── ${loc.name} (${parentAuthorityId}) — ${subLocations.length} static subLocations ──`);

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', parentAuthorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name));
    console.log(`   ${existingNames.size} existing children found`);

    let created = 0;
    let skipped = 0;

    for (const sub of subLocations) {
      if (existingNames.has(sub.name)) { skipped++; continue; }
      const coords = DEFAULT_COORDINATES[sub.id];
      if (!coords) { console.error(`   ❌ no coordinates for ${sub.id} (${sub.name}) — SKIPPING`); continue; }

      const doc: Record<string, unknown> = {
        name: sub.name, type: sub.type, parentAuthorityId,
        logoUrl: null, managerIds: [] as string[], userCount: 0,
        status: 'inactive' as const, isActiveClient: false,
        coordinates: { lat: coords.lat, lng: coords.lng },
        pipelineStatus: 'draft' as const, unitCount: 0, hierarchyLevel: 2, vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`   WOULD CREATE: ${sub.name} @ ${coords.lat},${coords.lng}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`   ✓ CREATED: ${sub.name} → ${ref.id}`);
      }
      created++;
    }

    const totalAfter = existingNames.size + created;
    if (totalAfter !== subLocations.length) {
      mismatches.push(`${loc.name}: static=${subLocations.length} existing=${existingNames.size} created=${created} total=${totalAfter}`);
    }
    console.log(`   ${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped: ${skipped}\n`);
    totalCreated += created;
    totalSkipped += skipped;
  }

  console.log('=== TOTALS ===');
  console.log(`${DRY_RUN ? 'Would create' : 'Created'} total: ${totalCreated}, Skipped total: ${totalSkipped}`);
  if (mismatches.length) {
    console.log('\n⚠️  MISMATCHES:');
    mismatches.forEach(m => console.log('  ', m));
  } else {
    console.log('✓ No mismatches.');
  }
}

main().catch((err) => { console.error('💥', err); process.exit(1); });
