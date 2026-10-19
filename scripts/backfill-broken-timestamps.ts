/**
 * scripts/backfill-broken-timestamps.ts — repair timestamp fields that a
 * sanitizer wrote as plain maps (19.10.2026).
 *
 * ROOT CAUSE (fixed in the same PR): onboarding-sync's sanitizeObject — and
 * four other "strip undefined" helpers — recursed into every object, so
 * serverTimestamp() was stored as { _methodName: 'serverTimestamp' }, a Date
 * as {} and a Timestamp as { seconds, nanoseconds }. See
 * src/lib/firestore-sanitize.ts. Sibling of scripts/backfill-corrupted-timestamps.ts
 * (the same bug class in official_routes / curated_routes, 17.08.2026), which
 * has its own route-specific recovery and is left as is.
 *
 * WHAT IT SETS (the mapping is pure: src/lib/broken-timestamps-backfill.ts)
 *   users/{uid}
 *     createdAt                      ← snapshot createTime (exact)
 *     updatedAt                      ← snapshot updateTime (the last write)
 *     lastActive                     ← latest of: workouts.date, progression.lastActiveDate,
 *                                      running.lastWorkoutDate, fcmTokenMeta.*.lastSeenAt,
 *                                      a valid updatedAt, Auth lastRefreshTime/lastSignInTime,
 *                                      latest analytics_events, createdAt
 *     onboardingCompletedAt          ← first analytics_events 'onboarding_completed' for the uid;
 *                                      else createdAt + onboardingCompletedAtEstimated: true
 *     marketingAttribution.capturedAt← marketingAttribution.firstSeenAt (ms); else createdAt
 *     termsAcceptedAt                ← the completion time above + termsAcceptedAtEstimated: true
 *     any other broken field         ← DELETED (no evidence rule; reads as "missing", not garbage)
 *     { seconds, nanoseconds } maps  ← converted losslessly ONLY with --include-ts-copies,
 *                                      never under core.* (core.birthDate is rule-compared)
 *   parks.publishedAt                ← createdAt if valid, else createTime
 *   exercises createdAt/updatedAt/draft.savedAt, community_events + community_groups
 *     createdAt/updatedAt            ← createTime / updateTime; community_events.date
 *                                      { seconds, nanoseconds } → Timestamp (lossless)
 *   Values inside arrays can't be addressed by a field path — reported, not touched.
 *
 * SAFETY
 *   - Dry-run by default: reads only, prints counts per field and source. No PII
 *     (counts; uids only with --verbose).
 *   - --write applies. A field is only ever written when its CURRENT value is
 *     broken; a valid Timestamp is never overwritten → idempotent (a second
 *     run finds nothing).
 *   - Batches of ≤ 400; every update carries a lastUpdateTime precondition, so
 *     a doc that changed since it was read is skipped, not clobbered (rerun).
 *   - Deploy the sanitizer fix FIRST, or new signups keep producing broken values.
 *
 * Usage (repo root):
 *   npx tsx --env-file=.env.local scripts/backfill-broken-timestamps.ts                 # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-broken-timestamps.ts --write         # apply
 *     [--include-ts-copies] [--users-only] [--verbose]
 */

import * as admin from 'firebase-admin';
import {
  planGenericRepairs,
  planUserRepairs,
  evidenceMillis,
  type FieldRepair,
} from '../src/lib/broken-timestamps-backfill';

const WRITE = process.argv.includes('--write');
const INCLUDE_TS_COPIES = process.argv.includes('--include-ts-copies');
const USERS_ONLY = process.argv.includes('--users-only');
const VERBOSE = process.argv.includes('--verbose');
const BATCH = 400;

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set (run with --env-file=.env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();
const { Timestamp, FieldPath, FieldValue } = admin.firestore;

type Op = {
  ref: admin.firestore.DocumentReference;
  updateTime: admin.firestore.Timestamp;
  args: unknown[]; // FieldPath, value, FieldPath, value, ...
};

const counts = new Map<string, number>();
const bump = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
const affectedIds = new Map<string, Set<string>>();

function addOp(ops: Op[], snap: admin.firestore.QueryDocumentSnapshot, label: string, sets: FieldRepair[], deletes: string[][], flags: Record<string, true> = {}) {
  if (!sets.length && !deletes.length) return;
  const args: unknown[] = [];
  for (const s of sets) {
    args.push(new FieldPath(...s.path), Timestamp.fromMillis(s.ms));
    bump(`${label}  SET    ${s.path.join('.')}  ← ${s.source}`);
  }
  for (const d of deletes) {
    args.push(new FieldPath(...d), FieldValue.delete());
    bump(`${label}  DELETE ${d.join('.')}`);
  }
  for (const f of Object.keys(flags)) {
    args.push(new FieldPath(f), true);
    bump(`${label}  FLAG   ${f}=true`);
  }
  ops.push({ ref: snap.ref, updateTime: snap.updateTime, args });
  (affectedIds.get(label) ?? affectedIds.set(label, new Set()).get(label)!).add(snap.id);
}

async function readAll(q: admin.firestore.Query): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const out: admin.firestore.QueryDocumentSnapshot[] = [];
  let last: string | null = null;
  for (;;) {
    let page = q.orderBy(FieldPath.documentId()).limit(1000);
    if (last) page = page.startAfter(last);
    const s = await page.get();
    out.push(...s.docs);
    if (s.size < 1000) return out;
    last = s.docs[s.docs.length - 1].id;
  }
}

async function userEvidenceMaps(uids: string[]) {
  const latestWorkout = new Map<string, number>();
  for (const d of await readAll(db.collection('workouts').select('userId', 'date'))) {
    const x = d.data();
    const ms = evidenceMillis(x.date);
    if (typeof x.userId === 'string' && ms !== null && ms > (latestWorkout.get(x.userId) ?? -1)) latestWorkout.set(x.userId, ms);
  }
  const latestEvent = new Map<string, number>();
  const firstCompleted = new Map<string, number>();
  for (const d of await readAll(db.collection('analytics_events').select('userId', 'eventName', 'timestamp'))) {
    const x = d.data();
    const ms = evidenceMillis(x.timestamp);
    if (typeof x.userId !== 'string' || ms === null) continue;
    if (ms > (latestEvent.get(x.userId) ?? -1)) latestEvent.set(x.userId, ms);
    if (x.eventName === 'onboarding_completed' && ms < (firstCompleted.get(x.userId) ?? Infinity)) firstCompleted.set(x.userId, ms);
  }
  const authLast = new Map<string, number>();
  for (let i = 0; i < uids.length; i += 100) {
    const res = await admin.auth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of res.users) {
      const ms = Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? '');
      if (Number.isFinite(ms)) authLast.set(u.uid, ms);
    }
  }
  return { latestWorkout, latestEvent, firstCompleted, authLast };
}

async function planUsers(ops: Op[], nowMs: number) {
  const snaps = await readAll(db.collection('users'));
  console.log(`users: ${snaps.length} doc(s) read`);
  const ev = await userEvidenceMaps(snaps.map((s) => s.id));
  let tsCopiesSeen = 0;
  let tsCopiesCore = 0;
  let inArrays = 0;
  for (const s of snaps) {
    const plan = planUserRepairs(
      {
        data: s.data(),
        nowMs,
        createTimeMs: s.createTime.toMillis(),
        updateTimeMs: s.updateTime.toMillis(),
        latestWorkoutMs: ev.latestWorkout.get(s.id) ?? null,
        authLastActiveMs: ev.authLast.get(s.id) ?? null,
        latestAnalyticsEventMs: ev.latestEvent.get(s.id) ?? null,
        onboardingCompletedEventMs: ev.firstCompleted.get(s.id) ?? null,
      },
      { includeTsCopies: INCLUDE_TS_COPIES },
    );
    tsCopiesSeen += plan.tsCopies.length;
    tsCopiesCore += plan.tsCopies.filter((r) => r.path[0] === 'core').length;
    inArrays += plan.inArrays.length;
    addOp(ops, s, 'users', plan.sets, plan.deletes, plan.flags);
  }
  console.log(
    `users: ${tsCopiesSeen} {seconds,nanoseconds} map(s) (${tsCopiesCore} under core.*, never converted)` +
      `${INCLUDE_TS_COPIES ? '' : ' — not converted (pass --include-ts-copies)'}; ${inArrays} broken value(s) inside arrays (reported only)`,
  );
}

const GENERIC: Record<string, Record<string, 'createTime' | 'updateTime' | 'createdAtOrCreateTime'>> = {
  parks: { publishedAt: 'createdAtOrCreateTime', createdAt: 'createTime', updatedAt: 'updateTime' },
  exercises: { createdAt: 'createTime', updatedAt: 'updateTime', 'draft.savedAt': 'updateTime' },
  community_events: { createdAt: 'createTime', updatedAt: 'updateTime' },
  community_groups: { createdAt: 'createTime', updatedAt: 'updateTime' },
};

async function planGeneric(ops: Op[], nowMs: number) {
  for (const [coll, rules] of Object.entries(GENERIC)) {
    const snaps = await readAll(db.collection(coll));
    let inArrays = 0;
    for (const s of snaps) {
      const p = planGenericRepairs(s.data(), { createTimeMs: s.createTime.toMillis(), updateTimeMs: s.updateTime.toMillis(), nowMs }, rules);
      inArrays += p.inArrays.length;
      addOp(ops, s, coll, p.sets, p.deletes);
    }
    console.log(`${coll}: ${snaps.length} doc(s) read; ${inArrays} broken value(s) inside arrays (reported only)`);
  }
}

async function apply(ops: Op[]) {
  let written = 0;
  let skipped = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const chunk = ops.slice(i, i + BATCH);
    const batch = db.batch();
    for (const o of chunk) (batch.update as any)(o.ref, ...o.args, { lastUpdateTime: o.updateTime });
    try {
      await batch.commit();
      written += chunk.length;
    } catch {
      // One doc changed since it was read → the whole batch failed. Retry one by one.
      for (const o of chunk) {
        try {
          await (o.ref.update as any)(...o.args, { lastUpdateTime: o.updateTime });
          written++;
        } catch {
          skipped++;
        }
      }
    }
    console.log(`  committed ${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }
  console.log(`written=${written} skippedChangedSinceRead=${skipped}${skipped ? ' (rerun the script)' : ''}`);
}

async function main() {
  console.log(`backfill-broken-timestamps — ${WRITE ? 'WRITE' : 'DRY-RUN (no writes)'}${INCLUDE_TS_COPIES ? ' +ts-copies' : ''}\n`);
  const nowMs = Date.now();
  const ops: Op[] = [];
  await planUsers(ops, nowMs);
  if (!USERS_ONLY) await planGeneric(ops, nowMs);

  console.log('\nPlanned changes (field count):');
  for (const [k, n] of Array.from(counts.entries()).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log('\nDocs to update:');
  for (const [label, ids] of Array.from(affectedIds.entries())) {
    console.log(`  ${label}: ${ids.size}`);
    if (VERBOSE) console.log(`    ${Array.from(ids).join(" ")}`);
  }

  if (!WRITE) {
    console.log(`\nDRY-RUN: ${ops.length} doc update(s) planned. Re-run with --write to apply.`);
    return;
  }
  await apply(ops);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
