/**
 * geoDiscoveryWorker — background job-queue worker for route discovery
 * (Stage 2, city-mapping one-click panel button prep, 06.09.2026).
 *
 * Mirrors the proven push_messages job-queue pattern (functions/src/sendPushFromQueue.ts):
 * a client writes a request doc → a Firestore trigger processes it → the
 * worker writes the result back. One structural difference, forced by a real
 * GCP limit: Firestore-triggered event functions (onDocumentCreated) cap at
 * timeoutSeconds=540 regardless of config (confirmed against the installed
 * firebase-functions package's own types, node_modules/firebase-functions/lib/v2/providers/tasks.d.ts —
 * "Event handling functions have a maximum timeout of 540s"). A full
 * discovery run has been observed taking up to ~19 minutes under Overpass
 * congestion (audit/discovery-timing investigation, 05.09.2026) — well past
 * 540s — so a single onDocumentCreated handler cannot safely run this job;
 * doing so would recreate the exact 504-timeout failure mode this project
 * has already hit once (the "lighting-504" incident). So this is split in
 * two, the standard GCP pattern for a long job triggered by a Firestore write:
 *
 *   1. onCityMappingDiscoveryRunCreated — thin, fast (<10s) Firestore trigger.
 *      Only enqueues a Cloud Task; never calls runGeoDiscovery itself.
 *   2. onCityMappingDiscoveryDispatch — the actual worker, a task-queue
 *      function. timeoutSeconds up to 1800 (30 min) — the real GCP ceiling
 *      for THIS trigger type (same source), 3.3x the 540s a Firestore
 *      trigger allows.
 *
 * runGeoDiscovery itself is scripts/geo-discovery-routes.ts's Stage 1 export
 * (feat/geo-discovery-importable, merged 05.09.2026) — imported here from
 * ./_vendor/scripts/geo-discovery-routes, NOT the real file directly, because
 * functions/ builds via plain tsc scoped to functions/src only (no bundler,
 * no rootDir override) and cannot reach outside its own directory. The
 * _vendor tree is fully regenerated on every `npm run build` by
 * functions/scripts/vendor-copy-geo-discovery.js — scripts/geo-discovery-routes.ts
 * stays the single source of truth; never hand-edit anything under
 * functions/src/_vendor/.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import { runGeoDiscovery, type GeoDiscoveryOptions, type GeoDiscoveryResult } from './_vendor/scripts/geo-discovery-routes';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const CITY_MAPPING_DISCOVERY_RUNS_COLLECTION = 'city_mapping_discovery_runs';
const DISPATCH_FUNCTION_NAME = 'onCityMappingDiscoveryDispatch';

export type CityMappingDiscoveryRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface CityMappingDiscoveryRunDoc {
  regionKey: string;
  apply: boolean;
  requestedByUid: string;
  status: CityMappingDiscoveryRunStatus;
  createdAt: FirebaseFirestore.Timestamp;
  keptCount?: number;
  droppedCount?: number;
  summary?: string;
  finishedAt?: FirebaseFirestore.Timestamp;
  errorMessage?: string;
}

/**
 * Real enforcement for "only a superAdmin may run an apply:true job" — the
 * firestore.rules create-gate on this collection (isSuperAdminOnly()) is
 * currently INERT: a global catch-all at the end of firestore.rules
 * (`match /{document=**} { allow read, write: if isRootAdmin() || isAdmin();
 * }`) re-grants access to any isAdmin() user regardless of what a more
 * specific match block says, since Firestore rules are additive across
 * matching blocks, never "most-specific-wins" (confirmed empirically —
 * tests/firestore-rules.test.ts CMD3/CMD5/CMD9). Fixing that catch-all is
 * explicitly out of scope here (high blast radius, a separate decision) —
 * see .claude/knowledge/parking-lot.md. This function is the actual,
 * bypass-proof gate instead: it runs inside the trusted worker (Admin SDK,
 * already past all client-facing rules) immediately before any write-
 * capable (apply:true) run, so a stray or malicious doc with apply:true
 * can never reach runGeoDiscovery unless requestedByUid genuinely is a
 * superAdmin. Mirrors firestore.rules' isRootAdmin() || isSuperAdminOnly()
 * bar exactly, from the two independent sources of truth that bar draws
 * from: the hardcoded root-admin email pattern (via Admin Auth, since a
 * Cloud Function has no request.auth.token to read directly) and the
 * users/{uid}.core.isSuperAdmin / core.isSystemAdmin flags (via Firestore,
 * the same fields isSuperAdminOnly() reads).
 */
async function isAuthorizedForApply(requestedByUid: string, db: admin.firestore.Firestore): Promise<boolean> {
  try {
    const userRecord = await admin.auth().getUser(requestedByUid);
    if (userRecord.email && /^(david|office)@appout\.co\.il$/i.test(userRecord.email)) return true;
  } catch {
    // getUser throwing (unknown/deleted uid) just means the root-admin-by-email
    // check doesn't apply here — fall through to the Firestore-doc check below.
  }
  const snap = await db.collection('users').doc(requestedByUid).get();
  const core = (snap.data()?.core ?? {}) as { isSuperAdmin?: boolean; isSystemAdmin?: boolean };
  return core.isSuperAdmin === true || core.isSystemAdmin === true;
}

/**
 * The actual worker logic, factored out of both Cloud Function entry points
 * so it's directly testable (call it with a runId + a Firestore handle, no
 * Cloud Tasks queue or trigger involved) — same "extract the testable core"
 * pattern Stage 1 used for runGeoDiscovery itself. onCityMappingDiscoveryDispatch
 * below is a thin wrapper around this; Stage 2's own local test calls this
 * function directly, since there is no working Functions-emulator setup in
 * this repo to exercise the real trigger chain (confirmed: firebase.json has
 * no functions emulator entry, and the one precedent for local Cloud
 * Function testing in this repo, scripts/verify-push-pipeline.ts, itself
 * bypasses the Functions emulator via a require-intercept and calls service
 * logic in-process — same shape as what this function enables here).
 */
export async function processDiscoveryRun(runId: string, db: admin.firestore.Firestore): Promise<void> {
  const ref = db.collection(CITY_MAPPING_DISCOVERY_RUNS_COLLECTION).doc(runId);

  // Transactional compare-and-set idempotency guard — same shape as
  // sendPushFromQueue's push_messages guard (sendPushFromQueue.ts:99-104):
  // claim the doc by flipping status pending->running INSIDE a transaction,
  // so an at-least-once trigger redelivery (Firestore triggers and Cloud
  // Tasks are both at-least-once) can never process the same run twice.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Partial<CityMappingDiscoveryRunDoc> | undefined;
    if (!data || data.status !== 'pending') return false;
    tx.update(ref, { status: 'running' });
    return true;
  });
  if (!claimed) {
    logger.info(`[geoDiscoveryWorker] run ${runId} not pending (already claimed, or missing) — skipping`);
    return;
  }

  const snap = await ref.get();
  const data = snap.data() as CityMappingDiscoveryRunDoc;
  // !!data.apply: a malformed/stray doc missing `apply` entirely (or any
  // falsy value) is always a harmless dry-run, never a write — this is the
  // ONLY place opts.apply is derived, so there is no other path where a
  // missing field could default to true.
  const apply = !!data.apply;

  try {
    // Real enforcement point (see isAuthorizedForApply's own doc comment) —
    // dry-runs (apply:false) skip this entirely and always proceed, since
    // they write nothing regardless of who requested them.
    if (apply && !(await isAuthorizedForApply(data.requestedByUid, db))) {
      logger.error(`[geoDiscoveryWorker] run ${runId} rejected — requestedByUid "${data.requestedByUid}" is not a superAdmin, cannot run apply:true`);
      await ref.update({
        status: 'failed',
        errorMessage: 'requester not authorized for apply run',
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const opts: GeoDiscoveryOptions = {
      region: data.regionKey,
      apply,
      delete: false,
      roundtrips: false,
      skipOsm: false,
    };
    const result: GeoDiscoveryResult = await runGeoDiscovery(opts, db);
    await ref.update({
      status: 'succeeded',
      keptCount: result.keptCount,
      droppedCount: result.droppedCount,
      summary: result.summary,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error(`[geoDiscoveryWorker] run ${runId} failed`, err);
    await ref.update({
      status: 'failed',
      errorMessage: (err as Error).message,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const onCityMappingDiscoveryRunCreated = onDocumentCreated(
  { document: `${CITY_MAPPING_DISCOVERY_RUNS_COLLECTION}/{runId}`, timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const runId = event.params.runId;
    const data = event.data?.data() as CityMappingDiscoveryRunDoc | undefined;
    if (!data || data.status !== 'pending') return; // idempotency guard, mirrors sendPushFromQueue
    const queue = getFunctions().taskQueue(DISPATCH_FUNCTION_NAME);
    // dispatchDeadlineSeconds must be <= the dispatch function's own
    // timeoutSeconds (1800) — set equal to it so a slow-but-legitimate run
    // is never cut off early by Cloud Tasks itself before the function's own
    // timeout would apply.
    await queue.enqueue({ runId }, { dispatchDeadlineSeconds: 1800 });
  }
);

// The real GCP ceiling for a task-queue function (1800s / 30 min — confirmed
// against the installed firebase-functions types, same source cited above).
// Memory generous: a full discovery run holds a city-wide OSM way grid
// (Map<wayId, WayInfo>), decoded DEM tiles, and per-candidate geometry arrays
// concurrently in memory (see runGeoDiscovery's fetchCityWayGrid/loadTiles) —
// 1GiB is a deliberate step up from sendPushFromQueue's 512MiB, not copied
// from it. retryConfig.maxAttempts:1 — a genuine failure (bad regionKey,
// Overpass down) should surface as status:'failed' immediately, not
// silently retry against Overpass up to 3x and potentially add to exactly
// the congestion this job is already sensitive to; the idempotency guard
// above makes any retry safe either way, this is a cost/clarity choice, not
// a correctness requirement.
export const onCityMappingDiscoveryDispatch = onTaskDispatched<{ runId: string }>(
  { timeoutSeconds: 1800, memory: '1GiB', retryConfig: { maxAttempts: 1 } },
  async (request) => {
    await processDiscoveryRun(request.data.runId, admin.firestore());
  }
);
