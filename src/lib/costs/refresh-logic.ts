/**
 * How one refresh outcome is folded into the stored snapshot — pure.
 *
 * A failed or "not configured" refresh never wipes a good number: the last good amounts stay,
 * marked with the error, so a flaky vendor API (or a key rotated out) doesn't zero the month.
 */
import type { ConnectorSnapshot } from './cost-types';
import type { ConnectorOutcome } from './connectors/types';

export type RefreshOutcome =
  | ConnectorOutcome
  | { status: 'not_configured' }
  | { status: 'manual' }
  | { status: 'error'; error: string };

export function mergeOutcome(prev: ConnectorSnapshot | undefined, outcome: RefreshOutcome, nowMs: number): ConnectorSnapshot | null {
  if (outcome === 'keep') return null;
  const hadGood = prev?.status === 'ok';
  if (outcome.status === 'ok') {
    const clean: ConnectorSnapshot = { ...(outcome as ConnectorSnapshot) };
    delete clean.error;
    delete clean.errorAtMs;
    return clean;
  }
  if (outcome.status === 'error') {
    if (hadGood) return { ...prev!, error: outcome.error, errorAtMs: nowMs };
    return { status: 'error', amount: 0, currency: 'USD', breakdown: [], fetchedAtMs: nowMs, error: outcome.error, errorAtMs: nowMs };
  }
  // not_configured / manual
  if (hadGood) return null;
  return { status: outcome.status, amount: 0, currency: 'USD', breakdown: [], fetchedAtMs: nowMs };
}

/** Error text safe to store/show: a short code only, never a token or a response body. */
export function safeErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[a-z0-9_]{1,40}$/i.test(code)) return code;
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  return 'fetch_failed';
}
