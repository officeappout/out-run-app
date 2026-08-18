/**
 * scripts/backfill-climb-segments-authority.ts — Stage 2.4 (route-enrichment-
 * pipeline plan)
 *
 * `climb_segments` docs have never had `authorityId` set by any writer
 * (confirmed — write-climb-segments-tlv.ts never sets it; the ClimbSegment
 * type's `authorityId` field was added in Stage 1A specifically as a
 * "required going forward, not yet backfilled" field). This script resolves
 * authorityId for existing docs from their existing `city` string, using the
 * same fuzzy name-matcher (findAuthorityByCityName) the route-enrichment
 * chokepoint already shares — reused here, not reimplemented.
 *
 * Small dataset (TLV-only per the current climb_segments population) — every
 * proposed mapping is meant to be eyeballed, not blanket-approved. Dry-run
 * prints the full city -> authorityId mapping AND a per-doc breakdown; any
 * unmatched city is flagged for manual review, never silently skipped.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints the full mapping):
 *     npx tsx scripts/backfill-climb-segments-authority.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-climb-segments-authority.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so dotenv/.env.local + the src/lib import resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  climb_segments Authority Backfill     [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after full manual review).\n');
  }

  const { findAuthorityByCityName } = await import('../src/lib/route-collections/authority-resolution');

  console.log('📊 Fetching climb_segments...');
  const climbSnap = await db.collection('climb_segments').get();
  console.log(`   ${climbSnap.size} doc(s) total.`);

  const needsAuthority = climbSnap.docs.filter((d) => {
    const data = d.data();
    return !data.authorityId || data.authorityId === '';
  });
  const alreadySet = climbSnap.size - needsAuthority.length;
  console.log(`   ${needsAuthority.length} missing authorityId, ${alreadySet} already set (skipped either way).\n`);

  console.log('📊 Fetching authorities...');
  const authoritySnap = await db.collection('authorities').get();
  const authorityList = authoritySnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || '' }));
  console.log(`   ${authorityList.length} known authorities.\n`);

  // Group by city so the mapping is computed once per unique city, not once
  // per doc — a small dataset, but no reason to re-resolve the same string
  // repeatedly, and it makes the printed mapping easier to review.
  const byCity = new Map<string, typeof needsAuthority>();
  for (const d of needsAuthority) {
    const city = (d.data().city as string) || '(no city)';
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city)!.push(d);
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              CITY → AUTHORITY MAPPING                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const resolvedDocs: Array<{ id: string; authorityId: string }> = [];
  const unresolvedCities: string[] = [];

  for (const [city, docs] of Array.from(byCity.entries())) {
    const authorityId = city === '(no city)' ? null : findAuthorityByCityName(city, authorityList);
    if (authorityId) {
      const authorityName = authorityList.find((a) => a.id === authorityId)?.name;
      console.log(`  ✔ "${city}" → ${authorityId} ("${authorityName}")  [${docs.length} doc(s)]`);
      docs.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => resolvedDocs.push({ id: d.id, authorityId }));
    } else {
      console.log(`  ✘ "${city}" → UNRESOLVED  [${docs.length} doc(s)] — flagged for manual review, NOT auto-mapped`);
      unresolvedCities.push(city);
    }
  }

  console.log('\n── per-doc breakdown (resolved) ──');
  for (const { id, authorityId } of resolvedDocs) {
    const doc = needsAuthority.find((d) => d.id === id)!;
    const data = doc.data();
    console.log(`  ${id}  type=${data.type}  climbType=${data.climbType}  city="${data.city}"  →  authorityId=${authorityId}`);
  }

  if (unresolvedCities.length > 0) {
    console.log('\n── per-doc breakdown (UNRESOLVED — needs manual review) ──');
    for (const city of unresolvedCities) {
      for (const d of byCity.get(city)!) {
        const data = d.data();
        console.log(`  ${d.id}  type=${data.type}  climbType=${data.climbType}  city="${data.city}"  →  ??? (no confident match)`);
      }
    }
  }

  if (isApply) {
    if (resolvedDocs.length === 0) {
      console.log('\nNothing to apply — 0 resolved docs.');
    } else {
      const CHUNK = 450;
      let applied = 0;
      for (let i = 0; i < resolvedDocs.length; i += CHUNK) {
        const slice = resolvedDocs.slice(i, i + CHUNK);
        const batch = db.batch();
        for (const { id, authorityId } of slice) {
          batch.update(db.collection('climb_segments').doc(id), {
            authorityId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        applied += slice.length;
        console.log(`  ✔ committed ${applied}/${resolvedDocs.length}`);
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Total climb_segments:    ${String(climbSnap.size).padEnd(31)}║`);
  console.log(`║  Already had authorityId: ${String(alreadySet).padEnd(31)}║`);
  console.log(`║  Resolved this run:       ${String(resolvedDocs.length).padEnd(31)}║`);
  console.log(`║  Unresolved (manual):     ${String(needsAuthority.length - resolvedDocs.length).padEnd(31)}║`);
  console.log(`║  Distinct cities seen:    ${String(byCity.size).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Applied:                   ' + String(resolvedDocs.length).padEnd(31) : 'Run with --apply to write' + ' '.padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (unresolvedCities.length > 0) {
    console.log(`\n⚠️  ${unresolvedCities.length} city string(s) could not be confidently matched — review manually, never auto-mapped.`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
