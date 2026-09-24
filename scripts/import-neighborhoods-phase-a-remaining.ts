#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-phase-a-remaining.ts
 *
 * Phase A, remaining groups — the last 39 "clean" cities (single
 * unambiguous Firestore parent doc, not one of the 9 duplicate-doc
 * cities, not a regional council, not Netanya's confirmed formatting
 * quirk). Same proven pattern as
 * scripts/import-neighborhoods-ashkelon-reconcile.ts,
 * scripts/import-neighborhoods-kiryat-yam-reconcile.ts, and
 * scripts/import-neighborhoods-phase-a-group1.ts:
 * create-only .add(), per-parent name dedup, dry-run gate, never touches
 * any existing doc or any field on the parent (isActiveClient/status/
 * pipelineStatus/financials).
 *
 * Parent doc ids are HARDCODED below (resolved 15.08.2026 via an exact
 * name match that returned exactly 1 Firestore doc for each — belt and
 * suspenders: this script can only ever write under these 39 ids).
 * None are paying clients.
 *
 * subLocations + coordinates are read live from israel-locations.ts /
 * location-constants.ts, not hardcoded here.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-phase-a-remaining.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-phase-a-remaining.ts
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
const REMAINING: Record<string, string> = {
  'zichron-yaakov': 'bnhDavVEy3pq0vaQbEox',
  'arad': 'fWBLjWKwWtMqSIPB3YsM',
  'mgr': '3ME4OXweQHvgrzrcyjdU',
  'nvf-hglyl': 'Piik4x7BnjrKAnsrcTiA',
  'rbh': 'IvaSljUA5xLKq4bvgtXm',
  'ofakim': '8zjZxYzxvr394PshoOvt',
  'byt-shn': 'JzDmjPF6h6I4Qy94UkL2',
  'kryyt-mlky': 'pKc74iYLRcUeLvoF23YH',
  'g-dyydh-mkr': '3VZdBUhNm6GLD6M43oV5',
  'tamra': '6avkHMMtd1nbmnvr4j8I',
  'maale-adumim': 'BFroByqm0IbzXk6vGqrb',
  'tyrt-krml': 'qNDkeDFmkt2C1rukxiQi',
  'ramat-hasharon': 'z7rGYEtFWhL861COiue7',
  'gan-yavne': '9MQ8qZiGCbt6227DZLwT',
  'gny-tkvvh': '7N3UZElnW2J2zJxvMlPF',
  'or-yehuda': 'Zy51iAeSXann5MyaBEFj',
  'givat-shmuel': 'UVQxq9PNGwQhL2udcEX8',
  'gbt-zb': 'ELsElPIAEpHlbz3JdCUZ',
  'kiryat-ono': 'siottOZAY5CkpvauSJwp',
  'ariel': 'xkQiOxSBeGIGaxdhCiO9',
  'yokneam-illit': 'Uk7aGIl1VKRq0bVuvq7q',
  'pardes-hanna': 'u0qHVCGC0k9zWyHJKDVG',
  'vr-kyb': 'xuzpNzOCWrN3tLaOIiud',
  'br-ykb': '3n4Yqh4z0sAUhiVAIEeg',
  'netivot': '9Y7F380QV1mXpmIbAyLx',
  'gedera': 'BtpJYZ06vGN6C70Oo5pd',
  'nesher': 'x2vRiGuSjCVhAA1l4KpL',
  'yhvd-mvnvsvn': '9624tLbpZsNwRIkfaZX5',
  'mvdyyn-ylyt': 'sqMOdK6cixvRVwql8C6L',
  'kryyt-tbvn': 'gtI6ZAxCBiWNoQf6cD6X',
  'shoham': 'KWDyl0t92XfhB1xosFiQ',
  'chrysh': 'CAxHBS6ify0fXGOv9dZe',
  'shprm': 'i7c59hvMnTbEupFQmRfq',
  'rrh': '9izShC7NK6W5sxyH6ORf',
  'mevaseret-zion': 'GKc7XyOefUsqsz20YnXj',
  'beitar-illit': 'UVU2GBM8Uem7Xr95SrIU',
  'kadima-zoran': 'RkgWJytadaKzC7KoQv6n',
  'kfar-yona': 'fiKAQlmQJZb02wB2a6Vq',
  'kpr-mnd': '4s0armc0w1XsijZ4ypmD',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Phase A remaining: ${Object.keys(REMAINING).length} cities ──\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const perCity: { name: string; staticCount: number; created: number; skipped: number }[] = [];
  const mismatches: string[] = [];

  for (const [staticId, parentAuthorityId] of Object.entries(REMAINING)) {
    const loc = ISRAELI_LOCATIONS.find(l => l.id === staticId);
    if (!loc) { console.error(`❌  static id not found: ${staticId}`); totalErrors++; continue; }
    const subLocations = loc.subLocations || [];

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', parentAuthorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name));

    let created = 0;
    let skipped = 0;

    for (const sub of subLocations) {
      if (existingNames.has(sub.name)) { skipped++; continue; }
      const coords = DEFAULT_COORDINATES[sub.id];
      if (!coords) {
        console.error(`   ❌  no DEFAULT_COORDINATES entry for ${sub.id} (${sub.name}) in ${loc.name} — SKIPPING`);
        totalErrors++;
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
        console.log(`  [${loc.name}] WOULD CREATE: ${sub.name} @ ${coords.lat},${coords.lng}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`  [${loc.name}] ✓ CREATED: ${sub.name} → ${ref.id}`);
      }
      created++;
    }

    const totalAfter = existingNames.size + created;
    if (totalAfter !== subLocations.length) {
      mismatches.push(`${loc.name}: static=${subLocations.length} existing=${existingNames.size} created=${created} total=${totalAfter} (MISMATCH)`);
    }

    totalCreated += created;
    totalSkipped += skipped;
    perCity.push({ name: loc.name, staticCount: subLocations.length, created, skipped });
  }

  console.log('\n=== TOTALS ===');
  perCity.forEach(c => console.log(`  ${c.name}: static=${c.staticCount} ${DRY_RUN ? 'would-create' : 'created'}=${c.created} skipped=${c.skipped}`));
  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} total: ${totalCreated}, Skipped total: ${totalSkipped}, Errors: ${totalErrors}`);

  if (mismatches.length) {
    console.log('\n⚠️  MISMATCHES (static count != existing+created):');
    mismatches.forEach(m => console.log('  ', m));
    process.exitCode = 1;
  } else {
    console.log('\n✓ No mismatches — every city\'s existing+created total equals its static subLocations count.');
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
