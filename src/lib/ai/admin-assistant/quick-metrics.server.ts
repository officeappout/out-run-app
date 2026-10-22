/**
 * quick-metrics.server — the six "תשובה מהירה" chips (plan §9): Firestore only, no model, $0.
 * Each chip = one ops-metrics call rendered as a small Hebrew card. The same functions back the
 * model's tools, so a chip and an answer show the same number.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import {
  getAiCosts,
  getCityMappingSummary,
  getCrmPipeline,
  getPendingApprovals,
  getSignupFailures,
  getWae,
} from '@/lib/admin-analytics/ops-metrics.server';
import type { MetricResult } from '@/lib/admin-analytics/meta';
import type { QuickCard, QuickCardRow } from './sse';
import type { AdminAssistantRole } from '@/lib/admin-nav/page-map';

export const QUICK_METRICS = ['pending_approvals', 'ai_cost_today', 'crm_pipeline', 'wae_week', 'signup_failures_week', 'cities_mapping'] as const;
export type QuickMetricId = (typeof QUICK_METRICS)[number];

export function isQuickMetricId(v: unknown): v is QuickMetricId {
  return typeof v === 'string' && (QUICK_METRICS as readonly string[]).includes(v);
}

/** Root-only chips (their pages / home rows are root-gated). */
export const ROOT_ONLY_QUICK: ReadonlySet<QuickMetricId> = new Set<QuickMetricId>(['signup_failures_week']);

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('he-IL') : 'לא זמין');
const usd = (n: number | null | undefined) => (typeof n === 'number' ? `$${n.toFixed(2)}` : 'לא זמין');

const TYPE_LABELS: Record<string, string> = {
  parks: 'מיקומים',
  routes: 'מסלולים',
  climbs: 'עליות',
  contributions: 'תרומות משתמשים',
  units: 'יחידות',
  amenities: 'מתקנים (OSM)',
};
const LEVEL_LABELS = { green: 'ירוק', yellow: 'צהוב', red: 'אדום' } as const;

function card<T>(
  metric: QuickMetricId,
  title: string,
  href: string,
  res: MetricResult<T>,
  rows: (v: T) => QuickCardRow[],
): QuickCard {
  return {
    metric,
    title,
    href,
    asOf: res.meta.period.to,
    caveats: res.meta.caveats,
    rows: res.value === null ? [{ label: 'סטטוס', value: 'לא זמין כרגע (לא אפס)' }] : rows(res.value),
    ...(res.value === null ? { unavailable: true } : {}),
  };
}

export async function computeQuickCard(
  db: Firestore,
  metric: QuickMetricId,
  role: AdminAssistantRole,
  opts: { now?: Date } = {},
): Promise<QuickCard> {
  const now = opts.now ?? new Date();
  if (ROOT_ONLY_QUICK.has(metric) && role !== 'root') {
    return { metric, title: 'כשלי הרשמה השבוע', rows: [{ label: 'גישה', value: 'למנהלי השורש בלבד' }], href: null, asOf: getIsraelDateKey(now), caveats: [], unavailable: true };
  }
  switch (metric) {
    case 'pending_approvals':
      return card(metric, 'ממתינים לאישור', '/admin/approval-center', await getPendingApprovals(db, { now }), (v) => [
        { label: 'סה״כ', value: fmt(v.total) },
        ...Object.entries(v.byType).map(([k, c]) => ({ label: TYPE_LABELS[k] ?? k, value: fmt(c) })),
        ...v.topAuthorities.slice(0, 3).map((a) => ({ label: `• ${a.name}`, value: fmt(a.count) })),
      ]);
    case 'ai_cost_today':
      return card(metric, 'עלות AI היום (הערכה)', '/admin/costs', await getAiCosts(db, { now }), (v) => [
        { label: 'היום', value: usd(v.todayUsd) },
        { label: 'מתוכם העוזר בפאנל', value: usd(v.adminAssistantTodayUsd) },
        { label: '7 ימים', value: usd(v.last7DaysUsd) },
        { label: 'מתחילת החודש', value: usd(v.monthToDateUsd) },
        { label: 'תקרה יומית', value: usd(v.dailyBudgetUsd) },
      ]);
    case 'crm_pipeline':
      return card(metric, 'צנרת CRM', '/admin/authorities', await getCrmPipeline(db, { now }), (v) => [
        { label: 'בצנרת (בלי טיוטות)', value: fmt(v.inPipeline) },
        { label: 'דחופים (מעקב + סגירה)', value: fmt(v.urgent) },
        ...v.byStatus.filter((r) => r.status !== 'draft').map((r) => ({ label: r.label, value: fmt(r.count) })),
      ]);
    case 'wae_week':
      return card(metric, 'מתאמנים פעילים השבוע (WAE)', '/admin/journey', await getWae(db, { now }), (v) => [
        { label: 'WAE', value: fmt(v.weeklyActiveExercisers) },
        { label: 'אימונים למתאמן', value: fmt(v.workoutsPerActiveUser) },
        { label: 'DAU / MAU', value: `${fmt(v.dailyActiveUsers)} / ${fmt(v.monthlyActiveUsers)}` },
        { label: 'דביקות', value: `${fmt(v.stickinessPct)}%` },
      ]);
    case 'signup_failures_week':
      return card(metric, 'כשלי הרשמה השבוע', '/admin/signup-failures', await getSignupFailures(db, { now }), (v) => [
        { label: 'סה״כ 7 ימים', value: fmt(v.total) },
        ...v.byStage.slice(0, 3).map((s) => ({ label: `שלב: ${s.key}`, value: fmt(s.count) })),
      ]);
    case 'cities_mapping':
      return card(metric, 'ערים במיפוי', '/admin/city-mapping', await getCityMappingSummary(db, { now }), (v) => [
        { label: 'ערים עם מלאי', value: fmt(v.citiesWithInventory) },
        ...(['green', 'yellow', 'red'] as const).map((l) => ({ label: LEVEL_LABELS[l], value: fmt(v.byLevel[l]) })),
      ]);
  }
}
