/**
 * The tester's model call with a bounded retry. The SDK already retries twice on its own;
 * this adds a slower outer backoff for overloads / rate limits / dropped connections that
 * outlast those, and logs the REAL error (run 39549310762, D07: the log said only
 * "model call failed: Error"). Never retries a request the API rejected as invalid (4xx other
 * than 408 / 409 / 429) — that would only burn money on the same error.
 */
import { redactSecrets } from './demo-guard';

export const MODEL_CALL_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 4000;
const MAX_BACKOFF_MS = 30_000;

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  error?: { error?: { type?: unknown; message?: unknown }; type?: unknown } | unknown;
  request_id?: unknown;
}

export function modelErrorStatus(e: unknown): number | null {
  const s = (e as ErrorLike | null)?.status;
  return typeof s === 'number' ? s : null;
}

/** "529 overloaded_error: Overloaded (req_…)" — status, API error type, message, request id. */
export function describeModelError(e: unknown): string {
  if (!(e instanceof Error) && (typeof e !== 'object' || e === null)) return String(e).slice(0, 300);
  const x = e as ErrorLike;
  const body = (x.error as { error?: { type?: unknown; message?: unknown } } | undefined)?.error;
  const parts = [
    modelErrorStatus(e) ?? (typeof x.name === 'string' && x.name !== 'Error' ? x.name : null),
    typeof body?.type === 'string' ? `${body.type}:` : null,
    typeof body?.message === 'string' ? body.message : typeof x.message === 'string' ? x.message : null,
    typeof x.request_id === 'string' ? `(${x.request_id})` : null,
  ].filter((p) => p !== null && p !== '');
  return redactSecrets(parts.join(' ') || 'unknown error').slice(0, 300);
}

export function isRetryableModelError(e: unknown): boolean {
  const s = modelErrorStatus(e);
  if (s === null) return true; // connection reset / timeout / no response
  return s === 408 || s === 409 || s === 429 || s >= 500;
}

/** 4s, 12s, … capped at 30s, ±20% jitter (rng injectable for tests). */
export function backoffMs(attempt: number, rng: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 3 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + 0.4 * rng()));
}

export type RetryResult<T> = { ok: true; value: T } | { ok: false; error: string; attempts: number };

export async function withModelRetry<T>(
  call: () => Promise<T>,
  opts: { log: (msg: string) => void; attempts?: number; sleep?: (ms: number) => Promise<void>; rng?: () => number },
): Promise<RetryResult<T>> {
  const attempts = Math.max(1, opts.attempts ?? MODEL_CALL_ATTEMPTS);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 1; ; i++) {
    try {
      return { ok: true, value: await call() };
    } catch (e) {
      const what = describeModelError(e);
      const retry = i < attempts && isRetryableModelError(e);
      if (!retry) {
        opts.log(`model call failed (attempt ${i}/${attempts}, giving up): ${what}`);
        return { ok: false, error: what, attempts: i };
      }
      const wait = backoffMs(i, opts.rng);
      opts.log(`model call failed (attempt ${i}/${attempts}, retry in ${Math.round(wait / 1000)}s): ${what}`);
      await sleep(wait);
    }
  }
}
