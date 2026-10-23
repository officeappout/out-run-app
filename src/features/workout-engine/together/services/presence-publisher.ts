import { decidePublish } from '../core/presence-throttle';
import { TOGETHER_CONFIG } from '../core/config';
import type { PresenceAdapter, PresenceStatus, SessionRef } from '../core/types';

export interface PublisherClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

const realClock: PublisherClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type StatusInput = Omit<PresenceStatus, 'clientMs' | 'seq'>;

/**
 * Throttled writer for ONE participant of ONE together session.
 *   update(s)  – offer the latest status; writes now, later (≥ minGap) or never.
 *   finish()   – publish the final `done` status (still honours the gap) and stop.
 *   stop()     – cancel timers without writing (unmount / leaving).
 * Only the latest candidate matters, so a burst of GPS ticks costs one write.
 * Write failures are swallowed (presence is best-effort, never blocks a workout).
 */
export function createPresencePublisher(opts: {
  adapter: PresenceAdapter;
  ref: SessionRef;
  clock?: PublisherClock;
  minGapMs?: number;
  heartbeatMs?: number;
  onError?: (err: unknown) => void;
}) {
  const clock = opts.clock ?? realClock;
  let seq = clock.now();
  let lastWritten: PresenceStatus | null = null;
  let lastWriteMs: number | null = null;
  let pending: StatusInput | null = null;
  let latest: StatusInput | null = null;
  let timer: unknown = null;
  let stopped = false;

  const clearTimer = () => { if (timer != null) { clock.clearTimeout(timer); timer = null; } };

  const write = (input: StatusInput) => {
    const status: PresenceStatus = { ...input, clientMs: clock.now(), seq: ++seq };
    lastWritten = status;
    lastWriteMs = clock.now();
    pending = null;
    opts.adapter.publish(opts.ref, status).catch((err) => opts.onError?.(err));
  };

  const schedule = (waitMs: number) => {
    clearTimer();
    timer = clock.setTimeout(() => {
      timer = null;
      if (stopped || !pending) return;
      tryWrite(pending);
    }, waitMs);
  };

  const tryWrite = (input: StatusInput) => {
    const candidate: PresenceStatus = { ...input, clientMs: clock.now(), seq };
    const d = decidePublish({
      lastWritten,
      lastWriteMs,
      candidate,
      nowMs: clock.now(),
      minGapMs: opts.minGapMs ?? TOGETHER_CONFIG.minWriteGapMs,
      heartbeatMs: opts.heartbeatMs ?? TOGETHER_CONFIG.heartbeatMs,
    });
    if (d.action === 'write') write(input);
    else if (d.action === 'wait') { pending = input; schedule(d.waitMs); }
  };

  return {
    update(input: StatusInput) {
      if (stopped) return;
      latest = input;
      tryWrite(input);
    },
    /** Heartbeat tick: re-offers the latest status so `lastSeen` stays fresh. */
    tick() {
      if (stopped || !latest) return;
      tryWrite(pending ?? latest);
    },
    finish(final?: Partial<StatusInput>) {
      if (stopped || !latest) { stopped = true; clearTimer(); return; }
      const done: StatusInput = { ...latest, ...final, state: 'done' };
      tryWrite(done);
      // If it had to wait, let that single timer deliver it; either way no more updates.
      stopped = true;
      if (pending) {
        const waitMs = Math.max(0, (opts.minGapMs ?? TOGETHER_CONFIG.minWriteGapMs) - (clock.now() - (lastWriteMs ?? 0)));
        clearTimer();
        const final2 = pending;
        timer = clock.setTimeout(() => { timer = null; write(final2); }, waitMs);
      }
    },
    stop() { stopped = true; clearTimer(); pending = null; },
  };
}

export type PresencePublisher = ReturnType<typeof createPresencePublisher>;
