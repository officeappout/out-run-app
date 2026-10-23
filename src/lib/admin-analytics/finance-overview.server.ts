/**
 * finance-overview.server — company expenses / income and municipal receivables, for
 * get_finance_overview. READ-ONLY, Admin SDK only (financial data is never client-readable).
 *
 * Real data that exists (production, 22.10.2026):
 *   transactions            57 docs from the finance module (type expense|income, approval
 *                           pending|approved|rejected, category, currency ILS|USD|EUR, amountGross,
 *                           period "YYYY-MM"). All are expenses today; NO income rows exist.
 *   authorities.financials  5 authorities: totalQuoteAmount + installments[{amount,targetMonth,
 *                           status pending|paid}] — the only revenue-side data (what cities were
 *                           quoted, what was paid). Written by the CRM financials card.
 * Nothing else (no invoices / payments / subscriptions / contracts collections — all empty).
 * Amounts are summed PER CURRENCY and never converted (fxRate is entered by hand, mostly absent).
 * Only approval='approved' rows count; pending ones are reported apart; rejected are ignored.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { authorityNameOf } from './authority-names.server';
import { metaOf, type MetricResult } from './meta';

export const FINANCE_DEFAULT_MONTHS = 6;
export const FINANCE_MAX_MONTHS = 24;
const RECEIVABLE_ROWS_MAX = 10;

export type CurrencyTotals = Array<{ currency: string; total: number }>;

export interface FinanceSide {
  /** approved rows in the window */
  count: number;
  totals: CurrencyTotals;
  byCategory: Array<{ category: string; count: number; totals: CurrencyTotals }>;
  byMonth: Array<{ period: string; count: number; totals: CurrencyTotals }>;
}

export interface FinanceOverview {
  fromPeriod: string;
  toPeriod: string;
  expenses: FinanceSide;
  income: FinanceSide;
  /** captured by the invoice scanner / entered, waiting for a human — NOT in the totals above */
  pendingApproval: { count: number; needsReview: number };
  /** approved rows in the window with no usable amount (excluded from the totals) */
  rowsWithoutAmount: number;
  /** what cities were quoted vs paid (authorities.financials) — ILS */
  receivables: {
    authoritiesWithQuote: number;
    totalQuoted: number;
    paid: number;
    scheduledPending: number;
    rows: Array<{ id: string; name: string; quoted: number; paid: number; scheduledPending: number }>;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `YYYY-MM` of the Israel month `back` months before the month of `todayKey` (YYYY-MM-DD). */
export function periodBack(todayKey: string, back: number): string {
  const y = Number(todayKey.slice(0, 4));
  const m = Number(todayKey.slice(5, 7)) - 1 - back;
  const total = y * 12 + m;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function addTo(map: Map<string, number>, currency: string, amount: number) {
  map.set(currency, round2((map.get(currency) ?? 0) + amount));
}
const totalsOf = (m: Map<string, number>): CurrencyTotals => Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({ currency, total }));

interface Row {
  type: string;
  approval: string;
  category: string;
  currency: string;
  period: string;
  amount: number | null;
  needsReview: boolean;
}

export function toRow(d: Record<string, unknown>): Row {
  const g = d.amountGross;
  return {
    type: d.type === 'income' ? 'income' : 'expense',
    approval: typeof d.approval === 'string' ? d.approval : 'pending',
    category: typeof d.category === 'string' && d.category ? d.category : 'אחר',
    currency: typeof d.currency === 'string' && d.currency ? d.currency : 'ILS',
    period: typeof d.period === 'string' ? d.period : '',
    amount: typeof g === 'number' && Number.isFinite(g) && g > 0 ? g : null,
    needsReview: d.needsReview === true,
  };
}

function side(rows: Row[]): FinanceSide {
  const total = new Map<string, number>();
  const cat = new Map<string, { count: number; t: Map<string, number> }>();
  const mon = new Map<string, { count: number; t: Map<string, number> }>();
  for (const r of rows) {
    if (r.amount === null) continue;
    addTo(total, r.currency, r.amount);
    for (const [map, key] of [[cat, r.category], [mon, r.period]] as const) {
      const e = map.get(key) ?? { count: 0, t: new Map<string, number>() };
      e.count += 1;
      addTo(e.t, r.currency, r.amount);
      map.set(key, e);
    }
  }
  const weight = (t: CurrencyTotals) => t.reduce((a, x) => a + x.total, 0);
  return {
    count: rows.filter((r) => r.amount !== null).length,
    totals: totalsOf(total),
    byCategory: Array.from(cat.entries())
      .map(([category, e]) => ({ category, count: e.count, totals: totalsOf(e.t) }))
      .sort((a, b) => weight(b.totals) - weight(a.totals)),
    byMonth: Array.from(mon.entries()).map(([period, e]) => ({ period, count: e.count, totals: totalsOf(e.t) })).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

export function summarizeReceivables(docs: Array<{ id: string; data: Record<string, unknown> }>): FinanceOverview['receivables'] {
  const rows = docs.flatMap(({ id, data }) => {
    const f = data.financials as { totalQuoteAmount?: unknown; installments?: unknown } | undefined;
    const quoted = typeof f?.totalQuoteAmount === 'number' && Number.isFinite(f.totalQuoteAmount) ? f.totalQuoteAmount : 0;
    if (quoted <= 0) return [];
    const inst = Array.isArray(f?.installments) ? (f!.installments as Array<Record<string, unknown>>) : [];
    const sum = (status: string) => inst.reduce((a, i) => a + (i && i.status === status && typeof i.amount === 'number' && Number.isFinite(i.amount) ? i.amount : 0), 0);
    return [{ id, name: authorityNameOf(data.name) ?? id, quoted, paid: sum('paid'), scheduledPending: sum('pending') }];
  });
  rows.sort((a, b) => b.quoted - a.quoted);
  return {
    authoritiesWithQuote: rows.length,
    totalQuoted: rows.reduce((a, r) => a + r.quoted, 0),
    paid: rows.reduce((a, r) => a + r.paid, 0),
    scheduledPending: rows.reduce((a, r) => a + r.scheduledPending, 0),
    rows: rows.slice(0, RECEIVABLE_ROWS_MAX),
  };
}

export const FINANCE_CAVEATS = [
  'amounts are summed per currency and NOT converted (USD/EUR rows have no stored exchange rate in most cases)',
  'only approved transactions are in the totals; pending ones are counted separately',
  'income = transactions of type income: none are recorded so far. The only revenue-side data is authorities.financials (quotes and installments, ILS) for the few authorities where it was entered',
  'there are no invoice / payment / subscription / contract collections — this is everything the system holds',
];

export async function getFinanceOverview(db: Firestore, months: number | null, opts: { now?: Date } = {}): Promise<MetricResult<FinanceOverview>> {
  const now = opts.now ?? new Date();
  const today = getIsraelDateKey(now);
  const n = Math.min(Math.max(1, months ?? FINANCE_DEFAULT_MONTHS), FINANCE_MAX_MONTHS);
  const fromPeriod = periodBack(today, n - 1);
  const toPeriod = today.slice(0, 7);
  const meta = (extra: Parameters<typeof metaOf>[2] = {}) => metaOf('finance_overview', { from: `${fromPeriod}-01`, to: today }, extra);
  try {
    const [txSnap, authSnap] = await Promise.all([
      db.collection('transactions').where('period', '>=', fromPeriod).get(),
      db.collection('authorities').where('financials.totalQuoteAmount', '>', 0).get(),
    ]);
    const rows = txSnap.docs.map((d) => toRow((d.data() ?? {}) as Record<string, unknown>)).filter((r) => r.period <= toPeriod);
    const approved = rows.filter((r) => r.approval === 'approved');
    const pending = rows.filter((r) => r.approval === 'pending');
    const value: FinanceOverview = {
      fromPeriod,
      toPeriod,
      expenses: side(approved.filter((r) => r.type === 'expense')),
      income: side(approved.filter((r) => r.type === 'income')),
      pendingApproval: { count: pending.length, needsReview: pending.filter((r) => r.needsReview).length },
      rowsWithoutAmount: approved.filter((r) => r.amount === null).length,
      receivables: summarizeReceivables(authSnap.docs.map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }))),
    };
    return { value, meta: meta({ n: approved.length, caveats: FINANCE_CAVEATS }) };
  } catch (err) {
    console.error('[admin-analytics/finance-overview] failed', err);
    return { value: null, meta: meta(), error: 'finance overview could not be computed' };
  }
}
