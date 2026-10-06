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
 * `program: 'map_only'` carries a real cost caveat on the funnel (see
 * funnel-analytics.service.ts's `countStage` doc comment — that value
 * falls back to a full-document fetch instead of a cheap count). This
 * bar doesn't hide that from the admin UI with a disabled option —
 * it's still useful information, just slower when selected — but the
 * asymmetry is documented here so a future reader doesn't assume
 * every program value costs the same.
 *
 * Next panel wave (06.10.2026), item 2: the "תוכנית" dropdown used to
 * offer one generic "כוח" bucket. Now lists the REAL named strength
 * programs (`getAllPrograms()`, the same catalog /admin/programs
 * manages — filtered to `trainingType !== 'cardio'`), fetched once on
 * mount alongside the other filter-option lists already loaded here.
 * Item 2's "רמה" half: once a specific strength program is selected,
 * the level dropdown switches from the global beginner/intermediate/
 * advanced tiers to that PROGRAM's own real level scale (1..
 * `program.maxLevels`) — see `levelOptionsFor` below.
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
import { getAllPrograms } from '@/features/content/programs/core/program.service';

export interface JourneyFilters {
  dateFrom: Date | null;
  dateTo: Date | null;
  campaign: string | null;
  source: string | null;
  cityAuthorityId: string | null;
  sex: 'male' | 'female' | 'other' | null;
  /**
   * `LevelTier` (global tier) when `program` isn't a specific strength
   * program; a plain `number` (minimum level WITHIN that program) when
   * it is — see the file header comment.
   */
  level: LevelTier | number | null;
  /**
   * 'running' / 'map_only', or a real strength-program slug (e.g.
   * 'front_lever') — see `strengthPrograms` state below for where the
   * slug list comes from. No more generic 'strength' bucket.
   */
  program: string | null;
  age: AgeBucket | null;
}

/** One real strength-program option for the "תוכנית" dropdown. */
interface StrengthProgramOption {
  /** The track slug used in `progression.domains`/`.tracks` — see program.types.ts's own `slug` field doc comment. */
  slug: string;
  nameHe: string;
  /** This program's own level ceiling, for the per-program level dropdown. Falls back to a safe default if the catalog doc has none set. */
  maxLevels: number;
}

const FALLBACK_MAX_LEVELS = 25;

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

/** The global-tier level options — shown when no specific strength program is selected. */
const GLOBAL_LEVEL_OPTIONS: { value: JourneyFilters['level']; label: string }[] = [
  { value: null, label: 'הכל' },
  { value: 'beginner', label: 'מתחיל' },
  { value: 'intermediate', label: 'בינוני' },
  { value: 'advanced', label: 'מתקדם' },
];

/** The 2 fixed program buckets. Real strength programs are appended dynamically — see `strengthPrograms` state. */
const FIXED_PROGRAM_OPTIONS: { value: string; label: string }[] = [
  { value: 'running', label: 'ריצה' },
  { value: 'map_only', label: 'מפה בלבד' },
];

/**
 * Level options for the current `program` selection: the real 1..N
 * scale of that specific strength program once one is picked, else
 * the global tiers. Centralised so the dropdown's rendering and the
 * "what does a stale level value mean now" reset logic (below) agree.
 */
function levelOptionsFor(
  program: string | null,
  strengthPrograms: StrengthProgramOption[],
): { value: JourneyFilters['level']; label: string }[] {
  const selected = strengthPrograms.find((p) => p.slug === program);
  if (!selected) return GLOBAL_LEVEL_OPTIONS;
  const levels: { value: JourneyFilters['level']; label: string }[] = [{ value: null, label: 'הכל' }];
  for (let lvl = 1; lvl <= selected.maxLevels; lvl++) {
    levels.push({ value: lvl, label: `רמה ${lvl}+` });
  }
  return levels;
}

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
  const [strengthPrograms, setStrengthPrograms] = useState<StrengthProgramOption[]>([]);

  useEffect(() => {
    loadDistinctAttributionValues().then(setDistinct);
    getAllAuthorities().then(setCities).catch(() => setCities([]));
    // Real named strength programs for the "תוכנית" dropdown — the
    // same catalog /admin/catalog manages, not a second list. `slug`
    // derivation mirrors program-hierarchy.utils.ts's own formula
    // (slug field -> movementPattern -> lowercased name) so the value
    // this bar sends matches the SAME key funnel-analytics.service.ts
    // / growth-metrics use to read `progression.domains`/`.tracks`.
    getAllPrograms()
      .then((programs) => {
        const strengthOnly = programs
          .filter((p) => (p.trainingType ?? 'strength') === 'strength')
          .map((p) => ({
            slug: p.slug || p.movementPattern || p.name.toLowerCase().replace(/[\s-]+/g, '_'),
            nameHe: p.name,
            maxLevels: p.maxLevels ?? FALLBACK_MAX_LEVELS,
          }))
          .sort((a, b) => a.nameHe.localeCompare(b.nameHe, 'he'));
        setStrengthPrograms(strengthOnly);
      })
      .catch(() => setStrengthPrograms([]));
  }, []);

  const programOptions = useMemo(
    () => [
      { value: null as string | null, label: 'הכל' },
      ...FIXED_PROGRAM_OPTIONS,
      ...strengthPrograms.map((p) => ({ value: p.slug, label: p.nameHe })),
    ],
    [strengthPrograms],
  );
  const levelOptions = useMemo(() => levelOptionsFor(filters.program, strengthPrograms), [filters.program, strengthPrograms]);

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

  // `level`'s MEANING depends entirely on `program` (a global tier vs.
  // a specific program's own level scale) — changing program makes any
  // previously-selected level value stale, so always reset it together.
  const handleProgramChange = (nextProgram: string | null) => {
    onChange({ program: nextProgram, level: null });
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
      <EnumSelect label="תוכנית" value={filters.program} options={programOptions} onChange={handleProgramChange} />
      <EnumSelect label="רמה" value={filters.level} options={levelOptions} onChange={(v) => onChange({ level: v })} />
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

interface EnumSelectProps<T extends string | number | null> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}

/**
 * Typed-enum dropdown (sex/program/age, and now level — a literal
 * union OR a number, never a free string). The native `<select>`
 * element only ever gives back a string; rather than blindly casting
 * that string back to `T` (which would silently leave a numeric level
 * value as the STRING "5", not the number 5), this looks up the
 * matching option by its string form and returns THAT option's real
 * typed `value` — correct for every T this bar uses level for.
 */
function EnumSelect<T extends string | number | null>({ label, value, options, onChange }: EnumSelectProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          const matched = options.find((opt) => String(opt.value ?? '') === raw);
          onChange(matched ? matched.value : (null as T));
        }}
        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 min-w-[110px]"
      >
        {options.map((opt) => (
          <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
