#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-gan-raveh.ts
 *
 * Phase B round 5 — writes 9 new `authorities` child docs (type=settlement)
 * for גן רווה Regional Council. Resolved via Nominatim relation-ID lookup
 * (relation 1380425) after the earlier batch's Overpass timeouts turned out
 * to be transient; cross-checked 9/9 against the council's official list
 * (Wikipedia + ganrave.org.il — exact match, no boundary leakage).
 *
 * "בסיס הילה" (Hilah military base), the council's 10th official member,
 * is deliberately excluded — not a civilian residential settlement.
 * David-approved 10.08.2026.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-gan-raveh.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-gan-raveh.ts
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
const GAN_RAVEH_AUTHORITY_ID = '1NgV7FJ9xthvlgLfaOex';

interface NewSettlement {
  name: string;
  lat: number;
  lon: number;
}

const NEW_SETTLEMENTS: NewSettlement[] = [
  { name: 'אירוס', lat: 31.928633, lon: 34.775966 },
  { name: 'בית חנן', lat: 31.934235, lon: 34.773291 },
  { name: 'בית עובד', lat: 31.921577, lon: 34.773891 },
  { name: 'גאליה', lat: 31.884504, lon: 34.765861 },
  { name: 'גן שורק', lat: 31.944903, lon: 34.760794 },
  { name: 'כפר הנגיד', lat: 31.887099, lon: 34.749286 },
  { name: 'נטעים', lat: 31.94448, lon: 34.775442 },
  { name: 'עיינות', lat: 31.915763, lon: 34.767862 },
  { name: 'פלמחים', lat: 31.933471, lon: 34.706709 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing ${NEW_SETTLEMENTS.length} settlements for גן רווה (${GAN_RAVEH_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', GAN_RAVEH_AUTHORITY_ID)
    .get();
  const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));
  console.log(`✓  ${existingNames.size} existing children found${existingNames.size ? ': ' + [...existingNames].join(', ') : ''}`);

  let created = 0;
  let skipped = 0;

  for (const s of NEW_SETTLEMENTS) {
    if (existingNames.has(s.name)) {
      console.log(`⏭  SKIP (already exists): ${s.name}`);
      skipped++;
      continue;
    }

    const doc = {
      name: s.name,
      type: 'settlement' as const,
      parentAuthorityId: GAN_RAVEH_AUTHORITY_ID,
      logoUrl: null,
      managerIds: [] as string[],
      userCount: 0,
      status: 'inactive' as const,
      isActiveClient: false,
      coordinates: { lat: s.lat, lng: s.lon },
      pipelineStatus: 'draft' as const,
      unitCount: 0,
      hierarchyLevel: 2,
      vertical: 'municipal' as const,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${s.name} @ ${s.lat},${s.lon}`);
    } else {
      const ref = await db.collection('authorities').add(doc);
      console.log(`✓  CREATED: ${s.name} → ${ref.id}`);
    }
    created++;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
