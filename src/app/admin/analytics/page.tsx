'use client';

/**
 * Growth Hub — Dynamic Conversion Funnel Dashboard
 *
 * Renders a 6-stage acquisition → retention funnel sliced by marketing
 * attribution and demographics. Every count comes from a server-side
 * `getCountFromServer` aggregation inside `funnel-analytics.service.ts`,
 * so this page transfers only ~5 primitive numbers per filter change
 * regardless of dataset size.
 *
 * Layout (top to bottom):
 *   1. Page header with refresh action
 *   2. Sticky filter bar (campaign · source · medium · gender · date)
 *   3. 5-card KPI strip with raw counts
 *   4. Recharts FunnelChart visual canvas
 *   5. Detailed conversion table with per-stage drop-off math and badges
 */

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Calendar,
  Loader2,
} from 'lucide-react';
import {
  getFunnelCounts,
  DEFAULT_FUNNEL_FILTERS,
  FUNNEL_DROP_THRESHOLD,
  FUNNEL_CAUTION_THRESHOLD,
  type FunnelFilters,
  type FunnelStage,
} from '@/features/admin/services/funnel-analytics.service';
import {
  getMarketingLinks,
  type MarketingLink,
} from '@/features/admin/services/marketing-links.service';

// ──────────────────────────────────────────────────────────────────────
// Module constants — static UI vocabulary kept outside the component so
// the React reconciler never recreates these on every render.
// ──────────────────────────────────────────────────────────────────────

const STAGE_FILL: Record<FunnelStage['id'], string> = {
  registered: '#6366f1',  // indigo-500  — top of funnel anchor
  midpoint:   '#0ea5e9',  // sky-500     — onboarding push
  completed:  '#10b981',  // emerald-500 — onboarding success
  activation: '#f59e0b',  // amber-500   — first workout
  retention:  '#ef4444',  // red-500     — retained user
  revenue:    '#9ca3af',  // gray-400    — placeholder (no data yet)
};

const GENDER_OPTIONS: { value: FunnelFilters['gender']; label: string }[] = [
  { value: null,     label: 'הכל' },
  { value: 'male',   label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other',  label: 'אחר' },
];

const DATE_PRESETS = [
  { days: 7,    label: '7 ימים' },
  { days: 30,   label: '30 ימים' },
  { days: 90,   label: '90 ימים' },
  { days: null, label: 'הכל' },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Distinct value loader — fills the dropdowns from the existing user
// docs that have a marketingAttribution object. Capped at 200 docs so
// even on a very large user base this stays a single cheap query.
//
// Note: this is a deliberate trade-off — for very large datasets the
// "distinct values" list may be incomplete (a long-tail campaign in
// doc #201+ would not appear). The trade-off is acceptable because:
//   • The most common campaigns/sources will dominate the top docs.
//   • Admins can still type-filter by URL param if needed.
//   • A proper "distinct" query would require a separate aggregation
//     pipeline that's overkill for v1.
// ──────────────────────────────────────────────────────────────────────

interface DistinctAttribution {
  campaigns: string[];
  sources: string[];
  mediums: string[];
}

async function loadDistinctAttributionValues(): Promise<DistinctAttribution> {
  try {
    const q = query(
      collection(db, 'users'),
      where('marketingAttribution.source', '!=', null),
      orderBy('marketingAttribution.source'),
      limit(200),
    );
    const snap = await getDocs(q);
    const campaigns = new Set<string>();
    const sources   = new Set<string>();
    const mediums   = new Set<string>();
    snap.forEach((doc) => {
      const a = doc.data()?.marketingAttribution;
      if (!a) return;
      if (typeof a.campaign === 'string' && a.campaign) campaigns.add(a.campaign);
      if (typeof a.source   === 'string' && a.source)   sources.add(a.source);
      if (typeof a.medium   === 'string' && a.medium)   mediums.add(a.medium);
    });
    return {
      campaigns: Array.from(campaigns).sort(),
      sources:   Array.from(sources).sort(),
      mediums:   Array.from(mediums).sort(),
    };
  } catch (err) {
    console.error('[Analytics] Failed to load distinct attribution values:', err);
    return { campaigns: [], sources: [], mediums: [] };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Small formatting helpers — co-located so they tree-shake away if
// unused and stay private to the dashboard.
// ──────────────────────────────────────────────────────────────────────

const fmtCount = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('he-IL');

const fmtPct = (p: number | null) =>
  p == null ? '—' : `${p.toFixed(1)}%`;

const toInputDate = (d: Date | null): string =>
  d ? d.toISOString().slice(0, 10) : '';

const fromInputDate = (s: string): Date | null =>
  s ? new Date(`${s}T00:00:00`) : null;

// ──────────────────────────────────────────────────────────────────────
// Funnel label renderer.
//
// Recharts' custom-label content prop receives `(props)` containing
// `{x, y, width, height, value, index, ...rowData}` — but the exact
// shape varies between minor versions and between chart types. To
// avoid that fragility we lean on the built-in `dataKey`-driven label
// (which is guaranteed stable across versions) and surface every
// detailed per-stage signal (count, conversion %, warning chip) in the
// KPI strip and conversion table that flank the chart. This keeps the
// chart itself a clean visual primitive whose only job is showing the
// funnel's geometric shape.
// ──────────────────────────────────────────────────────────────────────
// Page component
// ──────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [filters, setFilters] = useState<FunnelFilters>(DEFAULT_FUNNEL_FILTERS);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [distinct, setDistinct] = useState<DistinctAttribution>({
    campaigns: [],
    sources: [],
    mediums: [],
  });
  const [links, setLinks] = useState<MarketingLink[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Load distinct attribution values once on mount. Cheap (200-doc cap)
  // and never re-fetched — admins can hard-refresh the page for a fresh
  // list if a new campaign was just launched.
  useEffect(() => {
    loadDistinctAttributionValues().then(setDistinct);
  }, []);

  // Load the full link registry (not just linkIds seen on users so far) —
  // this is what lets an admin pick a brand-new QR code before it has any
  // conversions yet, and it's the same cheap, small-registry query the
  // /admin/links table already relies on.
  useEffect(() => {
    getMarketingLinks().then(setLinks).catch(() => setLinks([]));
  }, []);

  // Debounced funnel fetch — every filter mutation schedules a 300ms
  // delayed `getFunnelCounts` call. The cleanup cancels in-flight
  // timers so rapid filter changes don't pile up wasted queries.
  // `refreshNonce` lets the manual refresh button bypass the debounce
  // by changing the dep value.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await getFunnelCounts(filters);
        if (!cancelled) setStages(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, refreshNonce]);

  // Merge-helper for the filter setter so individual dropdowns can do
  // `updateFilter({ source: 'facebook' })` without spreading manually.
  const updateFilter = useCallback(<K extends keyof FunnelFilters>(patch: Pick<FunnelFilters, K>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyDatePreset = useCallback((days: number | null) => {
    if (days == null) {
      updateFilter({ dateFrom: null, dateTo: null });
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    updateFilter({ dateFrom: from, dateTo: to });
  }, [updateFilter]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FUNNEL_FILTERS);
  }, []);

  // Map funnel stages → Recharts data shape. The chart silently drops
  // entries with `value == null`, which is exactly what we want for the
  // revenue placeholder so it doesn't distort the funnel proportions.
  const chartData = useMemo(
    () => stages
      .filter((s) => s.count != null)
      .map((s) => ({
        name: s.labelHe,
        value: s.count as number,
        fill: STAGE_FILL[s.id],
        stage: s,
      })),
    [stages],
  );

  const stage1Count = stages[0]?.count ?? null;
  const hasActiveFilters = useMemo(
    () => (
      filters.campaign != null ||
      filters.source != null ||
      filters.medium != null ||
      filters.linkId != null ||
      filters.gender != null ||
      filters.dateFrom != null ||
      filters.dateTo != null
    ),
    [filters],
  );

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-12">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-md">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">משפך המרות ואנליטיקס</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                ניתוח מסע המשתמש מנקודת הרישום ועד שלב השימור — מסונן לפי קמפיינים, מקור תנועה ופרופיל דמוגרפי.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRefreshNonce((n) => n + 1)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg font-bold text-sm transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            רענן
          </button>
        </div>
      </div>

      {/* ── STICKY FILTER BAR ──────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-slate-600 font-bold text-sm shrink-0">
            <Filter size={16} />
            סינון:
          </div>

          {/* Campaign filter */}
          <FilterSelect
            label="קמפיין"
            value={filters.campaign}
            options={distinct.campaigns}
            onChange={(v) => updateFilter({ campaign: v })}
          />

          {/* Source filter */}
          <FilterSelect
            label="מקור"
            value={filters.source}
            options={distinct.sources}
            onChange={(v) => updateFilter({ source: v })}
          />

          {/* Medium filter */}
          <FilterSelect
            label="מדיה"
            value={filters.medium}
            options={distinct.mediums}
            onChange={(v) => updateFilter({ medium: v })}
          />

          {/* Link filter — one specific marketing_links doc (e.g. one QR code) */}
          <LinkFilterSelect
            label="קישור / QR"
            value={filters.linkId}
            options={links}
            onChange={(v) => updateFilter({ linkId: v })}
          />

          {/* Gender filter (static enum) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">מין</label>
            <select
              value={filters.gender ?? ''}
              onChange={(e) => updateFilter({ gender: (e.target.value || null) as FunnelFilters['gender'] })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[110px]"
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date range — explicit pickers */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">מ-תאריך</label>
            <input
              type="date"
              value={toInputDate(filters.dateFrom)}
              onChange={(e) => updateFilter({ dateFrom: fromInputDate(e.target.value) })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">עד-תאריך</label>
            <input
              type="date"
              value={toInputDate(filters.dateTo)}
              onChange={(e) => updateFilter({ dateTo: fromInputDate(e.target.value) })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Date presets */}
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
            <Calendar size={14} className="text-slate-400" />
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyDatePreset(p.days)}
                className="px-2.5 py-1.5 text-xs font-bold rounded-md bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              נקה הכל
            </button>
          )}
        </div>
      </div>

      {/* ── PAGE BODY ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* KPI STRIP — 5 cards, horizontal scroll on narrow viewports */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {stages
            .filter((s) => s.id !== 'revenue')
            .map((s) => (
              <KPICard key={s.id} stage={s} loading={loading && stages.length === 0} />
            ))}
        </div>

        {/* FUNNEL CHART */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-900">המחשת המשפך</h2>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                מרענן נתונים…
              </div>
            )}
          </div>

          {/* Skeleton overlay during loading — kept absolutely positioned
              so the chart itself never unmounts, preventing the layout
              jank that a hard remount would cause on every filter tap. */}
          {loading && stages.length === 0 ? (
            <div className="h-[420px] flex items-center justify-center text-slate-400">
              <Loader2 size={32} className="animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[420px] flex flex-col items-center justify-center text-slate-400">
              <BarChart3 size={48} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">אין נתונים עבור הסינון הנבחר</p>
            </div>
          ) : (
            <div className="h-[420px] w-full" dir="ltr">
              {/* dir=ltr on the chart wrapper because Recharts geometry
                  assumes LTR — the labels render the Hebrew text fine,
                  but the funnel must layout left-to-right. */}
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    formatter={(value: number, _name: string, item: { payload?: { name?: string } }) => [
                      value.toLocaleString('he-IL'),
                      item?.payload?.name ?? '',
                    ]}
                    cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Funnel
                    dataKey="value"
                    data={chartData}
                    isAnimationActive
                    lastShapeType="rectangle"
                  >
                    {/* Built-in label renderers: name floats to the right
                        of each band; count is centered inside it. */}
                    <LabelList
                      position="right"
                      dataKey="name"
                      fill="#1f2937"
                      fontSize={14}
                      fontWeight={700}
                    />
                    <LabelList
                      position="center"
                      dataKey="value"
                      fill="#ffffff"
                      fontSize={16}
                      fontWeight={800}
                      formatter={(value: number) => value.toLocaleString('he-IL')}
                    />
                    {chartData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.fill} />
                    ))}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CONVERSION TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-black text-slate-900">פירוט המרות לפי שלב</h2>
            <p className="text-sm text-slate-500 mt-1">
              מסומן באדום: שלב עם נטישה חדה מעל 50%. מסומן בכתום: צריך תשומת לב.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3">שלב</th>
                  <th className="px-6 py-3">משתמשים</th>
                  <th className="px-6 py-3 min-w-[200px]">משפך כללי (מול S1)</th>
                  <th className="px-6 py-3 min-w-[200px]">זרימת שלב (מול קודם)</th>
                  <th className="px-6 py-3">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stages.map((s) => (
                  <ConversionRow
                    key={s.id}
                    stage={s}
                    stage1Count={stage1Count}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

/**
 * Reusable filter dropdown for the dynamic attribution values
 * (campaign / source / medium). `value=null` renders the "הכל" option.
 */
interface FilterSelectProps {
  label: string;
  value: string | null;
  options: string[];
  onChange: (next: string | null) => void;
}

const FilterSelect: React.FC<FilterSelectProps> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[140px]"
    >
      <option value="">הכל</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

/**
 * Filter dropdown for a specific `marketing_links` doc — unlike
 * `FilterSelect`, id (the query value) and label (friendlyName, shown to
 * the admin) are different strings, so this can't reuse that component.
 */
interface LinkFilterSelectProps {
  label: string;
  value: string | null;
  options: MarketingLink[];
  onChange: (next: string | null) => void;
}

const LinkFilterSelect: React.FC<LinkFilterSelectProps> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[160px]"
    >
      <option value="">הכל</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>{opt.friendlyName}</option>
      ))}
    </select>
  </div>
);

/**
 * Single KPI card in the horizontal strip. Renders count, stage name,
 * and step conversion %. Drop-warning stages get a red border accent.
 */
interface KPICardProps {
  stage: FunnelStage;
  loading: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ stage, loading }) => {
  const fill = STAGE_FILL[stage.id];
  const isWarn = stage.isDropWarning;
  return (
    <div
      className={`shrink-0 min-w-[180px] rounded-2xl p-4 border-2 shadow-sm transition-shadow ${
        isWarn ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
        <span className="text-xs font-bold text-slate-600">{stage.labelHe}</span>
      </div>
      <div className="text-2xl font-black text-slate-900">
        {loading ? <span className="inline-block w-12 h-7 bg-slate-200 rounded animate-pulse" /> : fmtCount(stage.count)}
      </div>
      {stage.stepConversion != null && (
        <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${isWarn ? 'text-rose-600' : 'text-emerald-600'}`}>
          {isWarn && <TrendingDown size={12} />}
          {fmtPct(stage.stepConversion)} מהשלב הקודם
        </div>
      )}
      {stage.stepConversion == null && stage.globalConversion != null && (
        <div className="mt-2 text-xs font-bold text-indigo-600">
          עוגן ראשי
        </div>
      )}
    </div>
  );
};

/**
 * Single row of the conversion table. Renders both progress bars
 * (global and step), plus the stage status badge.
 */
interface ConversionRowProps {
  stage: FunnelStage;
  stage1Count: number | null;
}

const ConversionRow: React.FC<ConversionRowProps> = ({ stage, stage1Count }) => {
  const fill = STAGE_FILL[stage.id];
  const isPlaceholder = stage.count == null;
  return (
    <tr className={isPlaceholder ? 'bg-slate-50/50' : 'hover:bg-slate-50/60 transition-colors'}>
      {/* Stage name */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
          <span className={`text-sm font-bold ${isPlaceholder ? 'text-slate-400' : 'text-slate-900'}`}>
            {stage.labelHe}
          </span>
        </div>
      </td>

      {/* Count */}
      <td className="px-6 py-4">
        <span className={`text-sm font-bold tabular-nums ${isPlaceholder ? 'text-slate-400' : 'text-slate-800'}`}>
          {isPlaceholder ? 'ממתין לנתונים' : fmtCount(stage.count)}
        </span>
      </td>

      {/* Global conversion bar */}
      <td className="px-6 py-4">
        <ProgressBar
          percent={stage.globalConversion}
          fill={fill}
          base={stage1Count}
        />
      </td>

      {/* Step conversion bar */}
      <td className="px-6 py-4">
        <ProgressBar
          percent={stage.stepConversion}
          fill={fill}
          emphasizeWarning
        />
      </td>

      {/* Status badge */}
      <td className="px-6 py-4">
        <StatusBadge stepConversion={stage.stepConversion} isPlaceholder={isPlaceholder} />
      </td>
    </tr>
  );
};

/**
 * Horizontal progress bar with the percentage rendered to its left.
 * Width is clamped 0-100 so absurd values (e.g. stage count > stage1
 * count after an index drift) still render gracefully.
 */
interface ProgressBarProps {
  percent: number | null;
  fill: string;
  base?: number | null;
  emphasizeWarning?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percent, fill, emphasizeWarning }) => {
  if (percent == null) {
    return <span className="text-xs font-medium text-slate-400">—</span>;
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const isWarn = emphasizeWarning && percent < FUNNEL_DROP_THRESHOLD;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[100px]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${clamped}%`,
            backgroundColor: isWarn ? '#ef4444' : fill,
          }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums min-w-[44px] text-left ${isWarn ? 'text-rose-600' : 'text-slate-700'}`}>
        {fmtPct(percent)}
      </span>
    </div>
  );
};

/**
 * Status pill — green / amber / red based on step conversion.
 * The placeholder revenue stage gets a calm gray "ממתין לנתונים" badge.
 */
interface StatusBadgeProps {
  stepConversion: number | null;
  isPlaceholder: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ stepConversion, isPlaceholder }) => {
  if (isPlaceholder) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
        ממתין לנתונים
      </span>
    );
  }
  if (stepConversion == null) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
        עוגן ראשי
      </span>
    );
  }
  if (stepConversion < FUNNEL_DROP_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
        <AlertTriangle size={12} />
        ירידה חדה
      </span>
    );
  }
  if (stepConversion < FUNNEL_CAUTION_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        <AlertTriangle size={12} />
        זהירות
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
      <CheckCircle2 size={12} />
      תקין
    </span>
  );
};
