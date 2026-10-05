'use client';

/**
 * Journey Hub Wave 2 (05.10.2026, approved wave plan) — the shared
 * filter row ("date / campaign / source / city... applying to all
 * tabs") plus the 4 segmentation dimensions (program/level/sex/age).
 * One component, mounted once above the tabs in /admin/journey/page.tsx
 * — every tab reads the SAME `JourneyFilters` state, not a per-tab copy.
 *
 * Deliberately narrower than /admin/analytics' own filter bar (no
 * medium/linkId dropdowns) — those stay funnel-page-only niche filters,
 * not part of the cross-tab set the wave plan actually asked for.
 *
 * `program: 'strength'` and `'map_only'` carry a real cost caveat on the
 * funnel (see funnel-analytics.service.ts's `countStage` doc comment —
 * those two values fall back to a full-document fetch instead of a
 * cheap count). This bar doesn't hide that from the admin UI with a
 * disabled option — it's still useful information, just slower when
 * selected — but the asymmetry is documented here so a future reader
 * doesn't assume all 3 program values cost the same.
 */

import { useState, useEffect, useMemo } from 'react';
import { Filter, Calendar } from 'lucide-react';
import {
  loadDistinctAttributionValues,
  type DistinctAttribution,
} from '@/features/admin/services/funnel-analytics.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import type { Authority } from '@/types/admin-types';
import { AGE_BUCKETS, type AgeBucket } from '@/lib/age-buckets';
import type { LevelTier } from '@/features/workout-engine/services/split-decision/split-decision.types';

export interface JourneyFilters {
  dateFrom: Date | null;
  dateTo: Date | null;
  campaign: string | null;
  source: string | null;
  cityAuthorityId: string | null;
  sex: 'male' | 'female' | 'other' | null;
  level: LevelTier | null;
  program: 'strength' | 'running' | 'map_only' | null;
  age: AgeBucket | null;
}

export const DEFAULT_JOURNEY_FILTERS: JourneyFilters = {
  dateFrom: null,
  dateTo: null,
  campaign: null,
  source: null,
  cityAuthorityId: null,
  sex: null,
  level: null,
  program: null,
  age: null,
};

const SEX_OPTIONS: { value: JourneyFilters['sex']; label: string }[] = [
  { value: null, label: 'הכל' },
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other', label: 'אחר' },
];

const LEVEL_OPTIONS: { value: JourneyFilters['level']; label: string }[] = [
  { value: null, label: 'הכל' },
  { value: 'beginner', label: 'מתחיל' },
  { value: 'intermediate', label: 'בינוני' },
  { value: 'advanced', label: 'מתקדם' },
];

const PROGRAM_OPTIONS: { value: JourneyFilters['program']; label: string }[] = [
  { value: null, label: 'הכל' },
  { value: 'strength', label: 'כוח' },
  { value: 'running', label: 'ריצה' },
  { value: 'map_only', label: 'מפה בלבד' },
];

const AGE_LABELS: Record<AgeBucket, string> = {
  u18: 'עד 18',
  '18-24': '18-24',
  '25-34': '25-34',
  '35-44': '35-44',
  '45-54': '45-54',
  '55p': '55+',
};

const DATE_PRESETS = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 ימים' },
  { days: 90, label: '90 ימים' },
  { days: null, label: 'הכל' },
] as const;

const toInputDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');
const fromInputDate = (s: string): Date | null => (s ? new Date(`${s}T00:00:00`) : null);

interface JourneyFilterBarProps {
  filters: JourneyFilters;
  onChange: (patch: Partial<JourneyFilters>) => void;
}

export default function JourneyFilterBar({ filters, onChange }: JourneyFilterBarProps) {
  const [distinct, setDistinct] = useState<DistinctAttribution>({ campaigns: [], sources: [], mediums: [] });
  const [cities, setCities] = useState<Authority[]>([]);

  useEffect(() => {
    loadDistinctAttributionValues().then(setDistinct);
    getAllAuthorities().then(setCities).catch(() => setCities([]));
  }, []);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v != null),
    [filters],
  );

  const applyDatePreset = (days: number | null) => {
    if (days == null) {
      onChange({ dateFrom: null, dateTo: null });
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange({ dateFrom: from, dateTo: to });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 text-gray-600 font-bold text-sm shrink-0">
        <Filter size={16} />
        סינון:
      </div>

      <Select label="קמפיין" value={filters.campaign} options={distinct.campaigns} onChange={(v) => onChange({ campaign: v })} />
      <Select label="מקור" value={filters.source} options={distinct.sources} onChange={(v) => onChange({ source: v })} />
      <Select
        label="עיר / רשות"
        value={filters.cityAuthorityId}
        optionPairs={cities.map((c) => [c.id, c.name] as [string, string])}
        onChange={(v) => onChange({ cityAuthorityId: v })}
      />

      <Divider />

      <EnumSelect label="מין" value={filters.sex} options={SEX_OPTIONS} onChange={(v) => onChange({ sex: v })} />
      <EnumSelect label="רמה" value={filters.level} options={LEVEL_OPTIONS} onChange={(v) => onChange({ level: v })} />
      <EnumSelect label="תוכנית" value={filters.program} options={PROGRAM_OPTIONS} onChange={(v) => onChange({ program: v })} />
      <EnumSelect
        label="גיל"
        value={filters.age}
        options={[{ value: null, label: 'הכל' }, ...AGE_BUCKETS.map((b) => ({ value: b, label: AGE_LABELS[b] }))]}
        onChange={(v) => onChange({ age: v })}
      />

      <Divider />

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">מ-תאריך</label>
        <input
          type="date"
          value={toInputDate(filters.dateFrom)}
          onChange={(e) => onChange({ dateFrom: fromInputDate(e.target.value) })}
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">עד-תאריך</label>
        <input
          type="date"
          value={toInputDate(filters.dateTo)}
          onChange={(e) => onChange({ dateTo: fromInputDate(e.target.value) })}
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        />
      </div>
      <div className="flex items-center gap-1.5 pr-2 border-r border-gray-200">
        <Calendar size={14} className="text-gray-400" />
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyDatePreset(p.days)}
            className="px-2.5 py-1.5 text-xs font-bold rounded-md bg-gray-100 hover:bg-cyan-100 hover:text-cyan-700 text-gray-600 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {hasActiveFilters && (
        <button
          onClick={() => onChange(DEFAULT_JOURNEY_FILTERS)}
          className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          נקה הכל
        </button>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-8 border-r border-gray-200 self-center" />;
}

interface SelectProps {
  label: string;
  value: string | null;
  options?: string[];
  optionPairs?: [string, string][];
  onChange: (next: string | null) => void;
}

/** String-valued dropdown — either a flat option list or [value,label] pairs (e.g. city id -> name). */
const Select: React.FC<SelectProps> = ({ label, value, options, optionPairs, onChange }) => {
  const pairs = optionPairs ?? (options ?? []).map((o) => [o, o] as [string, string]);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 min-w-[130px]"
      >
        <option value="">הכל</option>
        {pairs.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </div>
  );
};

interface EnumSelectProps<T extends string | null> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}

/** Typed-enum dropdown (sex/level/program/age) — value is a literal union, not a free string. */
function EnumSelect<T extends string | null>({ label, value, options, onChange }: EnumSelectProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T)}
        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 min-w-[110px]"
      >
        {options.map((opt) => (
          <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
