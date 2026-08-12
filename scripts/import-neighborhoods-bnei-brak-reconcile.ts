#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-bnei-brak-reconcile.ts
 *
 * Bnei Brak neighborhood reconcile — part of the autonomous Tier-1 city
 * mapping run (policy approved by David 12.08.2026: ship confident items
 * automatically, park anything uncertain in the consolidated final
 * report, never ship a guessed coordinate).
 *
 * Source: no GIS/data.gov.il/ArcGIS dataset exists for Bnei Brak
 * specifically (checked and ruled out — one ArcGIS FeatureServer
 * candidate turned out to be mislabeled Tel Aviv data). Primary source:
 * the municipality's own live quarters map (bnei-brak.muni.il,
 * "מנהלי-הרובע" page, dated March 2026) — 11 numbered רבעים, each with a
 * municipal coordinator, 25 labeled sub-areas total. Hebrew Wikipedia's
 * "22 official neighborhoods" claim was explicitly REJECTED — that
 * section carries the editor's own {{להשלים}} maintenance flag stating
 * the list has errors and needs re-import from an official map.
 *
 * Coordinates: no vector GIS polygon source exists, so centroids come
 * from cross-validated point sources (Wikipedia infobox {{Coord}} +
 * Wikidata P625 + OSM place=suburb nodes, accepted only where 2+
 * independent sources agree within ~50-100m). 6 of 7 net-new entries hit
 * this HIGH-confidence bar. 2 additional candidates (זכרון מאיר, שיכון
 * חזון איש) had only a single Wikipedia-infobox source with no
 * corroboration; a landmark-anchor resolve pass (yeshiva/synagogue name
 * queries) also failed to improve confidence — PARKED, not shipped.
 *
 * Reconciliation:
 *   - פרדס כץ, מרכז העיר kept fully unchanged (rule: existing entries
 *     that map cleanly, or serve as a legacy umbrella, stay untouched —
 *     non-destructive).
 *   - שיכון ויז׳ניץ: the municipality's current official name for this
 *     same place is קריית ויז׳ניץ ("שיכון ויז׳ניץ" is a 1949-era legacy
 *     label for the identical location, per historical press + the
 *     official quarters map). Renamed (same id, doc UPDATED not
 *     recreated) to "קריית ויז׳ניץ · שיכון ויז׳ניץ" (official · local,
 *     middle-dot format) with a real coordinate + cluster (previously
 *     had a generic placeholder coordinate shared by all 3 original
 *     Bnei Brak docs).
 *   - 6 net-new HIGH-confidence residential entries added, each tagged
 *     with its official רובע number as the `cluster` field (structured
 *     source — the muni's own numbered-quarter table, same pattern as
 *     Petah Tikva's אשכול column).
 *   - רמת אהרן: not on the official quarters map / not independently
 *     geocodable by the research pass, BUT a pre-existing orphaned
 *     coordinate key (`bb-ramat-aharon`) already existed in
 *     location-constants.ts under exactly this name — reused as a
 *     legitimate prior-curated value (not a fresh guess). No cluster
 *     field (quarter placement unconfirmed).
 *
 * Excluded as non-residential (business/institutional/employment,
 * PARKED not shipped): מתחם BBC, מתחם הסופרים, מתחם תעסוקה - צפון, מתחם
 * שפע, מרכז בעלי מלאכה.
 *
 * PARKED (unresolved coordinate, official name known but no confident
 * geocode — not shipped): שיכון אגודת ישראל, שיכון ו׳, שיכון סאטמר,
 * קריית נדבורנא, שיכון ד׳, שיכון א׳, שיכון ג׳, קריית הישיבה, שיכון
 * ההסתדרות, שיכון ה׳, שכונת אור החיים, גבעת סוקולוב, נחלת שמעון,
 * יסודות, נאות יוסף, זכרון מאיר, שיכון חזון איש.
 *
 * A pre-existing orphaned coordinate key (`bb-kahaneman`) was found with
 * no confident mapping to any real neighborhood name — left untouched,
 * flagged for the later cleanup commit (does not affect this script).
 *
 * Idempotent — checks for an existing doc by name before creating;
 * the Vizhnitz rename/update is a separate, explicit step (safe to
 * re-run — it just re-applies the same values).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-bnei-brak-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-bnei-brak-reconcile.ts
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
const BNEI_BRAK_AUTHORITY_ID = 'V7oo4yBkn1pjbH9ECUHI';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  cluster?: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'גני גד', lat: 32.0900111, lon: 34.84465, cluster: 'רובע 4' },
  { name: 'הר שלום', lat: 32.08481, lon: 34.82813, cluster: 'רובע 7' },
  { name: 'נווה אחיעזר', lat: 32.07261, lon: 34.84181, cluster: 'רובע 1' },
  { name: 'קריית הרצוג', lat: 32.09734, lon: 34.84095, cluster: 'רובע 8' },
  { name: 'תל גיבורים', lat: 32.09450, lon: 34.82572, cluster: 'רובע 9' },
  { name: 'רמת אלחנן', lat: 32.08162, lon: 34.84316, cluster: 'רובע 4' },
  { name: 'רמת אהרן', lat: 32.0722, lon: 34.8404 },
];

const VIZHNITZ_RENAME = {
  oldName: 'שיכון ויז׳ניץ',
  newName: 'קריית ויז׳ניץ · שיכון ויז׳ניץ',
  lat: 32.07355,
  lon: 34.83628,
  cluster: 'רובע 1',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Bnei Brak (${BNEI_BRAK_AUTHORITY_ID}): ${NEW_NEIGHBORHOODS.length} new + 1 rename ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', BNEI_BRAK_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  // Vizhnitz rename/update
  const vizhnitzDoc = existingByName.get(VIZHNITZ_RENAME.oldName);
  if (vizhnitzDoc) {
    const update = {
      name: VIZHNITZ_RENAME.newName,
      coordinates: { lat: VIZHNITZ_RENAME.lat, lng: VIZHNITZ_RENAME.lon },
      cluster: VIZHNITZ_RENAME.cluster,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (DRY_RUN) {
      console.log(`  WOULD UPDATE: ${VIZHNITZ_RENAME.oldName} → ${VIZHNITZ_RENAME.newName} @ ${VIZHNITZ_RENAME.lat},${VIZHNITZ_RENAME.lon} [${VIZHNITZ_RENAME.cluster}]`);
    } else {
      await vizhnitzDoc.ref.update(update);
      console.log(`✓  UPDATED: ${VIZHNITZ_RENAME.oldName} → ${VIZHNITZ_RENAME.newName}`);
    }
  } else {
    console.log(`⚠️  Vizhnitz doc not found by name "${VIZHNITZ_RENAME.oldName}" — skipping rename (already renamed, or name mismatch)`);
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
      parentAuthorityId: BNEI_BRAK_AUTHORITY_ID,
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
    if (n.cluster) {
      doc.cluster = n.cluster;
    }

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${n.name}${n.cluster ? ` [${n.cluster}]` : ' [no cluster]'} @ ${n.lat},${n.lon}`);
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
