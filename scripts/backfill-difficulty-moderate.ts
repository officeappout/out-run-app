/**
 * scripts/backfill-difficulty-moderate.ts — production data cleanup
 *
 * Fixes already-persisted `official_routes` / `curated_routes` docs whose
 * `difficulty` field holds the invalid value `'moderate'`. `Route.difficulty`
 * is typed `'easy'|'medium'|'hard'` only (route.types.ts:305) — `'moderate'`
 * was written by two independent, now-fixed bugs (scripts/geo-discovery-routes.ts
 * and the admin route-edit page) and is already causing three separate silent
 * failures wherever it's read: NaN calorie estimates (route-ranking.service.ts's
 * difficultyMultiplier lookup), mis-ranking as the HARDEST tier in match scoring,
 * and mis-rendering as the EASIEST bolt-count in the UI. See
 * .claude/knowledge/route-enrichment-pipeline-scoping.md and the approved plan
 * at .claude/plans/route-enrichment-pipeline-kickoff-vast-pelican.md (Stage 0,
 * Phase 0.3) for full context.
 *
 * Scope: ONLY remaps 'moderate' -> 'medium'. Any OTHER unrecognized difficulty
 * value found is reported but NEVER auto-mapped — flagged for manual review,
 * since a different bad value could mean something this script doesn't know.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints every affected doc):
 *     npx tsx scripts/backfill-difficulty-moderate.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-difficulty-moderate.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so dotenv/.env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const COLLECTIONS = ['official_routes', 'curated_routes'] as const;

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

interface AffectedDoc {
  collection: (typeof COLLECTIONS)[number];
  id: string;
  name: string;
  city: string;
  importBatchId: string;
  currentValue: string;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  difficulty:'moderate' Backfill        [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  const moderateFixable: AffectedDoc[] = [];
  const otherUnrecognized: AffectedDoc[] = [];

  for (const collectionName of COLLECTIONS) {
    console.log(`\n📊 Scanning ${collectionName}...`);
    const snap = await db.collection(collectionName).get();
    console.log(`   ${snap.size} doc(s) total.`);

    for (const d of snap.docs) {
      const data = d.data();
      const value = data.difficulty;
      if (typeof value !== 'string' || VALID_DIFFICULTIES.has(value)) continue;

      const entry: AffectedDoc = {
        collection: collectionName,
        id: d.id,
        name: data.name ?? '(no name)',
        city: data.city ?? '(no city)',
        importBatchId: data.importBatchId ?? '(none)',
        currentValue: value,
      };

      if (value === 'moderate') {
        moderateFixable.push(entry);
      } else {
        otherUnrecognized.push(entry);
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AFFECTED DOCS — difficulty:"moderate" (will be fixed)     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (moderateFixable.length === 0) {
    console.log('  (none found)');
  } else {
    for (const e of moderateFixable) {
      console.log(`  [${e.collection}] ${e.id}  city=${e.city}  batch=${e.importBatchId}  "${e.name}"`);
    }
  }

  if (otherUnrecognized.length > 0) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  OTHER UNRECOGNIZED VALUES — NOT auto-fixed, review needed ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    for (const e of otherUnrecognized) {
      console.log(`  [${e.collection}] ${e.id}  value="${e.currentValue}"  city=${e.city}  "${e.name}"`);
    }
  }

  console.log(`\n${isApply ? 'Applying' : '[dry-run] would apply'} ${moderateFixable.length} fix(es) ('moderate' -> 'medium').`);

  if (isApply && moderateFixable.length > 0) {
    // 500-doc chunked batch — same convention as InventoryService.bulkDeleteRoutes
    // / scripts/backfill-route-adjacency.ts.
    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < moderateFixable.length; i += CHUNK) {
      const chunk = moderateFixable.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const e of chunk) {
        batch.update(db.collection(e.collection).doc(e.id), {
          difficulty: 'medium',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${moderateFixable.length}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  'moderate' docs found:   ${String(moderateFixable.length).padEnd(31)}║`);
  console.log(`║  Other unrecognized:      ${String(otherUnrecognized.length).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Fixed this run:            ' + String(moderateFixable.length).padEnd(31) : 'Run with --apply to fix' + ' '.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (otherUnrecognized.length > 0) {
    console.log('\n⚠️  Other unrecognized values were found and were NOT touched — review manually.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
