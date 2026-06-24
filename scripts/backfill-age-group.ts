#!/usr/bin/env npx tsx
/**
 * backfill-age-group.ts
 *
 * One-time admin script — MUST run before deploying the new Firestore rules.
 *
 * Writes TWO documents per user from `core.birthDate`:
 *   1. `users/{uid}.core.ageGroup` — 'minor' if age < 18, 'adult' otherwise.
 *   2. `userAge/{uid}` — tiny mirror doc consumed by the new presence write
 *      rule (avoids the 1 MiB get() limit on large user profiles).
 *
 * DEPLOYMENT ORDER (no-downtime migration):
 *   1. Run this script (--dry-run first, then live).
 *   2. Verify all users have `userAge/{uid}` written.
 *   3. THEN deploy `firestore.rules` with the new presence + users guards.
 *
 * If rules are deployed before data is ready:
 *   • Missing `userAge/{uid}` → getUserAgeGroup() returns 'minor'
 *     → presence writes with mode≠ghost|group are rejected.
 *   • This breaks presence for ALL unbackfilled users — hence the order.
 *
 * Behaviour
 * ─────────
 *   • Idempotent — safe to re-run; recomputes ageGroup from birthDate.
 *   • Skips users with no `core.birthDate` (cannot derive — listed in report).
 *   • Flags under-14 users for manual review; does NOT auto-delete them.
 *   • Batches writes (Firestore commit limit = 500) and paginates reads
 *     (1 000 users / page) so it scales to large user bases.
 *   • Supports --dry-run for a no-write preview.
 *
 * Usage
 * ─────
 *   npx tsx scripts/backfill-age-group.ts --dry-run    # preview
 *   npx tsx scripts/backfill-age-group.ts              # execute
 *
 * Prerequisites
 * ─────────────
 *   • GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service
 *     account key with Firestore admin permissions
 *   • OR run on a machine with `gcloud auth application-default login`
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const PAGE_SIZE = 1_000;
const COMMIT_BATCH_SIZE = 400; // safety margin under the 500 hard cap
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MINOR_THRESHOLD_YEARS = 18;
const UNDER_AGE_FLAG_YEARS = 14; // sign-up gate per Phase 2.1

type AgeGroup = 'minor' | 'adult';

interface Stats {
  scanned: number;
  alreadyCorrect: number;
  backfilled: number;
  changedExisting: number; // ageGroup was set to a wrong value, fixed it
  missingBirthDate: number;
  unparseableBirthDate: number;
  under14Flagged: string[]; // uids — printed at the end for manual review
  errors: string[];
}

const stats: Stats = {
  scanned: 0,
  alreadyCorrect: 0,
  backfilled: 0,
  changedExisting: 0,
  missingBirthDate: 0,
  unparseableBirthDate: 0,
  under14Flagged: [],
  errors: [],
};

/**
 * Convert a stored birthDate value to a Date. Accepts Firestore
 * Timestamp (canonical), ISO string, JS Date, or { seconds, nanoseconds }
 * shape (rare but possible after manual imports).
 */
function toDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw instanceof Timestamp) return raw.toDate();
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in (raw as any)) {
    const seconds = Number((raw as any).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1_000);
  }
  return null;
}

function deriveAgeGroup(birthDate: Date): { ageYears: number; ageGroup: AgeGroup } {
  const ageYears = (Date.now() - birthDate.getTime()) / MS_PER_YEAR;
  return { ageYears, ageGroup: ageYears < MINOR_THRESHOLD_YEARS ? 'minor' : 'adult' };
}

async function processPage(
  startAfterId: string | null,
  dryRun: boolean,
): Promise<{ lastId: string | null; pageSize: number }> {
  let q = db.collection('users').orderBy('__name__').limit(PAGE_SIZE);
  if (startAfterId) q = q.startAfter(startAfterId);

  const snap = await q.get();
  if (snap.empty) return { lastId: null, pageSize: 0 };

  let batch = db.batch();
  let pendingWrites = 0;

  for (const doc of snap.docs) {
    stats.scanned++;
    try {
      const data = doc.data() as any;
      const core = data?.core;
      if (!core) {
        stats.missingBirthDate++;
        continue;
      }

      const birthDate = toDate(core.birthDate);
      if (!birthDate) {
        if (core.birthDate == null) stats.missingBirthDate++;
        else stats.unparseableBirthDate++;
        continue;
      }

      const { ageYears, ageGroup } = deriveAgeGroup(birthDate);
      if (ageYears < UNDER_AGE_FLAG_YEARS) {
        stats.under14Flagged.push(`${doc.id} (age=${ageYears.toFixed(1)})`);
      }

      const existing = core.ageGroup;
      const ageGroupAlreadyCorrect = existing === ageGroup;

      if (ageGroupAlreadyCorrect) {
        stats.alreadyCorrect++;
      } else if (existing === 'minor' || existing === 'adult') {
        stats.changedExisting++;
      } else {
        stats.backfilled++;
      }

      if (!dryRun) {
        // Always write userAge/{uid} — it must exist for every user with a
        // birthDate so the presence write rule can evaluate getUserAgeGroup().
        // The early-exit bug (continue on alreadyCorrect) caused userAge to be
        // missing for users whose core.ageGroup was already set before this
        // backfill was introduced.
        const userAgeRef = db.collection('userAge').doc(doc.id);
        batch.set(userAgeRef, { ageGroup, computedAt: Timestamp.now() }, { merge: true });
        pendingWrites++;

        // Only touch users/{uid} when ageGroup actually changed.
        if (!ageGroupAlreadyCorrect) {
          batch.update(doc.ref, { 'core.ageGroup': ageGroup });
          pendingWrites++;
        }

        if (pendingWrites >= COMMIT_BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          pendingWrites = 0;
        }
      }
    } catch (e: any) {
      stats.errors.push(`${doc.id}: ${e?.message || String(e)}`);
    }
  }

  if (!dryRun && pendingWrites > 0) {
    await batch.commit();
  }

  return { lastId: snap.docs[snap.docs.length - 1].id, pageSize: snap.size };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '\n=== DRY RUN (no writes) ===' : '\n=== LIVE BACKFILL ===');
  console.log('Scanning `users` collection page by page...\n');

  const start = Date.now();
  let cursor: string | null = null;
  let page = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page++;
    const { lastId, pageSize } = await processPage(cursor, dryRun);
    if (pageSize === 0) break;
    console.log(`  page ${page}: scanned ${pageSize} users (running total: ${stats.scanned})`);
    if (pageSize < PAGE_SIZE) break;
    cursor = lastId;
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════');
  console.log(`${dryRun ? 'Preview' : 'Backfill'} complete in ${elapsedSec}s.`);
  console.log(`  Total users scanned:           ${stats.scanned}`);
  console.log(`  Already correct (no-op):       ${stats.alreadyCorrect}`);
  console.log(`  ageGroup written (was empty):  ${stats.backfilled}`);
  console.log(`  ageGroup fixed (was wrong):    ${stats.changedExisting}`);
  console.log(`  Missing birthDate (skipped):   ${stats.missingBirthDate}`);
  console.log(`  Unparseable birthDate:         ${stats.unparseableBirthDate}`);
  console.log(`  Errors:                        ${stats.errors.length}`);

  if (stats.under14Flagged.length > 0) {
    console.log(`\n⚠️  ${stats.under14Flagged.length} user(s) under 14 detected — manual review required:`);
    stats.under14Flagged.slice(0, 50).forEach((u) => console.log(`     • ${u}`));
    if (stats.under14Flagged.length > 50) {
      console.log(`     …and ${stats.under14Flagged.length - 50} more`);
    }
  }

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    stats.errors.slice(0, 20).forEach((e) => console.log(`     • ${e}`));
    if (stats.errors.length > 20) {
      console.log(`     …and ${stats.errors.length - 20} more`);
    }
  }

  if (stats.missingBirthDate > 0) {
    console.log(
      `\nℹ️  ${stats.missingBirthDate} users have no birthDate — they cannot start new DMs ` +
        `until they re-onboard or you backfill birthDate manually.`,
    );
  }

  if (dryRun && (stats.backfilled > 0 || stats.changedExisting > 0)) {
    console.log('\nRun WITHOUT --dry-run to apply changes.');
  }
}

run().catch((err) => {
  console.error('\n❌ Backfill failed:', err);
  process.exit(1);
});
