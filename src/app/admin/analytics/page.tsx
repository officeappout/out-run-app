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
 *   3. KPI strip + Recharts FunnelChart + conversion table — via the
 *      shared `FunnelStagesSection` (extracted journey hub Wave 1,
 *      05.10.2026, so the Journey hub's Acquisition tab can render a
 *      subset of this same funnel without duplicating the JSX)
 *   4. Push → action funnel section
 */

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Filter,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import {
  getFunnelCounts,
  DEFAULT_FUNNEL_FILTERS,
  loadDistinctAttributionValues,
  type FunnelFilters,
  type FunnelStage,
  type DistinctAttribution,
} from '@/features/admin/services/funnel-analytics.service';
import {
  getMarketingLinks,
  type MarketingLink,
} from '@/features/admin/services/marketing-links.service';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import PushFunnelSection, {
  type PushFunnelSummaryResponse,
} from '@/features/admin/components/cpo-dashboard/PushFunnelSection';
import FunnelStagesSection from '@/features/admin/components/cpo-dashboard/FunnelStagesSection';

// ──────────────────────────────────────────────────────────────────────
// Module constants — static UI vocabulary kept outside the component so
// the React reconciler never recreates these on every render.
// ──────────────────────────────────────────────────────────────────────

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

// Distinct value loader (campaign/source/medium dropdowns) moved to
// funnel-analytics.service.ts (Journey Hub Wave 2) — reused from there
// now, not duplicated here.

// ──────────────────────────────────────────────────────────────────────
// Small formatting helpers — co-located so they tree-shake away if
// unused and stay private to the dashboard.
// ──────────────────────────────────────────────────────────────────────

const toInputDate = (d: Date | null): string =>
  d ? d.toISOString().slice(0, 10) : '';

const fromInputDate = (s: string): Date | null =>
  s ? new Date(`${s}T00:00:00`) : null;

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

  // Push → action funnel (Analytics v2 Phase 1, 04.10.2026) — independent
  // of the conversion-funnel filters above; its own server route
  // (/api/admin/push-funnel-summary), loaded once on mount.
  const [pushFunnel, setPushFunnel] = useState<PushFunnelSummaryResponse | null>(null);
  const [pushFunnelLoading, setPushFunnelLoading] = useState(true);
  const [pushFunnelDenied, setPushFunnelDenied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminAuthedFetch<PushFunnelSummaryResponse>('/api/admin/push-funnel-summary').then((result) => {
      if (cancelled) return;
      if (result.ok) { setPushFunnel(result.data); setPushFunnelDenied(null); }
      else { setPushFunnel(null); setPushFunnelDenied(result.message); }
      setPushFunnelLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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

        <FunnelStagesSection stages={stages} loading={loading} />

        <PushFunnelSection data={pushFunnel} loading={pushFunnelLoading} denied={pushFunnelDenied} />

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

// KPICard / ConversionRow / ProgressBar / StatusBadge moved to
// FunnelStagesSection.tsx (journey hub Wave 1) — reused from there now,
// not duplicated here.
