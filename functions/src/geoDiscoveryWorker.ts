/**
 * geoDiscoveryWorker — background poller for route discovery (Stage 2,
 * city-mapping one-click panel button prep, 06.09.2026; moved off Cloud
 * Tasks to a scheduled poller on 27.09.2026).
 *
 * A client writes a request doc to CITY_MAPPING_DISCOVERY_RUNS_COLLECTION
 * (status:'pending') → a scheduled poller (every 5 min) picks it up and
 * calls processDiscoveryRun → the worker writes the result back onto the
 * same doc. No trigger, no queue, no extra IAM grant beyond the function's
 * own default service account.
 *
 * WHY NOT the original Cloud-Tasks design (onDocumentCreated enqueues,
 * onTaskDispatched runs the job): that architecture is correct on paper —
 * Firestore-triggered functions cap at timeoutSeconds=540 (confirmed
 * against firebase-functions' own types), a full discovery run has been
 * observed taking up to ~19 minutes, so the work has to happen in a
 * longer-lived function than the one the Firestore write can trigger
 * directly. Cloud Tasks is GCP's standard answer to exactly that split. But
 * in practice (27.09.2026) it cost a full day of diagnosis against three
 * REAL, independent infra failures on this project — Cloud Tasks API
 * disabled, the queue itself never created (its creation needs that API
 * enabled at deploy time), and the default compute service account missing
 * `cloudtasks.tasks.create` (this project runs least-privilege IAM, no
 * broad Editor role) — and after fixing all three, it *still* didn't work
 * on the first retry (IAM propagation or scope; never fully root-caused,
 * see docs/audit-2026-09/00-MASTER-PLAN.md for the full diagnostic trail).
 * Every future long-running job built on this pattern would inherit that
 * same fragility. A poller has no equivalent moving part: no queue to not
 * exist, no separate IAM grant, no enqueue call that can fail invisibly —
 * only Cloud Scheduler (already enabled) and a Firestore query.
 * Trade-off, accepted deliberately: up to ~5 minutes of latency before a
 * pending run is picked up, vs. Cloud Tasks' near-instant dispatch. Fine
 * for this job — city mapping happens a handful of times a year, not a
 * user-facing hot path.
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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { runGeoDiscovery, type GeoDiscoveryOptions, type GeoDiscoveryResult } from './_vendor/scripts/geo-discovery-routes';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const CITY_MAPPING_DISCOVERY_RUNS_COLLECTION = 'city_mapping_discovery_runs';

// 30-min real function timeout (see cityMappingDiscoveryPoller's own options
// below) + 5-min poller cadence as slack for clock skew / a claim that lands
// right before a tick — a doc genuinely still running at 30min+5min is
// presumed crashed (function killed by its own timeout, or the whole
// process died), never legitimately still in flight.
const STALE_RUNNING_THRESHOLD_MS = 35 * 60 * 1000;

// Once a job type exists, the pipeline can run "run job X on scope Y" —
// city-discovery, future shade-enrichment/annual-report/quality-check jobs,
// etc. — through the same doc shape and the same poller, instead of each
// being its own pipeline. Only one job type exists today; this poller does
// not yet filter its query by jobType (that's Firestore composite-index
// work, deferred until a second job type actually needs it — see
// cityMappingDiscoveryPoller below) but every new run doc must carry it so
// that future work doesn't have to backfill it onto old data.
export type CityMappingDiscoveryJobType = 'city-discovery';

export type CityMappingDiscoveryRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface CityMappingDiscoveryRunDoc {
  jobType: CityMappingDiscoveryJobType;
  regionKey: string;
  apply: boolean;
  requestedByUid: string;
  status: CityMappingDiscoveryRunStatus;
  createdAt: FirebaseFirestore.Timestamp;
  /** Set by the transaction that flips pending->running. Drives stale-run reclaim (see reclaimStaleRuns). */
  claimedAt?: FirebaseFirestore.Timestamp;
  /** How many times this doc has been reclaimed after going stale. 0/undefined on a fresh doc; capped at 2 — see reclaimStaleRuns. */
  attemptCount?: number;
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
 * The actual worker logic, factored out of the Cloud Function entry point so
 * it's directly testable (call it with a runId + a Firestore handle, no
 * scheduler invocation involved) — same "extract the testable core" pattern
 * Stage 1 used for runGeoDiscovery itself. cityMappingDiscoveryPoller below
 * is a thin wrapper around this; Stage 2's own local test calls this
 * function directly, since there is no working Functions-emulator setup in
 * this repo to exercise a real scheduled invocation (confirmed: firebase.json
 * has no functions emulator entry, and the one precedent for local Cloud
 * Function testing in this repo, scripts/verify-push-pipeline.ts, itself
 * bypasses the Functions emulator via a require-intercept and calls service
 * logic in-process — same shape as what this function enables here).
 */
export async function processDiscoveryRun(runId: string, db: admin.firestore.Firestore): Promise<void> {
  const ref = db.collection(CITY_MAPPING_DISCOVERY_RUNS_COLLECTION).doc(runId);

  // Transactional compare-and-set idempotency guard — same shape as
  // sendPushFromQueue's push_messages guard (sendPushFromQueue.ts:99-104):
  // claim the doc by flipping status pending->running INSIDE a transaction,
  // so two poller ticks racing on the same doc (a run still in flight when
  // the next 5-minute tick fires, or Cloud Scheduler itself redelivering)
  // can never both process the same run — see cityMappingDiscoveryPoller's
  // own header for why the transaction alone is sufficient here.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Partial<CityMappingDiscoveryRunDoc> | undefined;
    if (!data || data.status !== 'pending') return false;
    tx.update(ref, { status: 'running', claimedAt: admin.firestore.FieldValue.serverTimestamp() });
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
    // NOT VERIFIED (27.09.2026) — a real 19-min run against herzliya via
    // scripts/_test-stage2-worker.ts crashed on exactly this write:
    // "Couldn't serialize object of type ServerTimestampTransform... custom
    // prototypes". Working theory, from reading code, not from a passing
    // deployed run: that script dynamically imports this module from a
    // script living at the repo root, so `admin` here resolves through
    // functions/node_modules while the script's own `db`/`ref` resolve
    // through the ROOT node_modules — two separate installed copies of
    // @google-cloud/firestore, so a FieldValue sentinel built by one isn't
    // recognized by the other's serializer. Should NOT reproduce in the
    // real deployed function (single functions/node_modules, no root
    // package involved at all) — but that's inference, not a measured,
    // successful deployed run ending in 'succeeded'. If this theory is
    // wrong, the symptom will be: the real poller runs ~19min, completes
    // discovery, and crashes on this exact write — doc stuck on 'running'
    // (reclaimStaleRuns below will eventually catch it, not silently lose
    // it, but it's worth recognizing immediately rather than re-diagnosing
    // from scratch).
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

/**
 * Reclaims run docs stuck on 'running' past STALE_RUNNING_THRESHOLD_MS —
 * the crash-recovery path a bare Cloud-Tasks retry never covered (this
 * project deliberately runs retryConfig-equivalent at maxAttempts:1, see
 * processDiscoveryRun's own history: unbounded auto-retry risks piling onto
 * Overpass congestion, exactly the failure mode that's already been hit
 * once). First time a doc is found stale: attemptCount 0->1, revert to
 * 'pending' so the poller's normal scan picks it up again next tick — one
 * free retry, covering a transient crash (OOM, a bad deploy mid-run,
 * Overpass hanging the whole 30min). Second time the SAME doc goes stale
 * (attemptCount already >=1): permanently 'failed', never reverted again —
 * a job that reliably crashes twice is presumed non-transient, and this is
 * what stops that from becoming an infinite reclaim loop once this runs
 * across dozens of cities instead of one at a time.
 *
 * Each doc is reclaimed inside its own transaction (not a single batch)
 * because the re-read-and-check (status still 'running'?) has to happen
 * atomically per doc — a batch write has no equivalent conditional-check,
 * and a doc could legitimately finish (succeeded/failed) between this
 * function's query and its write without the transaction, silently
 * clobbering a real result back to 'pending'.
 */
async function reclaimStaleRuns(db: admin.firestore.Firestore): Promise<void> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_RUNNING_THRESHOLD_MS);
  const staleSnap = await db
    .collection(CITY_MAPPING_DISCOVERY_RUNS_COLLECTION)
    .where('status', '==', 'running')
    .where('claimedAt', '<', cutoff)
    .get();

  for (const doc of staleSnap.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const data = fresh.data() as Partial<CityMappingDiscoveryRunDoc> | undefined;
      if (!data || data.status !== 'running') return; // resolved (or reclaimed) since the query ran
      const attemptCount = (data.attemptCount ?? 0) + 1;
      if (attemptCount >= 2) {
        logger.error(`[geoDiscoveryWorker] run ${doc.id} reclaimed a 2nd time — presumed non-transient, marking failed`);
        tx.update(doc.ref, {
          status: 'failed',
          attemptCount,
          errorMessage: 'reclaimed twice after going stale on \'running\' — presumed non-transient, stopped auto-retry',
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        logger.info(`[geoDiscoveryWorker] run ${doc.id} stale on 'running' since ${data.claimedAt?.toDate?.().toISOString()} — reverting to pending (attempt ${attemptCount})`);
        tx.update(doc.ref, { status: 'pending', attemptCount });
      }
    });
  }
}

// The real GCP ceiling for a scheduled function (1800s / 30 min — confirmed
// directly against Firebase's own docs, firebase.google.com/docs/functions/
// quotas: "1800 seconds for scheduled/Task queue functions" — NOT the 3600s
// HTTPS ceiling the type hierarchy alone would suggest, since ScheduleFunction
// technically extends HttpsFunction; checked rather than assumed after that
// exact wrong inference almost shipped here). Memory generous for the same
// reason the old dispatch function was: a full discovery run holds a
// city-wide OSM way grid, decoded DEM tiles, and per-candidate geometry
// arrays concurrently in memory (runGeoDiscovery's fetchCityWayGrid/
// loadTiles). retryCount:0 — explicit, not relying on Cloud Scheduler's
// default — a genuine failure should surface as status:'failed' via
// reclaimStaleRuns, not retry the whole 30min job again automatically; same
// congestion-avoidance reasoning as processDiscoveryRun's own auth-gate.
//
// Picks up at most ONE pending run per tick, oldest first, deliberately —
// looping through multiple pending docs in one invocation risks exceeding
// the 30min function budget the moment a second ~19min job is queued behind
// the first. One-per-tick means the 5-minute schedule just works through a
// backlog naturally, never risking a mid-run kill on the second item.
// Known, accepted limitation: fetches a small batch (10) ordered by
// createdAt and picks the first entry whose jobType is 'city-discovery' —
// not a query-level filter (that needs a composite index this collection
// doesn't have yet), so if a different job type's doc is older than a
// pending city-discovery one, this tick skips past it correctly, but an
// unrelated future job type sitting among the oldest 10 could still get
// looked at and skipped repeatedly instead of a real match further back.
// Immaterial today (city-discovery is the only job type in existence); revisit
// with a real composite index once a second job type actually ships.
export const cityMappingDiscoveryPoller = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 1800, memory: '1GiB', retryCount: 0 },
  async () => {
    const db = admin.firestore();
    await reclaimStaleRuns(db);

    const candidatesSnap = await db
      .collection(CITY_MAPPING_DISCOVERY_RUNS_COLLECTION)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(10)
      .get();

    const next = candidatesSnap.docs.find((d) => {
      const jobType = (d.data() as Partial<CityMappingDiscoveryRunDoc>).jobType;
      return !jobType || jobType === 'city-discovery'; // missing jobType tolerated (pre-27.09.2026 callers), treated as city-discovery
    });
    if (!next) return;

    await processDiscoveryRun(next.id, db);
  }
);
