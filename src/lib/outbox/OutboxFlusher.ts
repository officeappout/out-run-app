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
    // 1. Drain health samples (group by date, ≤200 per call).
    // ──────────────────────────────────────────────────────────────
    const samples = await getQueuedHealthSamples(MAX_HEALTH_BATCH * 5);
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
        const result = await ingestHealthSamples({ date, samples: payload });
        if (result) {
          // accepted + deduped are both "safely ingested" from the client's POV.
          await deleteHealthSamples(chunk.map((c) => c.sampleUUID));
        } else {
          allOk = false;
          await bumpHealthSampleAttempts(chunk.map((c) => c.sampleUUID));
        }
      }
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
