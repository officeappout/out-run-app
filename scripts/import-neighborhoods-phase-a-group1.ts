#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-phase-a-group1.ts
 *
 * Phase A, group 1 of the neighborhood data catch-up — the 12 highest-gap
 * "clean" cities (single unambiguous Firestore parent doc, not one of the
 * 9 duplicate-doc cities, not a regional council). Same proven pattern as
 * scripts/import-neighborhoods-ashkelon-reconcile.ts and
 * scripts/import-neighborhoods-kiryat-yam-reconcile.ts:
 * create-only .add(), per-parent name dedup, dry-run gate, never touches
 * any existing doc or any field on the parent (isActiveClient/status/
 * pipelineStatus/financials).
 *
 * Parent doc ids are HARDCODED below (resolved 15.08.2026 via an exact
 * name match that returned exactly 1 Firestore doc for each — belt and
 * suspenders: this script can only ever write under these 12 ids, no
 * dynamic parent resolution at write time). None of these 12 are paying
 * clients (isActiveClient: false on all 12, verified before this script
 * was written).
 *
 * subLocations + coordinates are read live from israel-locations.ts /
 * location-constants.ts (already-shipped, gated locality-mapping data),
 * not hardcoded here.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-phase-a-group1.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-phase-a-group1.ts
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

// staticId -> Firestore parent authority doc id (resolved 15.08.2026, single unambiguous match each)
const GROUP1: Record<string, string> = {
  'kpr-kr':        'XrxTAMiJXDAd1RMqvrc3', // כפר קרע
  'safed':         'osFAdxIz1w8lF55fnPiH', // צפת
  'ksyph':         'plCyVY89F45TelALgekp', // כסיפה
  'mlvt-trshych':  'N6ROBWos0ibBwQ2Jsbo1', // מעלות-תרשיחא
  'dimona':        'gsGwhL3DwpfRpU3N3d8f', // דימונה
  'tl-shb':        'TVpSAjyLJfNanW7vqOsf', // תל שבע
  'migdal-haemek': '23vF9Kb9OZ5bZAE1JWUt', // מגדל העמק
  'kpr-kn':        'tWM21xBqrpqzgRlFDBe7', // כפר כנא
  'rrh-bngb':      'rNjxnKMBxWaL3lYoOht3', // ערערה-בנגב
  'ypy':           'MxpJSn3V4tXQH2YbMXJ1', // יפיע
  'chvrh':         'NUt25oO6loihT8enYly1', // חורה
  'karmiel':       'mzQYo5tux0QIa5auWO0q', // כרמיאל
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Phase A group 1: ${Object.keys(GROUP1).length} cities ──\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const perCity: { name: string; created: number; skipped: number }[] = [];

  for (const [staticId, parentAuthorityId] of Object.entries(GROUP1)) {
    const loc = ISRAELI_LOCATIONS.find(l => l.id === staticId);
    if (!loc) { console.error(`❌  static id not found: ${staticId}`); continue; }
    const subLocations = loc.subLocations || [];

    console.log(`── ${loc.name} (${parentAuthorityId}) — ${subLocations.length} static subLocations ──`);

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', parentAuthorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name));
    console.log(`   ${existingNames.size} existing neighborhood docs found`);

    let created = 0;
    let skipped = 0;

    for (const sub of subLocations) {
      if (existingNames.has(sub.name)) {
        skipped++;
        continue;
      }
      const coords = DEFAULT_COORDINATES[sub.id];
      if (!coords) {
        console.error(`   ❌  no DEFAULT_COORDINATES entry for ${sub.id} (${sub.name}) — SKIPPING, will not guess a coordinate`);
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

    console.log(`   ${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}\n`);
    totalCreated += created;
    totalSkipped += skipped;
    perCity.push({ name: loc.name, created, skipped });
  }

  console.log('=== TOTALS ===');
  perCity.forEach(c => console.log(`  ${c.name}: ${c.created} ${DRY_RUN ? 'would-create' : 'created'}, ${c.skipped} skipped`));
  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} total: ${totalCreated}, Skipped total: ${totalSkipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
