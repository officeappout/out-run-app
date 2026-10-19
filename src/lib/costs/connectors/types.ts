/**
 * Connector contract. Each connector is a small module: a PURE parser (tested against recorded
 * fixtures in __tests__/fixtures) + a fetch step that gets everything it needs injected.
 *
 * Secrets: a connector reads its key from `deps.env` and sends it only to its own vendor host.
 * Errors carry an HTTP status / short code — never the key, never the response body.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { BreakdownLine, ConnectorSnapshot, Currency } from '../cost-types';

export interface ConnectorDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: Date;
  /** only the AI ledger connector reads Firestore */
  db?: Firestore;
}

/** 'keep' = this connector can't report that month (e.g. Bunny for a past month): leave the stored snapshot. */
export type ConnectorOutcome = ConnectorSnapshot | 'keep';

export type ConnectorRun = (month: string, deps: ConnectorDeps) => Promise<ConnectorOutcome>;

export interface ParsedCost {
  amount: number;
  currency: Currency;
  breakdown: BreakdownLine[];
}

export class ConnectorHttpError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const FETCH_TIMEOUT_MS = 20_000;

/** Throws ConnectorHttpError('http_<status>') on a non-2xx — the body is NOT included. */
export async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) throw new ConnectorHttpError(`http_${res.status}`);
  return res;
}

export function okSnapshot(parsed: ParsedCost, now: Date): ConnectorSnapshot {
  return { status: 'ok', amount: round4(parsed.amount), currency: parsed.currency, breakdown: parsed.breakdown, fetchedAtMs: now.getTime() };
}

export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Sum amounts per label, drop zero lines, biggest first, cap the list. */
export function groupLines(pairs: Array<[string, number]>, max = 12): BreakdownLine[] {
  const m = new Map<string, number>();
  for (const [label, amount] of pairs) {
    if (!Number.isFinite(amount)) continue;
    m.set(label, (m.get(label) ?? 0) + amount);
  }
  const lines = Array.from(m.entries())
    .map(([label, amount]) => ({ label, amount: round4(amount) }))
    .filter((l) => Math.abs(l.amount) >= 0.0001)
    .sort((a, b) => b.amount - a.amount);
  if (lines.length <= max) return lines;
  const head = lines.slice(0, max - 1);
  const rest = lines.slice(max - 1).reduce((s, l) => s + l.amount, 0);
  return [...head, { label: 'אחר', amount: round4(rest) }];
}

export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}
