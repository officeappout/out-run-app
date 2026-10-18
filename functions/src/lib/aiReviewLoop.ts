/**
 * aiReviewLoop — the pure driver behind aiCoachReviewScheduler. Zero external imports
 * (runs under the root vitest too).
 *
 * The review itself runs in the Next.js app (POST /api/admin/ai-coach/reviews/run — it owns
 * the Anthropic SDK wrapper, the budget checks and the prompts). One call there reviews what
 * fits in ~45 s and reports `remaining`; this loop keeps calling until nothing is left, the
 * daily cap (200 threads) is reached, the route reports a hard stop (budget, kill switch,
 * review off), the wall-clock budget runs out, or two calls in a row fail.
 */

export interface RunSliceResponse {
  reviewed?: number;
  failed?: number;
  remaining?: boolean;
  stoppedBy?: string | null;
  costUsd?: number;
}

export type CallSlice = (maxThreads: number) => Promise<RunSliceResponse>;

export interface LoopResult {
  calls: number;
  reviewed: number;
  failed: number;
  costUsd: number;
  stoppedBy: string;
}

/** Stops that another call today cannot change. */
export const HARD_STOPS = new Set(['review_off', 'kill_switch', 'over_budget', 'review_budget']);

export async function runReviewLoop(
  callSlice: CallSlice,
  opts: { maxThreads: number; deadlineMs: number; now?: () => number; maxCalls?: number },
): Promise<LoopResult> {
  const now = opts.now ?? Date.now;
  const maxCalls = opts.maxCalls ?? 40;
  const out: LoopResult = { calls: 0, reviewed: 0, failed: 0, costUsd: 0, stoppedBy: 'done' };
  let consecutiveErrors = 0;
  while (out.calls < maxCalls) {
    const left = opts.maxThreads - out.reviewed;
    if (left <= 0) return { ...out, stoppedBy: 'cap' };
    if (now() >= opts.deadlineMs) return { ...out, stoppedBy: 'deadline' };
    out.calls++;
    let res: RunSliceResponse;
    try {
      res = await callSlice(left);
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= 2) return { ...out, stoppedBy: 'errors' };
      continue;
    }
    out.reviewed += res.reviewed ?? 0;
    out.failed += res.failed ?? 0;
    out.costUsd += res.costUsd ?? 0;
    if (res.stoppedBy && HARD_STOPS.has(res.stoppedBy)) return { ...out, stoppedBy: res.stoppedBy };
    if (!res.remaining) return { ...out, stoppedBy: 'done' };
    // A slice that made no progress at all (every thread failed) would spin: stop.
    if ((res.reviewed ?? 0) === 0 && (res.failed ?? 0) > 0) return { ...out, stoppedBy: 'no_progress' };
  }
  return { ...out, stoppedBy: 'max_calls' };
}
