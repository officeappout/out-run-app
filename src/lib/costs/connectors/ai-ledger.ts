/**
 * Kelly / AI — our own ledger, ai_usage_global/{YYYY-MM-DD}.costUsd (written by
 * recordAiUsage in src/lib/ai/anthropic.server.ts, Israel days). An ESTIMATE from the price
 * table, not an invoice; replaced by the anthropic_admin connector when that one is set up.
 */
import type { ConnectorRun, ParsedCost } from './types';
import { num, okSnapshot } from './types';
import { dayKeysOfMonth } from '../month';
import { getIsraelDateKey } from '@/lib/israelTime';

export const AI_USAGE_GLOBAL = 'ai_usage_global';

export interface LedgerDay {
  day: string;
  costUsd?: unknown;
  calls?: unknown;
}

export function parseLedgerDays(days: LedgerDay[]): ParsedCost & { calls: number } {
  let amount = 0;
  let calls = 0;
  for (const d of days) {
    amount += num(d.costUsd);
    calls += num(d.calls);
  }
  return { amount, currency: 'USD', breakdown: [], calls };
}

export const runAiLedger: ConnectorRun = async (month, deps) => {
  if (!deps.db) throw new Error('no_db');
  const today = getIsraelDateKey(deps.now);
  const keys = dayKeysOfMonth(month, today);
  if (keys.length === 0) return okSnapshot({ amount: 0, currency: 'USD', breakdown: [] }, deps.now);
  const col = deps.db.collection(AI_USAGE_GLOBAL);
  const snaps = await deps.db.getAll(...keys.map((k) => col.doc(k)));
  const days = snaps.filter((s) => s.exists).map((s) => ({ day: s.id, ...(s.data() as Omit<LedgerDay, 'day'>) }));
  const parsed = parseLedgerDays(days);
  return okSnapshot(
    { ...parsed, breakdown: [{ label: `${parsed.calls.toLocaleString('en-US')} קריאות`, amount: parsed.amount }] },
    deps.now,
  );
};
