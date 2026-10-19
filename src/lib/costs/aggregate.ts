/**
 * Month totals, forecast, trend and spike detection — pure. Everything comes out in ILS.
 *
 * One vendor row per connector vendor (the highest-priority connector with status ok wins, so
 * the official Anthropic report replaces our ledger estimate instead of adding to it) plus one
 * row per manual item. A manual item tagged with a vendorKey whose connector reported for that
 * month is "covered" — listed, but not added a second time.
 *
 * Forecast for the running month: usage rows are extrapolated linearly from month-to-date
 * (amount / elapsedDays × daysInMonth); fixed rows count in full. Past months: forecast = actual.
 */
import type { ConnectorId, ConnectorSnapshot, CostItem, MonthDoc, VendorKey } from './cost-types';
import { CONNECTOR_BY_ID, CONNECTORS, VENDOR_LABEL_HE } from './connector-meta';
import { resolveMonthFx, roundIls, toIls } from './fx';
import { itemChargeInMonth } from './items';
import { monthProgress } from './month';

export type RowKind = 'usage' | 'fixed';

export interface VendorRow {
  /** 'v:<vendorKey>' for connector rows, 'i:<itemId>' for manual items */
  key: string;
  label: string;
  kind: RowKind;
  source: ConnectorId | 'manual';
  ils: number;
  forecastIls: number;
  /** manual item whose vendor is already reported by a connector (not counted) */
  covered?: boolean;
}

export interface MonthSummary {
  month: string;
  rows: VendorRow[];
  totalIls: number;
  forecastIls: number;
}

/** The winning connector snapshot per vendor for one month. */
export function pickVendorSnapshots(doc: MonthDoc | null | undefined): Partial<Record<VendorKey, { id: ConnectorId; snap: ConnectorSnapshot }>> {
  const out: Partial<Record<VendorKey, { id: ConnectorId; snap: ConnectorSnapshot }>> = {};
  const connectors = doc?.connectors ?? {};
  for (const meta of CONNECTORS) {
    const snap = connectors[meta.id];
    if (!snap || snap.status !== 'ok' || !Number.isFinite(snap.amount)) continue;
    const cur = out[meta.vendor];
    if (!cur || CONNECTOR_BY_ID[cur.id].priority < meta.priority) out[meta.vendor] = { id: meta.id, snap };
  }
  return out;
}

export function linearForecast(amount: number, elapsedDays: number, totalDays: number): number {
  if (elapsedDays <= 0) return amount;
  if (elapsedDays >= totalDays) return amount;
  return (amount / elapsedDays) * totalDays;
}

export function summarizeMonth(month: string, doc: MonthDoc | null | undefined, items: CostItem[], today: string): MonthSummary {
  const fx = resolveMonthFx(doc?.fx);
  const { elapsedDays, totalDays, isCurrent } = monthProgress(month, today);
  const rows: VendorRow[] = [];

  const picked = pickVendorSnapshots(doc);
  for (const [vendor, hit] of Object.entries(picked) as Array<[VendorKey, { id: ConnectorId; snap: ConnectorSnapshot }]>) {
    const ils = toIls(hit.snap.amount, hit.snap.currency, fx);
    rows.push({
      key: `v:${vendor}`,
      label: VENDOR_LABEL_HE[vendor],
      kind: 'usage',
      source: hit.id,
      ils: roundIls(ils),
      forecastIls: roundIls(isCurrent ? linearForecast(ils, elapsedDays, totalDays) : ils),
    });
  }

  for (const item of items) {
    const charge = itemChargeInMonth(item, month);
    if (charge <= 0) continue;
    const ils = roundIls(toIls(charge, item.currency, fx));
    const covered = !!item.vendorKey && !!picked[item.vendorKey];
    rows.push({ key: `i:${item.id}`, label: item.name, kind: 'fixed', source: 'manual', ils, forecastIls: ils, ...(covered ? { covered } : {}) });
  }

  rows.sort((a, b) => Number(!!a.covered) - Number(!!b.covered) || b.forecastIls - a.forecastIls);
  const counted = rows.filter((r) => !r.covered);
  return {
    month,
    rows,
    totalIls: roundIls(counted.reduce((s, r) => s + r.ils, 0)),
    forecastIls: roundIls(counted.reduce((s, r) => s + r.forecastIls, 0)),
  };
}

/** Per-row series across `summaries` (oldest first), 0 where a month has no value. */
export function vendorTrends(summaries: MonthSummary[]): Record<string, number[]> {
  const keys = new Set<string>();
  for (const s of summaries) for (const r of s.rows) if (!r.covered) keys.add(r.key);
  const out: Record<string, number[]> = {};
  for (const key of Array.from(keys)) {
    out[key] = summaries.map((s) => s.rows.find((r) => r.key === key && !r.covered)?.ils ?? 0);
  }
  return out;
}

export interface Spike {
  key: string;
  label: string;
  currentIls: number;
  avgIls: number;
  ratio: number;
}

export const SPIKE_RATIO = 1.5;
/** Ignore pocket change — a ₪3 → ₪6 jump is not an alert. */
export const SPIKE_MIN_ILS = 20;

/**
 * A usage row spikes when this month's value (the forecast for the running month) is above
 * SPIKE_RATIO × its average over the previous 3 months. Months with no value count as 0, but
 * at least one of the 3 must be non-zero (a brand-new vendor is not a spike).
 */
export function detectSpikes(current: MonthSummary, previous3: MonthSummary[]): Spike[] {
  const out: Spike[] = [];
  for (const row of current.rows) {
    // Fixed items are known in advance (a yearly renewal is not an anomaly) — usage rows only.
    if (row.kind !== 'usage' || row.covered || row.forecastIls < SPIKE_MIN_ILS) continue;
    const past = previous3.map((s) => s.rows.find((r) => r.key === row.key && !r.covered)?.ils ?? 0);
    if (!past.some((v) => v > 0)) continue;
    const avg = past.reduce((a, b) => a + b, 0) / past.length;
    if (avg > 0 && row.forecastIls > SPIKE_RATIO * avg) {
      out.push({ key: row.key, label: row.label, currentIls: row.forecastIls, avgIls: roundIls(avg), ratio: Math.round((row.forecastIls / avg) * 10) / 10 });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** Percent change vs the previous month's total (null when there is nothing to compare). */
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
