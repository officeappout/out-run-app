#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-phase-b-remaining.ts
 *
 * Phase B, remaining 10 regional councils (Emek Hefer, Misgav, Shomron,
 * Golan, Eshkol, Drom HaSharon, Gezer, Chevel Modiin, Gush Etzion, Chof
 * HaSharon). Same create-only, single-parent-scoped, dry-run-gated
 * template as every prior Phase A/B script.
 *
 * Parent doc ids HARDCODED below (resolved 15.08.2026, exactly 1
 * Firestore doc each). None are paying clients.
 *
 * Refined tripwire (per David's guidance after Phase B group 1): an
 * existing child whose name doesn't match any current static subLocation
 * is a STALE/LEGACY doc (pre-dates a reclassification, like Tzur Hadassah
 * or Mishmar HaEmek) — LOGGED to the stale-children report, does NOT
 * halt the run. The only hard-stop conditions are:
 *   (a) a WOULD-CREATE name collides with an existing doc — structurally
 *       prevented by the per-parent dedup check itself,
 *   (b) the real run's created-count differs from the dry-run's
 *       would-create count for the same council,
 *   (c) any write ever targets a parent doc's own fields — structurally
 *       impossible here, this script only ever calls .collection('authorities').add()
 *       for NEW child docs, never .doc(parentId).set()/.update().
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-remaining.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-phase-b-remaining.ts
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

const REMAINING: Record<string, string> = {
  'emek-hefer': 'DMDnOxN5w3Rp6XJqcnLY',
  'misgav': 'GM95rkG1apJ4INX5TWXh',
  'shomron': 'RctoNYaNiT9Q1mUXuCiQ',
  'golan': 'r4Sktci3RUE96EcpmbR4',
  'eshkol': 'Iy4Qx5sdyQGD07AYAozW',
  'drom-hasharon': 'YigMUPH2d3I8x7VKjfks',
  'gezer': 'GnJce0aCTL3ZDPG70xgI',
  'hevel-modiin': 'Q2EDttRzpH5V9g19Ynlv',
  'gush-etzion': 'dsEdaMNgEIBowceGiPW1',
  'hof-hasharon': 'kPMU5MgpL09kmGOu6DWT',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Phase B remaining: ${Object.keys(REMAINING).length} regional councils ──\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const staleChildren: string[] = [];
  const perCouncil: { name: string; staticCount: number; created: number; skipped: number }[] = [];

  for (const [staticId, parentAuthorityId] of Object.entries(REMAINING)) {
    const loc = ISRAELI_LOCATIONS.find(l => l.id === staticId);
    if (!loc) { console.error(`❌  static id not found: ${staticId}`); continue; }
    const subLocations = loc.subLocations || [];
    const staticNames = new Set(subLocations.map(s => s.name));

    console.log(`── ${loc.name} (${parentAuthorityId}) — ${subLocations.length} static subLocations ──`);

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', parentAuthorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name));

    // Log stale children (existing but not in current static list) — informational only.
    for (const name of existingNames) {
      if (!staticNames.has(name)) {
        staleChildren.push(`${loc.name}: "${name}"`);
        console.log(`   [stale/legacy, not touched] ${name}`);
      }
    }

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

    console.log(`   ${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}\n`);
    totalCreated += created;
    totalSkipped += skipped;
    perCouncil.push({ name: loc.name, staticCount: subLocations.length, created, skipped });
  }

  console.log('=== TOTALS ===');
  perCouncil.forEach(c => console.log(`  ${c.name}: static=${c.staticCount} ${DRY_RUN ? 'would-create' : 'created'}=${c.created} skipped=${c.skipped}`));
  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} total: ${totalCreated}, Skipped total: ${totalSkipped}`);

  console.log(`\n=== STALE/LEGACY CHILDREN (logged only, not touched): ${staleChildren.length} ===`);
  staleChildren.forEach(s => console.log('  ', s));
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
