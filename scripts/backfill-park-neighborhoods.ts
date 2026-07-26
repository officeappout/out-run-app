/**
 * Park → Neighborhood Backfill / Reconciliation
 *
 * Model (see .claude memory park-neighborhood-model):
 *   - park.authorityId  = the TOP authority (city / regional_council)
 *   - park.neighborhoodId = the LEAF sub-location (neighborhood / settlement) — new
 *   - park.neighborhoodName = denormalized leaf name for display
 *
 * What this does (additive only — never deletes a field):
 *   1. RECONCILE the pre-existing inconsistency: some parks (e.g. the Sderot
 *      demo) have authorityId pointing at a NEIGHBORHOOD/SETTLEMENT doc. For
 *      those, move that id into neighborhoodId and set authorityId to the
 *      leaf's parentAuthorityId (the city/council). Fills neighborhoodName.
 *   2. LEAVE everything else untouched — parks whose authorityId is already a
 *      top authority keep neighborhoodId empty (hybrid backfill; the spatial
 *      lat/lng → polygon pass is a separate later phase).
 *
 * Usage:
 *   DRY RUN (default — no writes, prints counts + samples):
 *     npx tsx scripts/backfill-park-neighborhoods.ts
 *
 *   LIVE RUN (commits changes):
 *     npx tsx scripts/backfill-park-neighborhoods.ts --commit
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local (same as other scripts)
 *   - firebase-admin + dotenv installed
 *   - Run from the repo root so .env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

// ── Config ────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;
const SAMPLE_LIMIT = 25;

const isCommit = process.argv.includes('--commit');
const mode = isCommit ? 'COMMIT' : 'DRY-RUN';

// ── Init Admin SDK ────────────────────────────────────────────────────

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();

const LEAF_TYPES = new Set(['neighborhood', 'settlement']);

// ── Batch Writer ──────────────────────────────────────────────────────

class BatchWriter {
  private batch = db.batch();
  private count = 0;
  private totalWrites = 0;

  async update(ref: admin.firestore.DocumentReference, data: any) {
    if (isCommit) {
      this.batch.update(ref, data);
      this.count++;
      if (this.count >= BATCH_SIZE) await this.flush();
    }
    this.totalWrites++;
  }

  async flush() {
    if (this.count > 0 && isCommit) {
      await this.batch.commit();
      console.log(`   ✓ flushed batch (${this.count} writes)`);
      this.batch = db.batch();
      this.count = 0;
    }
  }

  get total() { return this.totalWrites; }
}

interface AuthorityLite {
  id: string;
  name: string;
  type: string;
  parentAuthorityId: string | null;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Park → Neighborhood Backfill   [${mode.padEnd(8)}]                ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isCommit) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --commit to apply changes.\n');
  }

  // 1. Load all authorities into a lookup map
  console.log('📍 Loading authorities...');
  const authSnap = await db.collection('authorities').get();
  const authById = new Map<string, AuthorityLite>();
  for (const doc of authSnap.docs) {
    const d = doc.data();
    authById.set(doc.id, {
      id: doc.id,
      name: (d.name ?? '').toString(),
      type: (d.type ?? '').toString(),
      parentAuthorityId: d.parentAuthorityId ?? null,
    });
  }
  console.log(`   ${authById.size} authorities loaded`);

  const isLeaf = (a: AuthorityLite | undefined): boolean =>
    !!a && (LEAF_TYPES.has(a.type) || !!a.parentAuthorityId);

  // 2. Scan parks
  console.log('\n🌳 Scanning parks...');
  const parksSnap = await db.collection('parks').get();

  const stats = {
    total: parksSnap.size,
    reconciled: 0,            // authorityId was a leaf → moved to neighborhoodId
    alreadyConsistent: 0,     // authorityId is top-level AND neighborhoodId already set
    leftEmpty: 0,             // authorityId top-level, no neighborhoodId (hybrid — awaits spatial pass)
    noAuthority: 0,           // authorityId missing/empty
    orphanAuthority: 0,       // authorityId points at a non-existent authority
    leafWithoutParent: 0,     // leaf authority but no parentAuthorityId (cannot derive)
  };
  const reconciledSamples: string[] = [];
  const orphanSamples: string[] = [];

  const writer = new BatchWriter();

  for (const doc of parksSnap.docs) {
    const p = doc.data();
    const parkName = (p.name ?? doc.id).toString();
    const authorityId: string | undefined = p.authorityId ?? undefined;
    const existingNeighborhoodId: string | undefined = p.neighborhoodId ?? undefined;

    if (!authorityId) { stats.noAuthority++; continue; }

    const auth = authById.get(authorityId);
    if (!auth) {
      stats.orphanAuthority++;
      if (orphanSamples.length < SAMPLE_LIMIT) orphanSamples.push(`${parkName} → authorityId=${authorityId} (missing)`);
      continue;
    }

    if (isLeaf(auth)) {
      // RECONCILE: authorityId currently points at a leaf → move it down.
      if (!auth.parentAuthorityId) {
        stats.leafWithoutParent++;
        continue; // cannot derive the top authority — leave untouched
      }
      const leafId = existingNeighborhoodId || auth.id;
      const leaf = authById.get(leafId) ?? auth;
      const update = {
        authorityId: auth.parentAuthorityId,
        neighborhoodId: leafId,
        neighborhoodName: leaf.name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await writer.update(doc.ref, update);
      stats.reconciled++;
      if (reconciledSamples.length < SAMPLE_LIMIT) {
        reconciledSamples.push(`${parkName}: authorityId ${auth.id} (${auth.name}) → parent ${auth.parentAuthorityId}; neighborhoodId=${leafId} (${leaf.name})`);
      }
      continue;
    }

    // authorityId is a TOP authority
    if (existingNeighborhoodId) stats.alreadyConsistent++;
    else stats.leftEmpty++;
  }

  await writer.flush();

  // 3. Report
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    BACKFILL REPORT                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                       ${mode.padEnd(27)}║`);
  console.log(`║  Total parks:                ${String(stats.total).padEnd(27)}║`);
  console.log(`║  Reconciled (leaf→moved):    ${String(stats.reconciled).padEnd(27)}║`);
  console.log(`║  Already consistent:         ${String(stats.alreadyConsistent).padEnd(27)}║`);
  console.log(`║  Left empty (hybrid):        ${String(stats.leftEmpty).padEnd(27)}║`);
  console.log(`║  No authorityId:             ${String(stats.noAuthority).padEnd(27)}║`);
  console.log(`║  Orphan authorityId:         ${String(stats.orphanAuthority).padEnd(27)}║`);
  console.log(`║  Leaf without parent:        ${String(stats.leafWithoutParent).padEnd(27)}║`);
  console.log(`║  Planned writes:             ${String(writer.total).padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (reconciledSamples.length > 0) {
    console.log(`\n🔧 Reconcile samples (first ${reconciledSamples.length}):`);
    reconciledSamples.forEach(s => console.log(`   • ${s}`));
  }
  if (orphanSamples.length > 0) {
    console.log(`\n⚠️  Orphan authorityId samples (first ${orphanSamples.length}):`);
    orphanSamples.forEach(s => console.log(`   • ${s}`));
  }

  if (!isCommit) {
    console.log('\n✅ Dry run complete. Review the report above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/backfill-park-neighborhoods.ts --commit\n');
  } else {
    console.log('\n✅ Backfill committed successfully!\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
