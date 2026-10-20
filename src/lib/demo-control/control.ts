/**
 * Demo control center — the run / stop handshake with the AI tester runner
 * (demo_registry/control, see ./paths.ts). Pure parsing, no Firebase import.
 *
 * The panel writes: testersStopRequested (+ who / when) and lastDispatch.
 * The runner (a later PR) writes `testers` and polls testersStopRequested between
 * steps: true → it ends the current session and exits. A new run clears the flag.
 */

export type TesterState = 'running' | 'idle' | 'unknown';

export interface DemoControl {
  testersStopRequested: boolean;
  stopRequestedAtMs: number | null;
  lastDispatch: { atMs: number | null; workflow: string | null; ok: boolean; error: string | null } | null;
  testers: {
    state: TesterState;
    lastSessionAtMs: number | null;
    findingsCount: number | null;
    runId: string | null;
  };
}

function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

/**
 * A runner that crashed never writes 'idle'. A 'running' state whose heartbeat
 * (testers.heartbeatAt, else lastSessionAt) is older than this reads as stale.
 */
export const RUNNER_STALE_MS = 30 * 60 * 1000;

export function parseControl(raw: Record<string, unknown> | undefined | null, nowMs: number): DemoControl {
  const d = raw ?? {};
  const t = (d.testers && typeof d.testers === 'object' ? d.testers : {}) as Record<string, unknown>;
  const ld = (d.lastDispatch && typeof d.lastDispatch === 'object' ? d.lastDispatch : null) as Record<string, unknown> | null;

  const lastSessionAtMs = millisOf(t.lastSessionAt);
  const heartbeat = millisOf(t.heartbeatAt) ?? lastSessionAtMs;
  let state: TesterState = t.state === 'running' ? 'running' : t.state === 'idle' ? 'idle' : 'unknown';
  if (state === 'running' && (heartbeat === null || nowMs - heartbeat > RUNNER_STALE_MS)) state = 'unknown';

  return {
    testersStopRequested: d.testersStopRequested === true,
    stopRequestedAtMs: millisOf(d.stopRequestedAt),
    lastDispatch: ld
      ? {
          atMs: millisOf(ld.at),
          workflow: typeof ld.workflow === 'string' ? ld.workflow : null,
          ok: ld.ok === true,
          error: typeof ld.error === 'string' ? ld.error : null,
        }
      : null,
    testers: {
      state,
      lastSessionAtMs,
      findingsCount: typeof t.findingsCount === 'number' && t.findingsCount >= 0 ? t.findingsCount : null,
      runId: typeof t.runId === 'string' ? t.runId : null,
    },
  };
}
