/**
 * Outbox IndexedDB layer (Native Phase, Apr 2026).
 *
 * Two stores backing the offline-first sync flow:
 *
 *   • healthSamplesOutbox — sensor samples queued by the HealthBridge
 *     plugin while offline / between background syncs. Keyed by the
 *     stable HealthKit / Health Connect `sampleUUID` so duplicate
 *     enqueues collapse and server retries are safe.
 *
 *   • workoutsOutbox — full workout documents that failed to write
 *     directly to Firestore (typically: gym basement with no signal).
 *     Keyed by a client-generated ULID `localWorkoutId` so the same
 *     workout cannot be inserted twice if the user replays.
 *
 * SSR-safe: every export guards `typeof window === 'undefined'` and
 * returns an inert no-op when running on the server. The Firestore
 * persistent cache in src/lib/firebase.ts handles offline reads —
 * this outbox handles writes that need server-side guarantees
 * (callable / App-Check-gated mutations) and would otherwise be lost.
 */

import { openDB, type IDBPDatabase } from 'idb';

// ────────────────────────────────────────────────────────────────────────────
// DB constants
// ────────────────────────────────────────────────────────────────────────────
const DB_NAME = 'out-outbox';
const DB_VERSION = 1;

const HEALTH_STORE = 'healthSamplesOutbox';
const WORKOUTS_STORE = 'workoutsOutbox';

/** A record with attempts ≥ this is permanently skipped from retry — see
 *  the `eligible` filter in OutboxFlusher.ts's runOnce(). Canonical home
 *  for this threshold: OutboxFlusher imports it from here. */
export const MAX_ATTEMPTS = 8;

/** How long a record may sit with an unresolved App Check failure before
 *  countHealthSamples() stops counting it towards the "syncing" banner.
 *  Purely a display cutoff — see bumpHealthSampleSoftFailure()'s doc
 *  comment for why this must NEVER gate retry eligibility. */
export const SOFT_FAILURE_COUNT_CUTOFF_MS = 60 * 60 * 1000; // 1 hour

// ────────────────────────────────────────────────────────────────────────────
// Record shapes
// ────────────────────────────────────────────────────────────────────────────

export type SampleType = 'steps' | 'activeEnergy' | 'exerciseTime' | 'distance';
export type SampleSource = 'healthkit' | 'healthconnect';

export interface OutboxHealthSample {
  /** PRIMARY KEY — stable HealthKit / Health Connect UUID. */
  sampleUUID: string;
  /** Local date (YYYY-MM-DD) the sample belongs to. */
  date: string;
  type: SampleType;
  /** Numeric value: count for steps, kcal for activeEnergy, minutes for exerciseTime, metres for distance. */
  value: number;
  /** ISO timestamp string. */
  startDate: string;
  /** ISO timestamp string. */
  endDate: string;
  source: SampleSource;
  deviceModel?: string;
  /** Wall-clock millis when the sample was enqueued. */
  enqueuedAt: number;
  /** Number of failed flush attempts. Used for backoff scheduling. */
  attempts: number;
  /**
   * Wall-clock millis of this record's FIRST unresolved App Check failure —
   * set once, never moved forward by later App Check failures, cleared
   * implicitly when the record is deleted (a later success). `null` means
   * either no App Check failure has happened yet, or none is ongoing.
   * Counting-only — never affects retry eligibility. See
   * bumpHealthSampleSoftFailure() and countHealthSamples().
   */
  firstSoftFailureAt: number | null;
}

export interface OutboxWorkout {
  /** PRIMARY KEY — client-generated ULID. */
  localWorkoutId: string;
  /** Owner uid at enqueue time. We replay only when auth.uid matches. */
  uid: string;
  /** Full workout payload to be passed to addDoc(collection(db,'workouts'), payload). */
  payload: Record<string, unknown>;
  /** Optional follow-up award (XP / coins / calories) to invoke after the doc is written. */
  award?: {
    xpDelta?: number;
    coinsDelta?: number;
    caloriesDelta?: number;
    source: string;
  };
  /** Wall-clock millis when the workout was enqueued. */
  enqueuedAt: number;
  attempts: number;
}

// ────────────────────────────────────────────────────────────────────────────
// DB singleton
// ────────────────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function getDB(): Promise<IDBPDatabase> | null {
  if (!isBrowser()) return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(HEALTH_STORE)) {
          const s = db.createObjectStore(HEALTH_STORE, { keyPath: 'sampleUUID' });
          s.createIndex('byDate', 'date');
          s.createIndex('byEnqueuedAt', 'enqueuedAt');
        }
        if (!db.objectStoreNames.contains(WORKOUTS_STORE)) {
          const s = db.createObjectStore(WORKOUTS_STORE, { keyPath: 'localWorkoutId' });
          s.createIndex('byUid', 'uid');
          s.createIndex('byEnqueuedAt', 'enqueuedAt');
        }
      },
    });
  }
  return dbPromise;
}

// ────────────────────────────────────────────────────────────────────────────
// Health-samples outbox
// ────────────────────────────────────────────────────────────────────────────

export async function enqueueHealthSamples(samples: OutboxHealthSample[]): Promise<void> {
  if (samples.length === 0) return;
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(HEALTH_STORE, 'readwrite');
  // put() upserts on the keyPath (sampleUUID) — duplicate enqueues collapse.
  await Promise.all(samples.map((s) => tx.store.put(s)));
  await tx.done;
}

/**
 * Reads queued health samples ordered by `date` DESCENDING (most recent
 * day first), not by enqueue time. This matters when a large backfill
 * (e.g. 90 days of history, shredded into up to 3 outbox records per
 * HealthKit sample — see buildOutboxSample in healthBridge/init.ts) can't
 * fully drain in one pass: every record from a single sync call shares
 * the exact same `enqueuedAt` timestamp (one `Date.now()` for the whole
 * batch), so ordering by enqueue time gives no meaningful recency signal
 * within that batch — an interrupted drain could leave the user with an
 * arbitrary slice. Ordering by the sample's own `date` instead guarantees
 * that whatever gets flushed first (and would survive an interruption)
 * is always the most recent data, with older history trailing behind.
 */
export async function getQueuedHealthSamples(limit = 200): Promise<OutboxHealthSample[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction(HEALTH_STORE, 'readonly');
  const results: OutboxHealthSample[] = [];
  let cursor = await tx.store.index('byDate').openCursor(null, 'prev');
  while (cursor && results.length < limit) {
    results.push(cursor.value as OutboxHealthSample);
    cursor = await cursor.continue();
  }
  return results;
}

export async function deleteHealthSamples(sampleUUIDs: string[]): Promise<void> {
  if (sampleUUIDs.length === 0) return;
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(HEALTH_STORE, 'readwrite');
  await Promise.all(sampleUUIDs.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function bumpHealthSampleAttempts(sampleUUIDs: string[]): Promise<void> {
  if (sampleUUIDs.length === 0) return;
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(HEALTH_STORE, 'readwrite');
  for (const id of sampleUUIDs) {
    const rec = (await tx.store.get(id)) as OutboxHealthSample | undefined;
    if (rec) {
      rec.attempts = (rec.attempts ?? 0) + 1;
      await tx.store.put(rec);
    }
  }
  await tx.done;
}

/**
 * Records this record's FIRST unresolved App Check failure timestamp —
 * a no-op if one is already set, so repeated App Check failures never move
 * the clock forward. Deliberately separate from bumpHealthSampleAttempts():
 * App Check failures must keep retrying forever (they're transient
 * infrastructure, not a data problem), so this must NEVER be read by the
 * `eligible` filter in OutboxFlusher.ts's runOnce() — only by
 * countHealthSamples(), to stop an indefinitely-retrying record from
 * holding the "syncing" banner up forever.
 */
export async function bumpHealthSampleSoftFailure(sampleUUIDs: string[]): Promise<void> {
  if (sampleUUIDs.length === 0) return;
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(HEALTH_STORE, 'readwrite');
  for (const id of sampleUUIDs) {
    const rec = (await tx.store.get(id)) as OutboxHealthSample | undefined;
    if (rec && rec.firstSoftFailureAt == null) {
      rec.firstSoftFailureAt = Date.now();
      await tx.store.put(rec);
    }
  }
  await tx.done;
}

export interface HealthSampleQueueDiagnostics {
  /** Every record currently in the outbox, regardless of state. */
  total: number;
  /** attempts >= MAX_ATTEMPTS — permanently skipped from retry (see the
   *  `eligible` filter in OutboxFlusher.ts). */
  hardExhausted: number;
  /** firstSoftFailureAt set and older than SOFT_FAILURE_COUNT_CUTOFF_MS —
   *  still retrying forever, just no longer counted in the banner. */
  softExpired: number;
  /** What countHealthSamples() actually returns — total minus both
   *  exclusions above (a record can match both and is still only excluded
   *  once here, unlike the two counts above which may overlap). */
  stillCounted: number;
}

/**
 * Single source of truth for both countHealthSamples() and the
 * debug/health-sync diagnostics screen — one cursor pass classifies every
 * record so the two callers can never disagree on what's excluded and why.
 */
export async function getHealthSampleQueueDiagnostics(): Promise<HealthSampleQueueDiagnostics> {
  const db = await getDB();
  if (!db) return { total: 0, hardExhausted: 0, softExpired: 0, stillCounted: 0 };
  const now = Date.now();
  let total = 0;
  let hardExhausted = 0;
  let softExpired = 0;
  let stillCounted = 0;
  let cursor = await db.transaction(HEALTH_STORE, 'readonly').store.openCursor();
  while (cursor) {
    const rec = cursor.value as OutboxHealthSample;
    total++;
    const isHardExhausted = (rec.attempts ?? 0) >= MAX_ATTEMPTS;
    const isSoftExpired =
      rec.firstSoftFailureAt != null && now - rec.firstSoftFailureAt > SOFT_FAILURE_COUNT_CUTOFF_MS;
    if (isHardExhausted) hardExhausted++;
    if (isSoftExpired) softExpired++;
    if (!isHardExhausted && !isSoftExpired) stillCounted++;
    cursor = await cursor.continue();
  }
  return { total, hardExhausted, softExpired, stillCounted };
}

export async function countHealthSamples(): Promise<number> {
  const diagnostics = await getHealthSampleQueueDiagnostics();
  return diagnostics.stillCounted;
}

// ────────────────────────────────────────────────────────────────────────────
// Workouts outbox
// ────────────────────────────────────────────────────────────────────────────

export async function enqueueWorkout(rec: OutboxWorkout): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put(WORKOUTS_STORE, rec);
}

export async function getQueuedWorkouts(uid: string): Promise<OutboxWorkout[]> {
  const db = await getDB();
  if (!db) return [];
  const all = (await db.getAllFromIndex(WORKOUTS_STORE, 'byUid', uid)) as OutboxWorkout[];
  return all.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

export async function deleteWorkout(localWorkoutId: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete(WORKOUTS_STORE, localWorkoutId);
}

export async function bumpWorkoutAttempts(localWorkoutId: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const rec = (await db.get(WORKOUTS_STORE, localWorkoutId)) as OutboxWorkout | undefined;
  if (!rec) return;
  rec.attempts = (rec.attempts ?? 0) + 1;
  await db.put(WORKOUTS_STORE, rec);
}

export async function countWorkouts(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count(WORKOUTS_STORE);
}

/**
 * Generate a sortable, collision-resistant local id for offline-created
 * workouts. ULID-style: timestamp + random suffix, lexicographically sortable.
 * Avoids a dependency on `ulid` for one helper.
 */
export function generateLocalWorkoutId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  return `lw_${ts}_${rand}`;
}
