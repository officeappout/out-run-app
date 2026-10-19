/**
 * cursorRunLoop — the pure driver behind kellyProactiveScheduler and kellyMemoryScheduler.
 * Zero external imports (runs under the root vitest too).
 *
 * The work runs in the Next.js app (it owns the Anthropic wrapper, the user sheet and the
 * prompts). One call handles what fits in ~40 s and answers { remaining, cursor }; this loop
 * calls again with that cursor until nothing is left, the route reports a hard stop (flag
 * off, kill switch, budget), the wall-clock deadline passes, or two calls in a row fail.
 */

export interface CursorSliceResponse {
  remaining?: boolean;
  cursor?: string | null;
  stoppedBy?: string | null;
  sent?: number;
  updated?: number;
  costUsd?: number;
}

export type CallCursorSlice = (cursor: string | null) => Promise<CursorSliceResponse>;

export interface CursorLoopResult {
  calls: number;
  sent: number;
  updated: number;
  costUsd: number;
  stoppedBy: string;
}

export const CURSOR_HARD_STOPS = new Set(['flag_off', 'nothing_due', 'kill_switch', 'over_budget', 'config_unavailable']);

export async function runCursorLoop(
  call: CallCursorSlice,
  opts: { deadlineMs: number; now?: () => number; maxCalls?: number },
): Promise<CursorLoopResult> {
  const now = opts.now ?? Date.now;
  const maxCalls = opts.maxCalls ?? 20;
  const out: CursorLoopResult = { calls: 0, sent: 0, updated: 0, costUsd: 0, stoppedBy: 'done' };
  let cursor: string | null = null;
  let errors = 0;
  while (out.calls < maxCalls) {
    if (now() >= opts.deadlineMs) return { ...out, stoppedBy: 'deadline' };
    out.calls++;
    let res: CursorSliceResponse;
    try {
      res = await call(cursor);
      errors = 0;
    } catch {
      errors++;
      if (errors >= 2) return { ...out, stoppedBy: 'errors' };
      continue;
    }
    out.sent += res.sent ?? 0;
    out.updated += res.updated ?? 0;
    out.costUsd += res.costUsd ?? 0;
    if (res.stoppedBy && CURSOR_HARD_STOPS.has(res.stoppedBy)) return { ...out, stoppedBy: res.stoppedBy };
    if (!res.remaining) return { ...out, stoppedBy: res.stoppedBy ?? 'done' };
    // A slice that reports work left but no cursor would loop on the same users: stop.
    if (!res.cursor || res.cursor === cursor) return { ...out, stoppedBy: 'no_progress' };
    cursor = res.cursor;
  }
  return { ...out, stoppedBy: 'max_calls' };
}
