/**
 * debugState.ts — TEMPORARY runtime diagnostics for the health-sync
 * "only today lands" investigation (Aug 2026).
 *
 * devicectl console streaming and Safari Web Inspector both proved
 * unreliable for capturing live JS logs on-device this session — this
 * routes around that entirely by recording plain state that a debug
 * screen can read and the user can screenshot. Delete this file (and
 * DebugHealthSyncPage / its entry point) once the backfill bug is
 * confirmed fixed on-device — it is not meant to ship long-term.
 *
 * In-memory only (module-level mutable object) — intentionally NOT
 * persisted to Preferences, so it always reflects the CURRENT app
 * session's real behavior, not a stale value from a previous run.
 */

export interface HealthSyncDebugState {
  /** Wall-clock ISO time this snapshot was last updated. */
  lastUpdatedAt: string | null;

  // ── Last syncSince() call ────────────────────────────────────────
  lastSyncReason: string | null;
  /** The actual sinceISO passed into native syncSince() — the real
   *  query start date, not what we assume it should be. */
  lastSyncSinceISO: string | null;
  lastSyncUntilISO: string | null;
  lastSyncSampleCount: number | null;
  lastSyncMinSampleDate: string | null;
  lastSyncMaxSampleDate: string | null;
  lastSyncCursorWritten: string | null;
  lastSyncError: string | null;

  // ── Outbox ────────────────────────────────────────────────────────
  totalEnqueuedLifetime: number;
  totalFlushedLifetime: number;
  lastFlushError: string | null;
  lastFlushAt: string | null;
}

const state: HealthSyncDebugState = {
  lastUpdatedAt: null,
  lastSyncReason: null,
  lastSyncSinceISO: null,
  lastSyncUntilISO: null,
  lastSyncSampleCount: null,
  lastSyncMinSampleDate: null,
  lastSyncMaxSampleDate: null,
  lastSyncCursorWritten: null,
  lastSyncError: null,
  totalEnqueuedLifetime: 0,
  totalFlushedLifetime: 0,
  lastFlushError: null,
  lastFlushAt: null,
};

export function recordSyncAttempt(reason: string, sinceISO: string, untilISO: string): void {
  state.lastSyncReason = reason;
  state.lastSyncSinceISO = sinceISO;
  state.lastSyncUntilISO = untilISO;
  state.lastSyncError = null;
  state.lastUpdatedAt = new Date().toISOString();
}

export function recordSyncResult(samples: { date: string }[], cursorWritten: string | null): void {
  state.lastSyncSampleCount = samples.length;
  if (samples.length > 0) {
    const dates = samples.map((s) => s.date).sort();
    state.lastSyncMinSampleDate = dates[0];
    state.lastSyncMaxSampleDate = dates[dates.length - 1];
  } else {
    state.lastSyncMinSampleDate = null;
    state.lastSyncMaxSampleDate = null;
  }
  state.lastSyncCursorWritten = cursorWritten;
  state.lastUpdatedAt = new Date().toISOString();
}

export function recordSyncError(err: unknown): void {
  state.lastSyncError = err instanceof Error ? err.message : String(err);
  state.lastUpdatedAt = new Date().toISOString();
}

export function recordEnqueued(count: number): void {
  state.totalEnqueuedLifetime += count;
  state.lastUpdatedAt = new Date().toISOString();
}

export function recordFlushed(count: number): void {
  state.totalFlushedLifetime += count;
  state.lastFlushAt = new Date().toISOString();
  state.lastUpdatedAt = new Date().toISOString();
}

export function recordFlushError(err: unknown): void {
  state.lastFlushError = err instanceof Error ? err.message : String(err);
  state.lastFlushAt = new Date().toISOString();
  state.lastUpdatedAt = new Date().toISOString();
}

export function getHealthSyncDebugState(): HealthSyncDebugState {
  return { ...state };
}
