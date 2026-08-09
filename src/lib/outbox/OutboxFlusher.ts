/**
 * OutboxFlusher — singleton that drains the IndexedDB outbox to Firebase
 * (Native Phase, Apr 2026).
 *
 * Flushes are idempotent and triggered by:
 *   • `window.online`           — network came back.
 *   • `App.appStateChange:active` (Capacitor) — user resumed the app.
 *   • `auth.onAuthStateChanged` — user just signed in.
 *   • Manual `flushNow()`       — invoked by HealthBridge after enqueueing
 *                                  fresh samples or by the OfflineBanner.
 *
 * Health samples flush in batches of MAX_HEALTH_BATCH per call.
 * Workouts flush one-at-a-time (each is a Firestore write + a callable).
 *
 * Backoff
 * ───────
 * On failure, attempts counter on the record bumps. Records with
 * attempts ≥ MAX_ATTEMPTS are kept (never silently dropped) but
 * skipped from auto-flush; a future "retry stuck items" UI can
 * surface them.
 */

import { auth } from '@/lib/firebase';
import {
  countHealthSamples,
  countWorkouts,
  getQueuedHealthSamples,
  getQueuedWorkouts,
  deleteHealthSamples,
  deleteWorkout,
  bumpHealthSampleAttempts,
  bumpWorkoutAttempts,
  type OutboxHealthSample,
} from './outbox-db';
import {
  ingestHealthSamples,
  type IngestHealthSamplePayload,
} from '@/lib/ingestHealthSamples';
import { awardWorkoutXP } from '@/lib/awardWorkoutXP';

const MAX_HEALTH_BATCH = 200;
const MAX_ATTEMPTS = 8;

/**
 * Returns true when the thrown error looks like an App Check token failure.
 * These are transient infrastructure errors (not data errors) and should NOT
 * consume retry attempts so the outbox isn't permanently exhausted in dev/
 * TestFlight builds where DeviceCheck / AppAttest is misconfigured.
 */
function isAppCheckError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  const code = String((err as any)?.code ?? '');
  return (
    code === 'unauthenticated' && (
      msg.toLowerCase().includes('app check') ||
      msg.toLowerCase().includes('appcheck') ||
      msg.toLowerCase().includes('firebase app check')
    )
  );
}

type FlushReason = 'online' | 'app-active' | 'auth' | 'manual' | 'enqueue';

class FlusherImpl {
  private installed = false;
  private inFlight = false;
  /** Pending flush requested while another flush is running. */
  private pending: FlushReason | null = null;
  /** Backoff window (ms) — reset to 0 on success, doubles on failure. */
  private backoffMs = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private depthListeners = new Set<(depth: { samples: number; workouts: number }) => void>();

  /**
   * Install global listeners. Idempotent — safe to call multiple times.
   * SSR-safe — no-op when window is undefined.
   */
  install(): void {
    if (this.installed) return;
    if (typeof window === 'undefined') return;
    this.installed = true;

    window.addEventListener('online', () => this.flushNow('online'));
    auth.onAuthStateChanged((user) => {
      if (user) this.flushNow('auth');
    });

    // Capacitor App lifecycle is wired in src/lib/healthBridge/init.ts —
    // it calls `flushNow('app-active')` on resume. We don't import
    // @capacitor/app here so this module stays usable in pure web builds.
  }

  onDepthChange(listener: (depth: { samples: number; workouts: number }) => void): () => void {
    this.depthListeners.add(listener);
    void this.emitDepth();
    return () => this.depthListeners.delete(listener);
  }

  async getDepth(): Promise<{ samples: number; workouts: number }> {
    if (typeof window === 'undefined') return { samples: 0, workouts: 0 };
    const [samples, workouts] = await Promise.all([
      countHealthSamples(),
      countWorkouts(),
    ]);
    return { samples, workouts };
  }

  private async emitDepth(): Promise<void> {
    if (this.depthListeners.size === 0) return;
    const depth = await this.getDepth();
    this.depthListeners.forEach((l) => l(depth));
  }

  /**
   * Trigger a flush. Coalesces concurrent calls — only one flush runs at
   * a time; further requests fold into a single follow-up flush.
   */
  async flushNow(reason: FlushReason = 'manual'): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!navigator.onLine) return;
    if (!auth.currentUser) return;

    if (this.inFlight) {
      this.pending = reason;
      return;
    }

    this.inFlight = true;
    try {
      const ok = await this.runOnce();
      if (ok) {
        this.backoffMs = 0;
      } else {
        this.scheduleBackoff();
      }
    } finally {
      this.inFlight = false;
      void this.emitDepth();
      if (this.pending) {
        const r = this.pending;
        this.pending = null;
        // Microtask break to avoid recursion.
        setTimeout(() => this.flushNow(r), 0);
      }
    }
  }

  private scheduleBackoff(): void {
    this.backoffMs = Math.min(this.backoffMs === 0 ? 5_000 : this.backoffMs * 2, 5 * 60_000);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      void this.flushNow('manual');
    }, this.backoffMs);
  }

  /**
   * Single flush pass. Returns true if all queued items either succeeded
   * or were exhausted, false if at least one network/server error occurred.
   */
  private async runOnce(): Promise<boolean> {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    let allOk = true;

    // ──────────────────────────────────────────────────────────────
    // 1. Drain health samples (group by date, ≤200 per Firestore call).
    //
    // Loops until the queue is actually empty instead of one bounded
    // read — a large backfill (90 days of HealthKit history, shredded
    // into up to 3 outbox records per sample, see buildOutboxSample in
    // healthBridge/init.ts) can produce many thousands of queued records
    // from a single enqueueHealthSamples() call, far more than fit in
    // one read. A single-shot read left everything beyond the first
    // batch queued until some FUTURE, incidental flush trigger (app
    // resume, network reconnect) happened to run again — on a fresh
    // install with only one launch, nothing ever came along to finish
    // the job, so most of the backfill silently never reached Firestore.
    //
    // Bounded by MAX_DRAIN_PASSES as a safety ceiling (never spins
    // forever), breaks immediately on the first failed pass — the
    // remainder stays queued for the next natural trigger; existing
    // per-record backoff/attempts handles retry, no need to keep
    // hammering a failing backend here — and yields between passes so a
    // large drain doesn't block the UI thread or burst-write Firestore
    // in one tick. getQueuedHealthSamples() reads newest-day-first (see
    // its doc comment), so if a drain is ever interrupted, whatever
    // already landed is always the most recent data, not an arbitrary
    // slice.
    const HEALTH_READ_BATCH = MAX_HEALTH_BATCH * 5;
    const MAX_DRAIN_PASSES = 50; // 50 * 1000 = 50,000 records/flush — far beyond any real backlog
    for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
      const samples = await getQueuedHealthSamples(HEALTH_READ_BATCH);
      if (samples.length === 0) break;

      const eligible = samples.filter((s) => (s.attempts ?? 0) < MAX_ATTEMPTS);
      const byDate = new Map<string, OutboxHealthSample[]>();
      for (const s of eligible) {
        const arr = byDate.get(s.date) ?? [];
        arr.push(s);
        byDate.set(s.date, arr);
      }
      for (const [date, group] of byDate) {
        // Chunk into MAX_HEALTH_BATCH-sized calls.
        for (let i = 0; i < group.length; i += MAX_HEALTH_BATCH) {
          const chunk = group.slice(i, i + MAX_HEALTH_BATCH);
          const payload: IngestHealthSamplePayload[] = chunk.map((s) => ({
            sampleUUID: s.sampleUUID,
            type: s.type,
            value: s.value,
            startDate: s.startDate,
            endDate: s.endDate,
            source: s.source,
            deviceModel: s.deviceModel,
          }));
          try {
            const result = await ingestHealthSamples({ date, samples: payload });
            if (result) {
              // accepted + deduped are both "safely ingested" from the client's POV.
              await deleteHealthSamples(chunk.map((c) => c.sampleUUID));
            } else {
              allOk = false;
              await bumpHealthSampleAttempts(chunk.map((c) => c.sampleUUID));
            }
          } catch (err) {
            // App Check errors are transient infrastructure failures — do not
            // consume retry attempts so the outbox isn't permanently exhausted
            // in debug / TestFlight builds.
            if (isAppCheckError(err)) {
              console.warn('[OutboxFlusher] App Check error — skipping attempt bump, will retry on next flush');
              allOk = false;
            } else {
              allOk = false;
              await bumpHealthSampleAttempts(chunk.map((c) => c.sampleUUID));
            }
          }
        }
      }

      if (!allOk) {
        const remaining = await countHealthSamples();
        console.warn(
          `[OutboxFlusher] drain stopped early after a failed pass — ${remaining} sample(s) ` +
          'still queued, will retry on the next flush trigger.',
        );
        break;
      }

      if (samples.length < HEALTH_READ_BATCH) break; // queue is fully drained

      // Yield between passes so a multi-thousand-record drain doesn't
      // block the UI thread or burst-write Firestore in a single tick —
      // draining across a few seconds is fine, it just needs to finish
      // on its own.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // ──────────────────────────────────────────────────────────────
    // 2. Drain workouts (sequential — each is a Firestore add + callable).
    // ──────────────────────────────────────────────────────────────
    const workouts = await getQueuedWorkouts(uid);
    for (const w of workouts) {
      if ((w.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      try {
        // Lazy import keeps bundle slim and avoids a circular import via
        // storage.service → outbox → storage.service.
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await addDoc(collection(db, 'workouts'), {
          ...w.payload,
          date: serverTimestamp(),
          localWorkoutId: w.localWorkoutId,
        });
        if (w.award && (w.award.xpDelta || w.award.coinsDelta || w.award.caloriesDelta)) {
          await awardWorkoutXP(w.award);
        }
        await deleteWorkout(w.localWorkoutId);
      } catch (err) {
        console.warn('[OutboxFlusher] workout flush failed', w.localWorkoutId, err);
        await bumpWorkoutAttempts(w.localWorkoutId);
        allOk = false;
      }
    }

    return allOk;
  }
}

export const OutboxFlusher = new FlusherImpl();

if (typeof window !== 'undefined') {
  // Auto-install on first import in the browser.
  OutboxFlusher.install();
}
