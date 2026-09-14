#!/usr/bin/env npx tsx
/**
 * backfill-user-public.ts
 *
 * One-time admin script — MUST run before Step 4 (the client-code deploy
 * that starts reading userPublic for search/leaderboards/profile cards).
 *
 * Gap found (10.09.2026, David): userPublicSync (functions/src/userPublicSync.ts)
 * is a write-triggered mirror onto users/{uid}. Its own comment says "Just
 * opted in, or a doc with no mirror yet — always write", but the code only
 * checks `justOptedIn = !beforeDiscoverable` — there is no check of whether
 * userPublic/{uid} actually exists. A user who was ALREADY
 * core.discoverable === true before this function was deployed has
 * beforeDiscoverable === true on every subsequent write too, so
 * justOptedIn is always false for them — and unless a MIRRORED field
 * (name/photoURL/mainGoal/authorityId/ageGroup/initialFitnessTier/
 * currentLevel) actually changes value, the sync never fires. An XP award
 * deliberately does not touch any mirrored field, so this does not
 * self-heal the way presence (2-minute heartbeat) does.
 *
 * Verified impact, not theoretical (checked in code):
 *   - ranking.service.ts's getTenantLeaderboard: a missing userPublic doc
 *     means data?.ageGroup !== callerAgeGroup for EVERY callerAgeGroup, so
 *     the uid lands in excludedForAge and the row vanishes from the
 *     leaderboard entirely — regardless of the user's real age.
 *   - user-search.service.ts's searchUsersByName lists userPublic — a
 *     pre-existing discoverable user with no mirror doc cannot be found
 *     by search at all.
 *   - UserProfileSheet.tsx's ageGroup enrichment read (getDoc on
 *     userPublic) returns nothing, leaving ageGroup unset and the
 *     minor-DM gate unable to positively confirm either side is safe.
 *
 * ⚠️ CRITICAL ORDER — read before running ⚠️
 * ───────────────────────────────────────────
 * This script MUST run AFTER scripts/backfill-age-group.ts, never before.
 * The payload below mirrors users/{uid}.core.ageGroup verbatim (with a
 * 'minor' default when absent) — exactly matching userPublicSync.ts's own
 * source field. If core.ageGroup is missing or stale for a real adult
 * (i.e. backfill-age-group.ts hasn't run yet), this script will faithfully
 * copy that wrong/missing value into userPublic as 'minor' — and every
 * adult backfilled in the wrong order disappears from every ageGroup-
 * scoped search/leaderboard, in the SAME direction as the bug this script
 * exists to fix, just via a different path. Confirm backfill-age-group.ts
 * has already run (live, not dry-run) before running this one live.
 *
 * Behaviour
 * ─────────
 *   • Idempotent — safe to re-run.
 *   • Writes EXACTLY the 8 fields userPublicSync.ts writes, with the SAME
 *     defaults, from the SAME source (users/{uid}.core.* and
 *     users/{uid}.progression.currentLevel) — nothing invented, nothing
 *     omitted:
 *       name ?? 'ללא שם', photoURL ?? null, mainGoal ?? null,
 *       authorityId ?? null, ageGroup ?? 'minor',
 *       initialFitnessTier ?? null, currentLevel ?? null,
 *       updatedAt: serverTimestamp()
 *   • Only touches users/{uid} where core.discoverable === true — a
 *     non-discoverable user correctly has no userPublic doc, matching the
 *     live sync's own opt-out behavior (this script never creates one for
 *     them, and does not delete an existing mirror for a user who opted
 *     out — the live trigger already handles opt-out deletes on its own
 *     write path; this script only ever fills gaps, never removes).
 *   • Skips (counts as "already correct") when the target userPublic/{uid}
 *     doc already holds all 7 real fields (excluding updatedAt) matching
 *     what would be written — a genuine no-op, not just "doc exists".
 *   • Batches writes (Firestore commit limit = 500) and paginates reads
 *     (1 000 users / page) so it scales the same way backfill-age-group.ts
 *     does.
 *   • Supports --dry-run for a no-write preview.
 *
 * Usage
 * ─────
 *   npx tsx scripts/backfill-user-public.ts --dry-run    # preview
 *   npx tsx scripts/backfill-user-public.ts              # execute
 *
 * Prerequisites
 * ─────────────
 *   • scripts/backfill-age-group.ts already run LIVE (not dry-run) — see
 *     the CRITICAL ORDER section above.
 *   • GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service
 *     account key with Firestore admin permissions
 *   • OR run on a machine with `gcloud auth application-default login`
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const PAGE_SIZE = 1_000;
const COMMIT_BATCH_SIZE = 400; // safety margin under the 500 hard cap

// Mirrors userPublicSync.ts's own MIRRORED_CORE_FIELDS + currentLevel —
// kept in sync by hand since the Cloud Function and this script are
// separate deploy targets with no shared module between them.
interface MirrorPayload {
  name: string;
  photoURL: string | null;
  mainGoal: string | null;
  authorityId: string | null;
  ageGroup: string;
  initialFitnessTier: string | null;
  currentLevel: string | number | null;
}

function buildPayload(core: Record<string, unknown>, progression: Record<string, unknown> | undefined): MirrorPayload {
  return {
    name: (core.name as string | undefined) ?? 'ללא שם',
    photoURL: (core.photoURL as string | undefined) ?? null,
    mainGoal: (core.mainGoal as string | undefined) ?? null,
    authorityId: (core.authorityId as string | undefined) ?? null,
    ageGroup: (core.ageGroup as string | undefined) ?? 'minor',
    initialFitnessTier: (core.initialFitnessTier as string | undefined) ?? null,
    currentLevel: (progression?.currentLevel as string | number | undefined) ?? null,
  };
}

function payloadMatches(existing: Record<string, unknown> | undefined, wanted: MirrorPayload): boolean {
  if (!existing) return false;
  return (
    existing.name === wanted.name &&
    existing.photoURL === wanted.photoURL &&
    existing.mainGoal === wanted.mainGoal &&
    existing.authorityId === wanted.authorityId &&
    existing.ageGroup === wanted.ageGroup &&
    existing.initialFitnessTier === wanted.initialFitnessTier &&
    existing.currentLevel === wanted.currentLevel
  );
}

interface Stats {
  scanned: number;
  notDiscoverable: number;
  alreadyCorrect: number;
  backfilled: number;
  changedExisting: number; // mirror existed but had stale/wrong field values
  errors: string[];
}

const stats: Stats = {
  scanned: 0,
  notDiscoverable: 0,
  alreadyCorrect: 0,
  backfilled: 0,
  changedExisting: 0,
  errors: [],
};

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

      if (!core || core.discoverable !== true) {
        stats.notDiscoverable++;
        continue;
      }

      const wanted = buildPayload(core, data.progression);

      // Read-before-write, same as backfill-age-group.ts — needed to
      // classify already-correct vs backfilled vs changed, and to avoid
      // writing a no-op every run. One read regardless of --dry-run, so
      // the preview's counts are the real ones, not a guess.
      const publicSnap = await db.collection('userPublic').doc(doc.id).get();
      const existing = publicSnap.exists ? publicSnap.data() : undefined;

      if (payloadMatches(existing, wanted)) {
        stats.alreadyCorrect++;
        continue;
      }

      if (existing) {
        stats.changedExisting++;
      } else {
        stats.backfilled++;
      }

      if (!dryRun) {
        batch.set(db.collection('userPublic').doc(doc.id), {
          ...wanted,
          updatedAt: FieldValue.serverTimestamp(),
        });
        pendingWrites++;

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
  console.log(`  Total users scanned:            ${stats.scanned}`);
  console.log(`  Not discoverable (skipped):     ${stats.notDiscoverable}`);
  console.log(`  Already correct (no-op):        ${stats.alreadyCorrect}`);
  console.log(`  userPublic written (was empty): ${stats.backfilled}`);
  console.log(`  userPublic fixed (was stale):   ${stats.changedExisting}`);
  console.log(`  Errors:                         ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    stats.errors.slice(0, 20).forEach((e) => console.log(`     • ${e}`));
    if (stats.errors.length > 20) {
      console.log(`     …and ${stats.errors.length - 20} more`);
    }
  }

  if (dryRun && (stats.backfilled > 0 || stats.changedExisting > 0)) {
    console.log('\nRun WITHOUT --dry-run to apply changes.');
    console.log('Reminder: confirm backfill-age-group.ts already ran LIVE before running this live.');
  }
}

run().catch((err) => {
  console.error('\n❌ Backfill failed:', err);
  process.exit(1);
});
