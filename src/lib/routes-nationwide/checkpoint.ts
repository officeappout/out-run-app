/**
 * Resume support: a nationwide dry-run can be stopped (Ctrl-C, crash, machine
 * sleep) and continued. The checkpoint is a small JSON object; the script
 * owns the file I/O. An authority is "done" only once its summary was saved,
 * so a half-processed authority is simply redone.
 */
export interface CheckpointEntry {
  authorityId: string;
  name: string;
  finishedAt: string;
  status: 'done' | 'skipped' | 'error';
  note?: string;
}

export interface Checkpoint {
  version: 1;
  runId: string;
  startedAt: string;
  apply: boolean;
  /** The ordered authority ids this run was planned with. */
  order: string[];
  done: Record<string, CheckpointEntry>;
}

export function newCheckpoint(runId: string, order: string[], apply: boolean, now = new Date()): Checkpoint {
  return { version: 1, runId, startedAt: now.toISOString(), apply, order, done: {} };
}

export function parseCheckpoint(raw: string): Checkpoint | null {
  try {
    const c = JSON.parse(raw);
    if (c?.version !== 1 || !Array.isArray(c?.order) || typeof c?.done !== 'object') return null;
    return c as Checkpoint;
  } catch {
    return null;
  }
}

/** Authorities still to process, in run order. `retryErrors` re-queues failed ones. */
export function remaining(c: Checkpoint, retryErrors = false): string[] {
  return c.order.filter((id) => {
    const e = c.done[id];
    return !e || (retryErrors && e.status === 'error');
  });
}

export function markDone(c: Checkpoint, e: CheckpointEntry): Checkpoint {
  return { ...c, done: { ...c.done, [e.authorityId]: e } };
}

/**
 * A resumed run must be the same kind of run: a dry-run checkpoint is never
 * continued with --apply (or the reverse) — that would mix "proposed" and
 * "written" in one summary.
 */
export function checkpointMismatch(c: Checkpoint, apply: boolean): string | null {
  return c.apply === apply ? null : `checkpoint ${c.runId} was a ${c.apply ? 'APPLY' : 'dry'} run; start a fresh run (--fresh) instead of mixing modes`;
}
