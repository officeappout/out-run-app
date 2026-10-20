/**
 * Seed execution (Admin SDK). Order matters for safety:
 *   1. build the world (pure) and check EVERY doc against the allowlist (guard.ts);
 *   2. preflight: an existing authority / tenant / group / user at a demo id that is NOT
 *      marked demo stops the run (it is someone else's doc);
 *   3. write demo_registry first (so purge can always find what was seeded), create
 *      demo_registry/viewers {uids: []} only if missing (never overwrite viewers);
 *   4. write the rest in ≤ 400-doc batches, throttled (design: ~50 writes/s so the
 *      production triggers are not flooded);
 *   5. league participation: the SAME functions the triggers use
 *      (applyWorkoutToLeagueStats / applyStepsToLeagueStats). Both are exactly-once by
 *      their own markers, so a trigger that also fires on these workouts never double-counts.
 * Idempotent: deterministic ids + seeded randomness → a re-run rewrites the same docs.
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { applyStepsToLeagueStats, applyWorkoutToLeagueStats } from '../../../functions/src/lib/apply-league-stats';
import { REGISTRY_COLLECTION, REGISTRY_DOCS } from './config';
import { assertDemoDocs } from './guard';
import type { DocWrite } from './history';
import { loadRealParks } from './real-parks';
import { buildDemoWorld, type DemoWorld } from './world';

export interface SeedOptions {
  now?: Date;
  historyDays?: number;
  aheadDays?: number;
  /** Max writes per second (null = no throttle — emulator). */
  ratePerSec?: number | null;
  applyLeagues?: boolean;
  dryRun?: boolean;
  log?: (s: string) => void;
}

export interface SeedReport {
  dryRun: boolean;
  counts: Record<string, number>;
  users: number;
  leagues: { workouts: Record<string, number>; steps: Record<string, number> } | null;
}

const BATCH = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const collectionOf = (path: string) => (path.split('/').length > 2 ? `${path.split('/')[0]}/*/${path.split('/')[2]}` : path.split('/')[0]);

export async function loadViewerUids(db: Firestore): Promise<Set<string>> {
  const snap = await db.collection(REGISTRY_COLLECTION).doc(REGISTRY_DOCS.viewers).get();
  const uids = snap.exists ? snap.data()?.uids : undefined;
  return new Set(Array.isArray(uids) ? uids.filter((u): u is string => typeof u === 'string' && !!u) : []);
}

/** Existing docs at demo ids must already be demo docs. */
export async function preflightExisting(db: Firestore, docs: readonly DocWrite[]): Promise<string[]> {
  const problems: string[] = [];
  const top = docs.filter((d) => /^(authorities|tenants|community_groups|users)\/[^/]+$/.test(d.path));
  for (let i = 0; i < top.length; i += 100) {
    const slice = top.slice(i, i + 100);
    const snaps = await db.getAll(...slice.map((d) => db.doc(d.path)));
    snaps.forEach((s, k) => {
      if (!s.exists) return;
      const data = s.data() ?? {};
      const isUser = slice[k].path.startsWith('users/');
      const demo = isUser ? typeof (data.core as { demo?: unknown } | undefined)?.demo === 'object' : data.isDemo === true;
      if (!demo) problems.push(`${slice[k].path} קיים ואינו מסומן כדמו`);
    });
  }
  return problems;
}

export function countByCollection(docs: readonly DocWrite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) out[collectionOf(d.path)] = (out[collectionOf(d.path)] ?? 0) + 1;
  return out;
}

async function writeAll(db: Firestore, docs: readonly DocWrite[], rate: number | null, log: (s: string) => void): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const batch = db.batch();
    for (const d of slice) batch.set(db.doc(d.path), d.data);
    const t0 = Date.now();
    await batch.commit();
    log(`  נכתבו ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
    if (rate) {
      const wait = (slice.length / rate) * 1000 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
    }
  }
}

async function applyLeagues(db: Firestore, world: DemoWorld, log: (s: string) => void): Promise<SeedReport['leagues']> {
  const ts = () => FieldValue.serverTimestamp();
  const workouts: Record<string, number> = {};
  const steps: Record<string, number> = {};
  const byId = new Map(world.docs.filter((d) => d.path.startsWith('workouts/')).map((d) => [d.path.slice('workouts/'.length), d.data]));
  let n = 0;
  for (const id of world.workoutIds) {
    const data = byId.get(id)!;
    const r = await applyWorkoutToLeagueStats(db, ts, id, { ...data, date: Timestamp.fromDate(data.date as Date) });
    workouts[r] = (workouts[r] ?? 0) + 1;
    if (++n % 200 === 0) log(`  ליגות: ${n}/${world.workoutIds.length} אימונים`);
  }
  for (const [uid, days] of Object.entries(world.steps)) {
    for (const d of days) {
      const r = await applyStepsToLeagueStats(db, ts, uid, d.date, d.steps, d.distanceMeters);
      steps[r] = (steps[r] ?? 0) + 1;
    }
  }
  return { workouts, steps };
}

export async function runSeed(db: Firestore, opts: SeedOptions = {}): Promise<SeedReport> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const viewers = await loadViewerUids(db);
  log('פארקים אמיתיים (קריאה בלבד):');
  const parksByCity = await loadRealParks(db, log);
  const world = buildDemoWorld({ now, parksByCity, historyDays: opts.historyDays, aheadDays: opts.aheadDays });
  assertDemoDocs(world.docs, viewers);
  const problems = await preflightExisting(db, world.docs);
  if (problems.length) throw new Error(`עצירה — אף מסמך לא נכתב:\n${problems.join('\n')}`);

  const counts = countByCollection(world.docs);
  if (opts.dryRun) return { dryRun: true, counts, users: world.uids.length, leagues: null };

  const registry = world.docs.filter((d) => d.path.startsWith(`${REGISTRY_COLLECTION}/`));
  const rest = world.docs.filter((d) => !d.path.startsWith(`${REGISTRY_COLLECTION}/`));
  log('רישום (demo_registry) ראשון…');
  await writeAll(db, registry, null, log);
  await db
    .collection(REGISTRY_COLLECTION)
    .doc(REGISTRY_DOCS.viewers)
    .create({ uids: [], updatedAt: now })
    .catch((e: { code?: number }) => {
      if (e?.code !== 6) throw e; // 6 = ALREADY_EXISTS — keep the owner's viewers
    });
  log(`כותב ${rest.length} מסמכים…`);
  await writeAll(db, rest, opts.ratePerSec ?? null, log);

  const leagues = opts.applyLeagues === false ? null : (log('ליגות (בתוך סקופי הדמו בלבד)…'), await applyLeagues(db, world, log));
  return { dryRun: false, counts, users: world.uids.length, leagues };
}
