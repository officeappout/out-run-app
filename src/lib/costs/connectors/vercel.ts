/**
 * Vercel — FOCUS v1.3 billing charges.
 *   GET https://api.vercel.com/v1/billing/charges?teamId=<id>&from=<ISO>&to=<ISO>
 *   Authorization: Bearer <VERCEL_BILLING_TOKEN>
 * Docs: https://vercel.com/docs/rest-api/billing/list-focus-billing-charges (checked 19.10.2026)
 * Response is JSONL (one charge per line): BilledCost, BillingCurrency ('USD'), ServiceName,
 * ChargeCategory (Usage / Purchase / Credit / Tax / Adjustment), ChargePeriodStart…
 * Max range 1 year, 1-day granularity, `to` exclusive.
 */
import type { ConnectorRun, ParsedCost } from './types';
import { ensureOk, FETCH_TIMEOUT_MS, groupLines, num, okSnapshot } from './types';
import { monthUtcRange } from '../month';

export function parseVercelJsonl(text: string): ParsedCost {
  const pairs: Array<[string, number]> = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (rec.BillingCurrency !== undefined && rec.BillingCurrency !== 'USD') continue;
    const name = typeof rec.ServiceName === 'string' && rec.ServiceName ? rec.ServiceName : String(rec.ChargeCategory ?? 'Vercel');
    pairs.push([name, num(rec.BilledCost)]);
  }
  return { amount: pairs.reduce((s, [, v]) => s + v, 0), currency: 'USD', breakdown: groupLines(pairs) };
}

export const runVercel: ConnectorRun = async (month, deps) => {
  const { from, to } = monthUtcRange(month);
  const qs = new URLSearchParams({ teamId: deps.env.VERCEL_TEAM_ID!.trim(), from, to });
  const res = await ensureOk(
    await deps.fetch(`https://api.vercel.com/v1/billing/charges?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${deps.env.VERCEL_BILLING_TOKEN!.trim()}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );
  return okSnapshot(parseVercelJsonl(await res.text()), deps.now);
};
