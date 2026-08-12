#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-ramat-gan-reconcile.ts
 *
 * Ramat Gan neighborhood reconcile — part of the autonomous Tier-1 city
 * mapping run (policy approved by David 12.08.2026: ship confident items
 * automatically, park anything uncertain in the consolidated final
 * report, never ship a guessed coordinate).
 *
 * Source: official Ramat Gan Engineering Division document ("שכונות רמת
 * גן", handasa.ramat-gan.muni.il, dated April 2023) — a citywide
 * neighborhood-policy/master-plan status map with an alphabetized table
 * of 19 policy neighborhoods, several of which combine 2-3 real distinct
 * sub-names into one planning row. Cross-checked against Wikipedia +
 * real-estate sources + OSM for the split names and centroids. No GIS
 * dataset exists (GovMap layer 222893 is session-gated, not public; no
 * Ramat Gan ArcGIS Online org found).
 *
 * Reconciliation:
 *   - מרום נווה, רמת חן, קריניצי kept fully unchanged (clean matches —
 *     קריניצי's official full form "קריית קריניצי" is a prefix-variant
 *     only, same treatment as Holon's קרית/קריית spellings, not renamed).
 *   - מרכז העיר: the municipality's own table uses "לב העיר" for this
 *     exact area — a genuine alternate name, not a spelling variant.
 *     Renamed (same id, doc UPDATED not recreated) to "לב העיר · מרכז
 *     העיר" (official · commonly-used local term, middle-dot format).
 *     Coordinate left untouched (no confidently-resolved replacement
 *     value for this specific rename).
 *   - מתחם הבורסה: confirmed as a REAL official neighborhood (approved
 *     תב"ע 16.2.22), but current on-the-ground character is a business/
 *     diamond-exchange district with residential towers only newly
 *     approved/under construction. Genuine edge case — left completely
 *     untouched (non-destructive, already-shipped entry), flagged in the
 *     final consolidated report for David's manual call rather than
 *     silently kept or removed.
 *   - Two multi-name planning-table rows split into their real, distinct,
 *     separately-recognized sub-names (each independently confirmed via
 *     Wikipedia/real-estate/OSM as its own place): "הגפן ונחלת גנים" →
 *     הגפן + נחלת גנים; "יד לבנים, נגבה ותל יהודה" → יד לבנים + נגבה +
 *     תל יהודה.
 *
 * 20 net-new entries shipped: 17 direct high-confidence OSM
 * suburb/administrative-boundary hits + 3 landmark/street-anchored
 * (still an acceptable coordinate source per policy) — see full list
 * below. הביל״ויים resolved via its own named street inside the
 * OSM-labeled "אזור הבילויים" area.
 *
 * PARKED — not shipped (see final consolidated report for detail):
 *   - תל השומר: good coordinate, but the specific large new residential
 *     mega-development there is explicitly under construction, core
 *     area otherwise institutional (Sheba Medical Center campus).
 *   - בר אילן: good coordinate, but weak evidence it's a distinct
 *     residential neighborhood rather than just the university's own
 *     campus/street — absent from Wikipedia's own neighborhoods list.
 *   - שיכון הצנחנים: resolved only via a street proxy that falls inside
 *     נגבה's own address range (109m from its centroid) — may be a
 *     sub-pocket of נגבה rather than a distinct neighborhood.
 *   - ציר ז'בוטינסקי: not an established residential neighborhood at
 *     all — a redevelopment boulevard/corridor; zero geocode results.
 *
 * Excluded as non-residential (PARKED): הפארק הלאומי (national
 * park/recreation area).
 *
 * No cluster/grouping field found — the source's only structured field
 * is a תב"ע planning-status classification (approved/in-prep/future),
 * not a geographic cluster, so none added.
 *
 * A pre-existing set of orphaned coordinate keys was found
 * (rg-kikar-hamedina, rg-geha, rg-borochov — none match a real picker
 * id) — left untouched, flagged for the later cleanup commit.
 * rg-ramat-amidar's old orphaned value (~690m off) was replaced with the
 * fresh researched centroid since that id is now wired to a real entry.
 *
 * Idempotent — checks for an existing doc by name before creating; the
 * מרכז העיר rename is a separate, explicit step (safe to re-run).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ramat-gan-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ramat-gan-reconcile.ts
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
const RAMAT_GAN_AUTHORITY_ID = 'oXy7Fccw2FFbFd6vAPY3';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'הלל', lat: 32.0814179, lon: 34.8229026 },
  { name: 'הראשונים', lat: 32.0808251, lon: 34.8036698 },
  { name: 'ותיקים', lat: 32.0929205, lon: 34.8126561 },
  { name: 'חרוזים', lat: 32.0902915, lon: 34.8038868 },
  { name: 'הגפן', lat: 32.0892542, lon: 34.8120484 },
  { name: 'נחלת גנים', lat: 32.0932945, lon: 34.8196188 },
  { name: 'יד לבנים', lat: 32.0771293, lon: 34.8226476 },
  { name: 'נגבה', lat: 32.0669969, lon: 34.8251045 },
  { name: 'תל יהודה', lat: 32.0723428, lon: 34.8216551 },
  { name: 'נווה יהושע', lat: 32.0602597, lon: 34.8322006 },
  { name: 'קריית בורוכוב', lat: 32.0686516, lon: 34.8195469 },
  { name: 'רמת אפעל', lat: 32.0473597, lon: 34.8348769 },
  { name: 'רמת עמידר', lat: 32.0677058, lon: 34.8364374 },
  { name: 'רמת שקמה', lat: 32.0505330, lon: 34.8172615 },
  { name: 'שיכון מזרחי', lat: 32.0669560, lon: 34.8305225 },
  { name: 'תל בנימין', lat: 32.0855223, lon: 34.8068322 },
  { name: 'תל גנים', lat: 32.0651255, lon: 34.8179318 },
  { name: 'כפר אז״ר', lat: 32.0564642, lon: 34.8415912 },
  { name: 'רמת יצחק', lat: 32.0749395, lon: 34.8231287 },
  { name: 'הביל״ויים', lat: 32.0605764, lon: 34.8231378 },
];

const MERKAZ_RENAME = {
  oldName: 'מרכז העיר',
  newName: 'לב העיר · מרכז העיר',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Ramat Gan (${RAMAT_GAN_AUTHORITY_ID}): ${NEW_NEIGHBORHOODS.length} new + 1 rename ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', RAMAT_GAN_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  const merkazDoc = existingByName.get(MERKAZ_RENAME.oldName);
  if (merkazDoc) {
    if (DRY_RUN) {
      console.log(`  WOULD UPDATE (name only): ${MERKAZ_RENAME.oldName} → ${MERKAZ_RENAME.newName}`);
    } else {
      await merkazDoc.ref.update({
        name: MERKAZ_RENAME.newName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓  UPDATED: ${MERKAZ_RENAME.oldName} → ${MERKAZ_RENAME.newName}`);
    }
  } else {
    console.log(`⚠️  מרכז העיר doc not found by name — skipping rename (already renamed, or name mismatch)`);
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
      parentAuthorityId: RAMAT_GAN_AUTHORITY_ID,
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
