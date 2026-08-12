#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-beit-shemesh-reconcile.ts
 *
 * Beit Shemesh neighborhood reconcile — part of the autonomous Tier-1
 * city mapping run (policy approved by David 12.08.2026: ship confident
 * items automatically, park anything uncertain in the consolidated final
 * report, never ship a guessed coordinate).
 *
 * Source: MEDIUM confidence — no official structured GIS dataset exists
 * for Beit Shemesh (checked and ruled out: data.gov.il/CBS only has
 * statistical-area geometry not neighborhood names; the municipality's
 * own ArcGIS org's closest layers are urban-renewal project footprints,
 * not neighborhoods; a nationwide-looking "שכונות" FeatureServer is
 * actually Tel Aviv-only, a false lead). Fallback used per policy:
 * Hebrew Wikipedia cross-validated against OSM/Nominatim quarter
 * polygons + real-estate sources (Yad2, Madlan, developer pages) — all
 * three converged on names/numbering/geography, which is why this is
 * MEDIUM not LOW confidence, but it is explicitly not an official
 * source.
 *
 * Beit Shemesh is a fast-growing city with heavy active construction —
 * the research pass actively checked EVERY candidate for "בבניה"/
 * under-construction/unpopulated signals before recommending it. Only 6
 * of a much longer candidate list cleared that bar.
 *
 * Reconciliation: all 5 existing entries kept fully unchanged (רמת בית
 * שמש א/ב/ג/ד and העיר הוותיקה all remain umbrellas — this run adds
 * their real, distinct, populated sub-area names alongside).
 *
 * 6 net-new entries shipped, all cross-validated + confirmed populated:
 * גבעת שרת, פסגות השבע (sub-areas of העיר הוותיקה); קריית אבי עזרי,
 * חזון עובדיה (sub-areas of רמת בית שמש ג׳); דובב מישרים, רמת עזרא
 * (sub-areas of רמת בית שמש ד׳).
 *
 * PARKED — explicitly under construction / unpopulated / ambiguous
 * (not shipped, per policy): שפע חיים (ד׳3-מזרח), איילת השחר (ד׳3-מערב),
 * נתיבות ישראל (ד׳4), דרכי שמואל (ד׳5) — all "בתהליכי אכלוסין" or
 * "בשלבי בנייה"; נווה שמיר (ה׳1) — mixed signal, developer pages still
 * list it in construction; רמת בית שמש ה׳ (umbrella) — ה׳2 sub-section
 * explicitly still in planning, zero population; רמת בית שמש ו׳ —
 * purely planned, no population, no independent OSM footprint.
 *
 * PARKED — could not be confidently geocoded / location-uncertain (not
 * shipped): קריית הרב נסים / הקריה החרדית + sub-areas (source data
 * conflicts on which parent neighborhood this belongs to); רמת משה
 * (only surfaces attached to an unrelated war memorial inside a merged
 * OSM polygon); מרכז העיר and שכונת הוותיקים (zero Nominatim results,
 * too generic); רמת אברהם, מזרח שמש, קנה בושם, המשקפיים (unverified,
 * came only from an AI-summarized Wikipedia read, one gloss looked like
 * a mistranslation artifact — do not ship without re-checking the raw
 * source directly); קיבוץ תמוז (only a landmark-anchored imprecise
 * coordinate, and a genuinely different kind of entity — a membership
 * enclave, not an open neighborhood — flagged for manual judgment
 * rather than auto-shipped).
 *
 * Excluded as non-residential (PARKED): 4 industrial zones (אזור
 * התעשייה הצפוני, פארק תעשייה שורק, פארק תעשייה בר טוב ב׳, אזור תעשיה
 * ברוש מערב) + 2 planned ones; the urban-renewal (פינוי-בינוי) project
 * footprint layer (10 items — redevelopment projects over existing
 * built blocks, not standalone neighborhoods).
 *
 * No cluster/grouping field found in any source — none added.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original BEIT SHEMESH block's keys don't match any real
 * picker id — same pattern as several other cities this run). Left
 * untouched, flagged for the later cleanup commit.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-beit-shemesh-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-beit-shemesh-reconcile.ts
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
const BEIT_SHEMESH_AUTHORITY_ID = 'bIGx5m6BKsmMCHpvB6dh';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'גבעת שרת', lat: 31.7407902, lon: 34.9777976 },
  { name: 'פסגות השבע', lat: 31.7478646, lon: 34.9959199 },
  { name: 'קריית אבי עזרי', lat: 31.7040076, lon: 34.9826819 },
  { name: 'חזון עובדיה', lat: 31.7036037, lon: 34.9937219 },
  { name: 'דובב מישרים', lat: 31.7059415, lon: 34.9711772 },
  { name: 'רמת עזרא', lat: 31.7115353, lon: 34.9663951 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Beit Shemesh (${BEIT_SHEMESH_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', BEIT_SHEMESH_AUTHORITY_ID)
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
      parentAuthorityId: BEIT_SHEMESH_AUTHORITY_ID,
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
