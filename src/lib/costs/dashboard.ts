/**
 * The /admin/costs payload, assembled from month docs + items — pure, so the route stays thin
 * and the whole computation is tested without Firestore.
 */
import type { ConnectorId, ConnectorSnapshot, CostItem, MonthDoc, MonthFx } from './cost-types';
import { CONNECTORS, isConfigured } from './connector-meta';
import { detectSpikes, pctChange, summarizeMonth, vendorTrends, type MonthSummary, type Spike } from './aggregate';
import { resolveMonthFx } from './fx';
import { upcomingRenewals } from './items';
import { lastMonths, monthProgress, shiftMonth } from './month';

export const TREND_MONTHS = 6;

export interface ConnectorView {
  id: ConnectorId;
  configured: boolean;
  snapshot: ConnectorSnapshot | null;
}

export interface DashboardPayload {
  month: string;
  today: string;
  isCurrentMonth: boolean;
  elapsedDays: number;
  totalDays: number;
  fx: MonthFx;
  summary: MonthSummary;
  previousTotalIls: number;
  changePct: number | null;
  /** oldest first, TREND_MONTHS long, ending at `month` */
  trend: { months: string[]; totals: number[]; byRow: Record<string, number[]> };
  spikes: Spike[];
  renewals: Array<{ itemId: string; name: string; date: string; inDays: number; amount: number; currency: CostItem['currency'] }>;
  connectors: ConnectorView[];
  todayAiUsd: number | null;
  items: CostItem[];
}

export function buildDashboard(input: {
  month: string;
  today: string;
  docs: Record<string, MonthDoc | null>;
  items: CostItem[];
  env: Record<string, string | undefined>;
  todayAiUsd: number | null;
}): DashboardPayload {
  const { month, today, docs, items } = input;
  const trendMonths = lastMonths(month, TREND_MONTHS);
  const summaries = trendMonths.map((m) => summarizeMonth(m, docs[m], items, today));
  const summary = summaries[summaries.length - 1];
  const previous = summaries[summaries.length - 2];
  const prev3 = [1, 2, 3].map((i) => summarizeMonth(shiftMonth(month, -i), docs[shiftMonth(month, -i)], items, today));
  const { elapsedDays, totalDays, isCurrent } = monthProgress(month, today);

  return {
    month,
    today,
    isCurrentMonth: isCurrent,
    elapsedDays,
    totalDays,
    fx: resolveMonthFx(docs[month]?.fx),
    summary,
    previousTotalIls: previous.totalIls,
    // the running month is compared on its forecast — month-to-date vs a full month misleads
    changePct: pctChange(isCurrent ? summary.forecastIls : summary.totalIls, previous.totalIls),
    trend: { months: trendMonths, totals: summaries.map((s) => s.totalIls), byRow: vendorTrends(summaries) },
    spikes: detectSpikes(summary, prev3),
    renewals: upcomingRenewals(items, today, 30).map((r) => ({
      itemId: r.item.id, name: r.item.name, date: r.date, inDays: r.inDays, amount: r.item.amount, currency: r.item.currency,
    })),
    connectors: CONNECTORS.map((meta) => ({
      id: meta.id,
      configured: isConfigured(meta, input.env),
      snapshot: docs[month]?.connectors?.[meta.id] ?? null,
    })),
    todayAiUsd: input.todayAiUsd,
    items,
  };
}

/** Every month the dashboard needs: TREND_MONTHS back, plus 3 more for the spike baseline. */
export function monthsToLoad(month: string): string[] {
  return lastMonths(month, Math.max(TREND_MONTHS, 4));
}
