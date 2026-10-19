/**
 * Bunny CDN / Stream — account billing.
 *   GET https://api.bunny.net/billing      header AccessKey: <BUNNY_ACCOUNT_API_KEY>
 * Docs: https://bunny.net/docs/api-reference/core/billing/get-billing-details (checked 19.10.2026)
 * ThisMonthCharges = "the current account charges of the running month" (USD — Bunny bills in
 * USD); MonthlyCharges* = per-product split. Only the RUNNING month is available, so a past
 * month returns 'keep' and its last daily snapshot stays.
 *
 * NOT the existing BUNNY_API_KEY: that one is the Stream library key (video.bunny.net) and is
 * rejected by api.bunny.net.
 */
import type { ConnectorRun, ParsedCost } from './types';
import { ensureOk, FETCH_TIMEOUT_MS, groupLines, num, okSnapshot } from './types';
import { israelMonthKey } from '../month';

const LABELS: Record<string, string> = {
  MonthlyChargesStorage: 'Storage',
  MonthlyChargesEUTraffic: 'Traffic EU',
  MonthlyChargesUSTraffic: 'Traffic US',
  MonthlyChargesASIATraffic: 'Traffic Asia',
  MonthlyChargesAFTraffic: 'Traffic Africa',
  MonthlyChargesSATraffic: 'Traffic S. America',
  MonthlyChargesPremiumEncoding: 'Premium encoding',
  MonthlyChargesTranscribe: 'Transcribe',
  MonthlyChargesOptimizer: 'Optimizer',
  MonthlyChargesDNS: 'DNS',
  MonthlyChargesDrm: 'DRM',
  MonthlyChargesTaxes: 'Taxes',
};

export function parseBunnyBilling(body: Record<string, unknown>): ParsedCost {
  const pairs: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!k.startsWith('MonthlyCharges')) continue;
    const n = num(v);
    if (n > 0) pairs.push([LABELS[k] ?? k.replace('MonthlyCharges', ''), n]);
  }
  return { amount: num(body?.ThisMonthCharges), currency: 'USD', breakdown: groupLines(pairs) };
}

export const runBunny: ConnectorRun = async (month, deps) => {
  if (month !== israelMonthKey(deps.now)) return 'keep';
  const res = await ensureOk(
    await deps.fetch('https://api.bunny.net/billing', {
      headers: { AccessKey: deps.env.BUNNY_ACCOUNT_API_KEY!.trim(), Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );
  return okSnapshot(parseBunnyBilling((await res.json()) as Record<string, unknown>), deps.now);
};
