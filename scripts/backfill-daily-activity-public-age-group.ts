#!/usr/bin/env npx tsx
/**
 * backfill-daily-activity-public-age-group.ts
 *
 * One-time admin script — MUST run before deploying the new firestore.rules
 * dailyActivityPublic guard (SPEC-04 Wave B, 10.09.2026).
 *
 * dailyActivityPublicSync (functions/src/dailyActivityPublicSync.ts) now
 * writes an `ageGroup` field on every dailyActivityPublic/{uid}_{date} doc
 * it syncs — but it only re-syncs TODAY's date on each run (historical days
 * are intentionally never re-touched once written, see that file's own
 * comment on why). getStepsLeaderboard's query window is the last 7 days,
 * so without this script, every doc written before the Cloud Function
 * deploy stays permanently missing `ageGroup` until it ages out of that
 * 7-day window on its own (up to 6 days after deploy).
 *
 * That's not just "stale data" — the new firestore.rules read rule requires
 * `resource.data.ageGroup == getUserAgeGroup(request.auth.uid)`. A doc
 * with no ageGroup field never satisfies that for ANY caller, so every
 * un-backfilled doc becomes completely unreadable (rejected by the query's
 * own required where('ageGroup','==', X) clause) rather than just missing
 * ageGroup — i.e. everyone's steps silently vanish from the leaderboard for
 * up to 6 days, not a cosmetic gap.
 *
 * DEPLOYMENT ORDER (matches backfill-age-group.ts's own pattern):
 *   1. Run this script (--dry-run first, then live).
 *   2. THEN deploy firestore.rules with the new dailyActivityPublic guard
 *      AND the updated dailyActivityPublicSync Cloud Function together.
 *
 * Behaviour
 * ─────────
 *   • Idempotent — safe to re-run.
 *   • Reads ageGroup from userAge/{uid} (same source the rule itself
 *     reads via getUserAgeGroup()) — NOT from users/{uid}.core.ageGroup,
 *     so this script's notion of "correct" always matches what the rule
 *     will actually accept.
 *   • Only touches the last 7 days (dailyActivityPublic's own real query
 *     window) — older docs are already unreachable by any live query and
 *     backfilling them would be pure waste.
 *   • Missing userAge/{uid} → 'minor' (fail-closed, matches
 *     getUserAgeGroup()'s own rule-side default).
 *   • Supports --dry-run for a no-write preview.
 *
 * Usage
 * ─────
 *   npx tsx scripts/backfill-daily-activity-public-age-group.ts --dry-run
 *   npx tsx scripts/backfill-daily-activity-public-age-group.ts
 *
 * Prerequisites
 * ─────────────
 *   • GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service
 *     account key with Firestore admin permissions
 *   • OR run on a machine with `gcloud auth application-default login`
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const WINDOW_DAYS = 7;
const COMMIT_BATCH_SIZE = 400;
const USER_AGE_LOOKUP_CHUNK = 300; // getAll()'s comfortable per-call ref count

interface Stats {
  scanned: number;
  alreadyCorrect: number;
  backfilled: number;
  errors: string[];
}

const stats: Stats = { scanned: 0, alreadyCorrect: 0, backfilled: 0, errors: [] };

function windowDateStrings(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function resolveAgeGroups(uids: string[]): Promise<Map<string, 'minor' | 'adult'>> {
  const result = new Map<string, 'minor' | 'adult'>();
  for (let i = 0; i < uids.length; i += USER_AGE_LOOKUP_CHUNK) {
    const chunk = uids.slice(i, i + USER_AGE_LOOKUP_CHUNK);
    try {
      const refs = chunk.map((uid) => db.doc(`userAge/${uid}`));
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, idx) => {
        const ageGroup = snap.exists ? (snap.data()?.ageGroup as string | undefined) : undefined;
        result.set(chunk[idx], ageGroup === 'adult' ? 'adult' : 'minor');
      });
    } catch (e: any) {
      stats.errors.push(`userAge lookup chunk failed: ${e?.message || String(e)}`);
      chunk.forEach((uid) => result.set(uid, 'minor'));
    }
  }
  return result;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '\n=== DRY RUN (no writes) ===' : '\n=== LIVE BACKFILL ===');

  const dates = windowDateStrings(WINDOW_DAYS);
  console.log(`Scanning dailyActivityPublic for dates: ${dates.join(', ')}\n`);

  const start = Date.now();

  for (const date of dates) {
    const snap = await db.collection('dailyActivityPublic').where('date', '==', date).get();
    if (snap.empty) {
      console.log(`  ${date}: 0 docs`);
      continue;
    }

    const uids = Array.from(
      new Set(snap.docs.map((d) => d.data().uid as string | undefined).filter((v): v is string => !!v)),
    );
    const ageGroups = await resolveAgeGroups(uids);

    let batch = db.batch();
    let pendingWrites = 0;
    let backfilledThisDate = 0;

    for (const doc of snap.docs) {
      stats.scanned++;
      const data = doc.data();
      const uid = data.uid as string | undefined;
      if (!uid) continue;

      if (data.ageGroup === 'minor' || data.ageGroup === 'adult') {
        stats.alreadyCorrect++;
        continue;
      }

      const ageGroup = ageGroups.get(uid) ?? 'minor';
      stats.backfilled++;
      backfilledThisDate++;

      if (!dryRun) {
        batch.update(doc.ref, { ageGroup });
        pendingWrites++;
        if (pendingWrites >= COMMIT_BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          pendingWrites = 0;
        }
      }
    }

    if (!dryRun && pendingWrites > 0) {
      await batch.commit();
    }

    console.log(`  ${date}: ${snap.size} docs, ${backfilledThisDate} backfilled`);
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════');
  console.log(`${dryRun ? 'Preview' : 'Backfill'} complete in ${elapsedSec}s.`);
  console.log(`  Total docs scanned:      ${stats.scanned}`);
  console.log(`  Already correct (no-op): ${stats.alreadyCorrect}`);
  console.log(`  ageGroup backfilled:     ${stats.backfilled}`);
  console.log(`  Errors:                  ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    stats.errors.slice(0, 20).forEach((e) => console.log(`     • ${e}`));
  }

  if (dryRun && stats.backfilled > 0) {
    console.log('\nRun WITHOUT --dry-run to apply changes.');
  }
}

run().catch((err) => {
  console.error('\n❌ Backfill failed:', err);
  process.exit(1);
});
