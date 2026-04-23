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

// ────────────────────────────────────────────────────────────────────────────
// Record shapes
// ────────────────────────────────────────────────────────────────────────────

export type SampleType = 'steps' | 'activeEnergy' | 'exerciseTime';
export type SampleSource = 'healthkit' | 'healthconnect';

export interface OutboxHealthSample {
  /** PRIMARY KEY — stable HealthKit / Health Connect UUID. */
  sampleUUID: string;
  /** Local date (YYYY-MM-DD) the sample belongs to. */
  date: string;
  type: SampleType;
  /** Numeric value: count for steps, kcal for activeEnergy, minutes for exerciseTime. */
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

export async function getQueuedHealthSamples(limit = 200): Promise<OutboxHealthSample[]> {
  const db = await getDB();
  if (!db) return [];
  const tx = db.transaction(HEALTH_STORE, 'readonly');
  const results: OutboxHealthSample[] = [];
  let cursor = await tx.store.index('byEnqueuedAt').openCursor();
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

export async function countHealthSamples(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count(HEALTH_STORE);
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
