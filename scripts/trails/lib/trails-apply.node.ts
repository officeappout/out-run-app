/**
 * scripts/trails/lib/trails-apply.node.ts — the ONLY Firestore write path of
 * the trails pipeline (owner-approved 18.10.2026, docs/TRAILS-PILOT-SHAAR-HANEGEV.md §6).
 *
 * Guard rails (all enforced here, not by convention):
 *   - explicit flags: --apply --project <id> --authority <authorityId>
 *   - target is the Firestore EMULATOR when FIRESTORE_EMULATOR_HOST is set;
 *     otherwise PRODUCTION, which additionally requires --project appout-1
 *     AND a service-account key whose project_id matches
 *   - the authorityId is RESOLVED BY NAME at run time (read-only) from the
 *     OSM boundary's name and must equal --authority — never hardcoded
 *   - a full summary is printed, then a typed "YES" is required
 *   - trail_segments: idempotent upsert keyed by the deterministic segment id,
 *     skipped when the stored contentHash is identical (2nd run writes 0)
 *   - official_routes: CREATE-ONLY (existing id → skipped, never touched),
 *     status:'pending', published:false — sole exception: the owner-approved
 *     elevationProfile backfill (bottom of this file), a field-level update
 *     of that one field, precondition-guarded
 *   - batched writes, ≤ 400 per batch; nothing is ever deleted
 */
import { createHash } from 'crypto';
import * as readline from 'readline';
import type { App } from 'firebase-admin/app';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc, normalizeCityName } from '../../../src/lib/route-collections';
import {
  authorityNameCandidates,
  chunk,
  segmentDoc,
  stableStringify,
  type TrailDoc,
} from '../../../src/lib/trail-graph/firestore-docs';
import type { TrailSegment } from '../../../src/lib/trail-graph/types';

/** The only two collections this pipeline ever writes. */
export type TrailsCollection = 'trail_segments' | 'official_routes';

/**
 * Explicit, literal collection refs — no `db.collection(variable)` anywhere
 * in this file, so scripts/safety-check.sh's route-collection check sees
 * every official_routes access.
 */
function collectionRef(db: Firestore, name: TrailsCollection) {
  switch (name) {
    case 'trail_segments': return db.collection('trail_segments');
    case 'official_routes': return db.collection('official_routes');
  }
}

export const PRODUCTION_PROJECT = 'appout-1';
export const BATCH_SIZE = 400;

// ── CLI flags ──────────────────────────────────────────────────────────────

export interface ApplyFlags { apply: boolean; project: string | null; authority: string | null }

/** Accepts both `--project appout-1` and `--project=appout-1`. */
export function flagValue(argv: string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) {
      const v = argv[i + 1];
      return v && !v.startsWith('--') ? v : null;
    }
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3) || null;
  }
  return null;
}

export function parseApplyFlags(argv: string[]): ApplyFlags {
  return { apply: argv.includes('--apply'), project: flagValue(argv, 'project'), authority: flagValue(argv, 'authority') };
}

export function validateApplyFlags(f: ApplyFlags, env: Record<string, string | undefined> = process.env): string[] {
  const errs: string[] = [];
  if (!f.project) errs.push('missing --project <projectId> (production: --project appout-1)');
  if (!f.authority) errs.push('missing --authority <authorityId> (find it read-only with --resolve-authority)');
  if (!env.FIRESTORE_EMULATOR_HOST && f.project && f.project !== PRODUCTION_PROJECT) {
    errs.push(`--project ${f.project}: without FIRESTORE_EMULATOR_HOST the only allowed target is ${PRODUCTION_PROJECT}`);
  }
  return errs;
}

// ── Firestore handle ───────────────────────────────────────────────────────

export interface Target { db: Firestore; app: App; emulator: string | null; projectId: string }

export async function openTarget(projectId: string, env: Record<string, string | undefined> = process.env): Promise<Target> {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const name = `trails-apply-${projectId}`;
  const existing = getApps().find((a) => a.name === name);
  const emulator = env.FIRESTORE_EMULATOR_HOST ?? null;
  let app: App;
  if (existing) app = existing;
  else if (emulator) app = initializeApp({ projectId }, name);
  else {
    if (projectId !== PRODUCTION_PROJECT) throw new Error(`refusing non-emulator project ${projectId}`);
    const raw = env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
    const cred = JSON.parse(raw);
    if (cred.project_id !== projectId) throw new Error(`service account is for "${cred.project_id}", not --project ${projectId}`);
    app = initializeApp({ credential: cert(cred), projectId }, name);
  }
  return { db: getFirestore(app), app, emulator, projectId };
}

export function describeTarget(t: Pick<Target, 'emulator' | 'projectId'>): string {
  return t.emulator ? `EMULATOR ${t.emulator} (project ${t.projectId})` : `PRODUCTION Firestore (project ${t.projectId})`;
}

// ── Authority (read-only name lookup) ──────────────────────────────────────

export interface ResolvedAuthority { id: string; name: string; knownAuthorityIds: Set<string> }

/** Exact (normalized) name match only — 0 or ≥ 2 matches is an error, never a guess. */
export async function resolveAuthorityByName(db: Firestore, areaName: string): Promise<ResolvedAuthority> {
  const snap = await db.collection('authorities').get();
  const all = snap.docs.map((d) => ({ id: d.id, name: String((d.data() as { name?: unknown }).name ?? '') }));
  const wanted = new Set(authorityNameCandidates(areaName).map(normalizeCityName));
  const hits = all.filter((a) => a.name && wanted.has(normalizeCityName(a.name)));
  if (hits.length !== 1) {
    throw new Error(`authority lookup for "${areaName}" (${Array.from(wanted).join(' | ')}) matched ${hits.length} of ${all.length} authorities${hits.length ? `: ${hits.map((h) => `${h.id} (${h.name})`).join(', ')}` : ''} — need exactly 1. Nothing was written.`);
  }
  return { id: hits[0].id, name: hits[0].name, knownAuthorityIds: new Set(all.map((a) => a.id)) };
}

// ── Plan + execute ─────────────────────────────────────────────────────────

export const contentHash = (data: Record<string, unknown>) => createHash('sha1').update(stableStringify(data)).digest('hex');

export type WriteMode = 'upsert' | 'create_only';

export interface CollectionPlan {
  collection: TrailsCollection;
  mode: WriteMode;
  inRun: number;
  create: TrailDoc[];
  update: TrailDoc[];
  unchanged: number;
  skippedExisting: number;
  /** upsert only: docs of this authority in the DB that this run no longer produces (reported, NOT deleted). */
  staleInDb: number;
  /** official_routes: every authority id that exists — the executor re-runs buildValidatedDoc with it. */
  knownAuthorityIds?: Set<string>;
}

async function existingDocs(db: Firestore, collection: TrailsCollection, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const part of chunk(ids, 300)) {
    if (!part.length) continue;
    const snaps = await db.getAll(...part.map((id) => collectionRef(db, collection).doc(id)));
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as Record<string, unknown>);
  }
  return out;
}

export async function planCollection(db: Firestore, collection: TrailsCollection, docs: TrailDoc[], mode: WriteMode, authorityId: string): Promise<CollectionPlan> {
  if (collection === 'official_routes' && mode !== 'create_only') throw new Error('official_routes is create-only in the trails pipeline');
  const ids = docs.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${collection}: duplicate doc ids in this run`);
  const existing = await existingDocs(db, collection, ids);
  const plan: CollectionPlan = { collection, mode, inRun: docs.length, create: [], update: [], unchanged: 0, skippedExisting: 0, staleInDb: 0 };
  for (const d of docs) {
    const cur = existing.get(d.id);
    if (mode === 'create_only') {
      if (cur) plan.skippedExisting++;
      else plan.create.push(d);
      continue;
    }
    const hash = contentHash(d.data);
    const withHash = { id: d.id, data: { ...d.data, contentHash: hash } };
    if (!cur) plan.create.push(withHash);
    else if (cur.contentHash === hash) plan.unchanged++;
    else plan.update.push(withHash);
  }
  if (mode === 'upsert') {
    const inDb = await collectionRef(db, collection).where('authorityId', '==', authorityId).select().get();
    const run = new Set(ids);
    plan.staleInDb = inDb.docs.filter((d) => !run.has(d.id)).length;
  }
  return plan;
}

export function writesIn(p: CollectionPlan): number {
  return p.create.length + p.update.length;
}

export function formatPlan(p: CollectionPlan): string {
  return p.mode === 'upsert'
    ? `${p.collection}: ${p.inRun} in run → create ${p.create.length}, update ${p.update.length}, unchanged ${p.unchanged}; ${p.staleInDb} older doc(s) of this authority not in this run (left as-is, NOT deleted)`
    : `${p.collection}: ${p.inRun} in run → create ${p.create.length} (status:'pending', published:false), skip ${p.skippedExisting} that already exist (never overwritten)`;
}

/** Executes a plan in batches of ≤ 400. create_only uses batch.create() so a racing doc fails the batch instead of being overwritten. */
export async function executePlan(db: Firestore, p: CollectionPlan, log: (s: string) => void = console.log): Promise<{ written: number; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const ops = [...p.create.map((d) => ({ d, isNew: true })), ...p.update.map((d) => ({ d, isNew: false }))];
  const parts = chunk(ops, BATCH_SIZE);
  let written = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const batch = db.batch();
    for (const { d, isNew } of part) {
      const stamp = { updatedAt: FieldValue.serverTimestamp(), ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}) };
      if (p.collection === 'official_routes') {
        // Stage-1B chokepoint at the write site: every official_routes doc is
        // re-validated immediately before batch.create (the builder in
        // import-named-routes.ts validated it once already).
        if (!p.knownAuthorityIds) throw new Error('official_routes plan is missing knownAuthorityIds');
        const validated = buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: p.knownAuthorityIds });
        batch.create(db.collection('official_routes').doc(d.id), { ...validated, ...stamp });
      } else {
        const ref = db.collection('trail_segments').doc(d.id);
        const stamped = { ...d.data, ...stamp };
        if (isNew) batch.create(ref, stamped);
        else batch.set(ref, stamped, { mergeFields: Object.keys(stamped) });
      }
    }
    await batch.commit();
    written += part.length;
    log(`  ${p.collection}: batch ${i + 1}/${parts.length} committed (${part.length} docs)`);
  }
  return { written, batches: parts.length };
}

// ── Confirmation ───────────────────────────────────────────────────────────

export async function confirmTypedYes(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error('Refusing to write: no interactive terminal for the "YES" confirmation.');
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  return answer.trim() === 'YES';
}

// ── High-level entry points (used by both CLIs and the emulator test) ──────

export interface ApplyRunOptions {
  target: Target;
  /** --authority value; must equal the name lookup's result. */
  authorityId: string;
  /** OSM boundary name, e.g. "מועצה אזורית שער הנגב". */
  areaName: string;
  osmTimestamp: string | null;
  confirm: (question: string) => Promise<boolean>;
  log?: (s: string) => void;
}

export interface ApplyResult { plans: CollectionPlan[]; written: number; aborted: boolean }

async function runApply(opts: ApplyRunOptions, build: (auth: ResolvedAuthority) => Array<{ collection: TrailsCollection; docs: TrailDoc[]; mode: WriteMode }>): Promise<ApplyResult> {
  const log = opts.log ?? console.log;
  const { db } = opts.target;
  log(`\nTARGET: ${describeTarget(opts.target)}`);
  const auth = await resolveAuthorityByName(db, opts.areaName);
  if (auth.id !== opts.authorityId) {
    throw new Error(`--authority ${opts.authorityId} does not match the name lookup for "${opts.areaName}" → ${auth.id} (${auth.name}). Nothing was written.`);
  }
  log(`authority: ${auth.id} (${auth.name}) — matches the read-only name lookup ✓`);
  const plans: CollectionPlan[] = [];
  for (const b of build(auth)) {
    const plan = await planCollection(db, b.collection, b.docs, b.mode, auth.id);
    if (b.collection === 'official_routes') plan.knownAuthorityIds = auth.knownAuthorityIds;
    plans.push(plan);
  }
  const total = plans.reduce((a, p) => a + writesIn(p), 0);
  log('\n── SUMMARY (nothing written yet) ──');
  for (const p of plans) log(`  ${formatPlan(p)}`);
  log(`  total writes: ${total} in ${plans.reduce((a, p) => a + Math.ceil(writesIn(p) / BATCH_SIZE), 0)} batch(es) of ≤ ${BATCH_SIZE}; deletes: 0`);
  if (total === 0) {
    log('Nothing to write — already up to date.');
    return { plans, written: 0, aborted: false };
  }
  const ok = await opts.confirm(`\nType YES to write ${total} doc(s) to ${describeTarget(opts.target)}: `);
  if (!ok) {
    log('Not confirmed — nothing was written.');
    return { plans, written: 0, aborted: true };
  }
  let written = 0;
  for (const p of plans) written += (await executePlan(db, p, log)).written;
  log(`✅ wrote ${written} doc(s).`);
  return { plans, written, aborted: false };
}

export function applyTrailSegments(segments: TrailSegment[], opts: ApplyRunOptions): Promise<ApplyResult> {
  return runApply(opts, (auth) => [{
    collection: 'trail_segments',
    mode: 'upsert',
    docs: segments.map((s) => segmentDoc(s, { authorityId: auth.id, osmTimestamp: opts.osmTimestamp })),
  }]);
}

/**
 * official_routes, create-only. `buildDocs` must return docs already passed
 * through buildValidatedDoc (scripts/trails/import-named-routes.ts
 * validatedRouteDocs); the executor validates each again before writing.
 */
export function applyOfficialRoutes(buildDocs: (auth: ResolvedAuthority) => TrailDoc[], opts: ApplyRunOptions): Promise<ApplyResult> {
  return runApply(opts, (auth) => [{ collection: 'official_routes', mode: 'create_only', docs: buildDocs(auth) }]);
}

/** Read-only: print the authority the name lookup resolves to (for choosing --authority). */
export async function printResolvedAuthority(target: Target, areaName: string): Promise<void> {
  console.log(`TARGET (read-only): ${describeTarget(target)}`);
  const a = await resolveAuthorityByName(target.db, areaName);
  console.log(`"${areaName}" → authorityId ${a.id} (${a.name})`);
}

// ── elevationProfile backfill onto EXISTING official_routes (19.10.2026) ────
// Owner-approved one-off (scripts/trails/backfill-elevation-profile.ts). The
// only exception to "official_routes is create-only" in this pipeline, and a
// narrow one: a FIELD-LEVEL update of `elevationProfile` alone — validated
// through buildValidatedDoc (update mode), asserted to carry no other key,
// and guarded by the doc's read-time updateTime so a doc edited since the
// read is skipped, never clobbered. Nothing else on the doc is touched.

export interface RouteDocSnapshot {
  id: string;
  data: Record<string, unknown>;
  /** Firestore updateTime at read — the write precondition. */
  updateTime: Timestamp;
}

/** One bounded page of official_routes in document-id order (only the fields the backfill reads). */
export async function listOfficialRoutesPage(
  db: Firestore,
  opts: { afterId: string | null; pageSize: number; authorityId: string | null },
): Promise<RouteDocSnapshot[]> {
  const { FieldPath } = await import('firebase-admin/firestore');
  let q = db.collection('official_routes').select('name', 'path', 'elevationProfile').orderBy(FieldPath.documentId()).limit(opts.pageSize);
  if (opts.authorityId) q = q.where('authorityId', '==', opts.authorityId);
  if (opts.afterId) q = q.startAfter(opts.afterId);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown>, updateTime: d.updateTime }));
}

export interface ElevationUpdate {
  id: string;
  profile: { stepM: number; elevationsM: number[] };
  updateTime: RouteDocSnapshot['updateTime'];
}

/** The exact payload written: `{ elevationProfile }`, validated, and nothing else. */
export function elevationProfilePayload(profile: ElevationUpdate['profile']): Record<string, unknown> {
  const validated = buildValidatedDoc('official_routes', { elevationProfile: profile }, { mode: 'update', knownAuthorityIds: new Set(), existing: {} });
  const keys = Object.keys(validated);
  if (keys.length !== 1 || keys[0] !== 'elevationProfile') throw new Error(`elevationProfile backfill payload must be exactly {elevationProfile}, got {${keys.join(',')}}`);
  return validated;
}

/**
 * Writes the updates in batches (≤ batchSize, ≤ 400), pausing `pauseMs`
 * between batches. A batch rejected because one doc changed since the read
 * is retried doc by doc; the changed docs are reported as `conflicts`.
 */
export async function updateElevationProfiles(
  db: Firestore,
  updates: ElevationUpdate[],
  opts: { batchSize: number; pauseMs: number; log?: (s: string) => void },
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const log = opts.log ?? console.log;
  const parts = chunk(updates.map((u) => ({ ...u, payload: elevationProfilePayload(u.profile) })), Math.min(BATCH_SIZE, Math.max(1, opts.batchSize)));
  let written = 0;
  const conflicts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const batch = db.batch();
    for (const u of part) batch.update(db.collection('official_routes').doc(u.id), u.payload, { lastUpdateTime: u.updateTime });
    try {
      await batch.commit();
      written += part.length;
    } catch {
      for (const u of part) {
        try {
          await db.collection('official_routes').doc(u.id).update(u.payload, { lastUpdateTime: u.updateTime });
          written++;
        } catch {
          conflicts.push(u.id);
        }
      }
    }
    log(`  official_routes.elevationProfile: batch ${i + 1}/${parts.length} (${part.length} docs)`);
    if (opts.pauseMs > 0 && i < parts.length - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches: parts.length };
}
