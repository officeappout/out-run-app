/**
 * scripts/backfill-military-arm-status.ts — one-time backfill, committed
 * (writes real production data, per the project convention that
 * data-mutating migration scripts stay committed, unlike throwaway
 * read-only investigation scripts).
 *
 * Part of Phase 3a (docs/research/military-persona-unified-architecture.md,
 * §3a) of the military-persona work: extracts `armType`/`statusCategory`
 * from the parenthetical suffix of each military authority's `name` (e.g.
 * `"חטיבה 11 (חי"ר - מילואים)"` -> armType="חי"ר", statusCategory="מילואים")
 * and writes them as real fields on `authorities/{id}`.
 *
 * The SAME extraction algorithm is hand-duplicated in
 * functions/src/onAuthorityWrite.ts (exported as `extractArmAndStatus`) —
 * this script cannot import from functions/src (separate tsconfig root,
 * same cross-project boundary as persona-alias-map.service.ts). Keep the
 * two in sync by hand if the algorithm ever changes.
 *
 * RUN ORDER MATTERS: run this BEFORE the initial unitDirectory sync ever
 * runs against these 43 brigades — onAuthorityWrite's unitDirectory write
 * reads armType/statusCategory off the authority doc, so an empty value
 * here would propagate into the directory on its first pass. Since this
 * script's writes themselves re-trigger onAuthorityWrite (once deployed),
 * that trigger will see the newly-backfilled values immediately and
 * correctly no-op on re-computing them (idempotency guard) while still
 * performing its own unitDirectory upsert — so running this after deploy
 * also self-heals, just with one extra redundant round-trip per doc.
 *
 * SAFE BY DEFAULT: no flags = backup + dry-run plan only, zero writes.
 * --confirm executes. Idempotent: re-running after success finds nothing
 * left to backfill.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// Starting set observed in live production brigade names — not exhaustive.
const STATUS_VALUES = new Set(['סדיר', 'מילואים', 'מרחבית']);

interface ExtractedArmStatus {
  armType: string | null;
  statusCategory: string | null;
}

// Mirrors functions/src/onAuthorityWrite.ts's extractArmAndStatus() exactly.
function extractArmAndStatus(name: string): ExtractedArmStatus {
  const trimmed = name.trim();
  const match = trimmed.match(/\(([^()]+)\)\s*$/);
  if (!match) return { armType: null, statusCategory: null };

  const normalized = match[1].replace(/[–־]/g, '-');
  const parts = normalized
    .split(/\s*-\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length >= 2) {
    return { armType: parts[0], statusCategory: parts[1] };
  }
  if (parts.length === 1) {
    if (STATUS_VALUES.has(parts[0])) {
      return { armType: null, statusCategory: parts[0] };
    }
    return { armType: parts[0], statusCategory: null };
  }
  return { armType: null, statusCategory: null };
}

function isMilitaryAuthority(data: FirebaseFirestore.DocumentData): boolean {
  const tenantType = typeof data.tenantType === 'string' ? data.tenantType : null;
  if (tenantType) return tenantType === 'military';
  const vertical = typeof data.vertical === 'string' ? data.vertical : null;
  if (vertical) return vertical === 'military';
  const type = typeof data.type === 'string' ? data.type.toLowerCase() : '';
  return (
    type === 'military' ||
    type === 'military_unit' ||
    type.includes('military') ||
    type.includes('army') ||
    type.includes('צבא')
  );
}

async function backup(docs: admin.firestore.QueryDocumentSnapshot[]) {
  const out = docs.map((d) => ({ path: d.ref.path, data: d.data() }));
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `military-arm-status-backfill-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const allSnap = await db.collection('authorities').get();
  const militaryDocs = allSnap.docs.filter((d) => isMilitaryAuthority(d.data()));
  console.log(`found ${militaryDocs.length} military authority doc(s) out of ${allSnap.size} total`);

  const backupFile = await backup(militaryDocs);
  console.log(`\n✅ backup written: ${backupFile}`);

  const noParenNames: string[] = [];
  const unrecognizedStatusValues = new Set<string>();
  const targets: { doc: admin.firestore.QueryDocumentSnapshot; armType: string | null; statusCategory: string | null }[] = [];
  let alreadyCorrect = 0;

  console.log('\n=== BACKFILL PLAN (dry-run unless --confirm) ===');
  for (const doc of militaryDocs) {
    const data = doc.data();
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      console.log(`  ${doc.id}: NO NAME — skipped, cannot extract anything`);
      continue;
    }

    const { armType, statusCategory } = extractArmAndStatus(name);

    if (!name.match(/\([^()]+\)\s*$/)) {
      noParenNames.push(`${doc.id} ("${name}")`);
    }
    if (statusCategory && !STATUS_VALUES.has(statusCategory)) {
      unrecognizedStatusValues.add(statusCategory);
    }

    const alreadyMatches = (data.armType ?? null) === armType && (data.statusCategory ?? null) === statusCategory;
    if (alreadyMatches) {
      alreadyCorrect++;
      continue;
    }

    targets.push({ doc, armType, statusCategory });
    console.log(`  ${doc.id} ("${name}"): armType ${JSON.stringify(data.armType ?? null)} -> ${JSON.stringify(armType)}, statusCategory ${JSON.stringify(data.statusCategory ?? null)} -> ${JSON.stringify(statusCategory)}`);
  }

  console.log(`\n${targets.length} doc(s) need updating, ${alreadyCorrect} already correct (idempotent no-op).`);

  if (noParenNames.length > 0) {
    console.log(`\n⚠️  ${noParenNames.length} name(s) have NO parenthetical suffix (expected to be empty after Phase 1's 810-dedup cleanup — non-empty here signals that cleanup wasn't fully applied):`);
    noParenNames.forEach((n) => console.log(`    ${n}`));
  }
  if (unrecognizedStatusValues.size > 0) {
    console.log(`\n⚠️  Unrecognized statusCategory value(s) found (stored as-is, but review before trusting them as a closed enum elsewhere): ${Array.from(unrecognizedStatusValues).join(', ')}`);
  }

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  console.log('\n--confirm passed — executing backfill now.');
  const BATCH_SIZE = 400;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = targets.slice(i, i + BATCH_SIZE);
    for (const { doc, armType, statusCategory } of chunk) {
      batch.update(doc.ref, {
        armType,
        statusCategory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`  committed batch ${i / BATCH_SIZE + 1} (${chunk.length} docs)`);
  }
  console.log('\n✅ backfill committed.');

  // Sanity check: re-read every updated doc, confirm the fields persisted.
  let sanityFailures = 0;
  for (const { doc, armType, statusCategory } of targets) {
    const fresh = await doc.ref.get();
    const freshData = fresh.data() ?? {};
    if ((freshData.armType ?? null) !== armType || (freshData.statusCategory ?? null) !== statusCategory) {
      console.error(`❌ SANITY CHECK FAILED for ${doc.id}: expected armType=${armType} statusCategory=${statusCategory}, got armType=${freshData.armType} statusCategory=${freshData.statusCategory}`);
      sanityFailures++;
    }
  }
  console.log(`\nsanity check: ${sanityFailures} doc(s) failed to persist correctly (expect 0).`);

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
