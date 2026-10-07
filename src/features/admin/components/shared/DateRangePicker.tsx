'use client';

import { useState } from 'react';

export interface DateRangePreset {
  key: string;
  label: string;
  /** Rolling days back from today. */
  days: number;
}

export interface DateRangeValue {
  /** null means a custom {from, to} pair, not one of the fixed presets. */
  presetKey: string | null;
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  presets: DateRangePreset[];
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Below this gap (days), a custom range is rejected — never silently applied with a caveat. */
  minGapDays: number;
  minGapMessage: string;
  customLabel?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const toInputDate = (d: Date): string => d.toISOString().slice(0, 10);
// Start-of-day for the raw input value. A committed custom "to" gets
// bumped to end-of-day separately (see commitCustomIfValid) — same
// start/end split analytics.service.ts's getDateRangeForFilter already
// uses, so a custom "to" of today doesn't silently exclude today's data.
const fromInputDate = (s: string): Date | null => (s ? new Date(`${s}T00:00:00`) : null);
const endOfDay = (d: Date): Date => new Date(d.getTime() + MS_PER_DAY - 1);
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * MS_PER_DAY);
const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);

export function resolveDateRangePreset(preset: DateRangePreset): DateRangeValue {
  const to = new Date();
  const from = addDays(to, -preset.days);
  return { presetKey: preset.key, from, to };
}

/**
 * Generic preset + custom date-range picker — one active selection,
 * either a fixed rolling-days preset or a free {from, to} pair, gated
 * by a caller-supplied minimum gap (not every range makes sense below
 * some domain-specific floor — see minGapMessage).
 *
 * 07.10.2026 — built as the third copy of the "presets + two date
 * inputs" pattern already duplicated ad-hoc in
 * `cpo-dashboard/JourneyFilterBar.tsx` and
 * `cpo-dashboard/PushPerformanceSection.tsx` (both pre-date this file,
 * neither refactored here — out of scope for this round). This one is
 * deliberately generic — no training/readiness-specific copy baked
 * in — so a future pass can consolidate the three into one, instead of
 * starting a fourth variant. All three locations are listed together
 * in this file so that future pass has a starting point.
 *
 * 07.10.2026 (David) — NOT just consolidation debt: those other two
 * have a LIVE DATA BUG, confirmed by tracing both consumers. Their
 * shared `fromInputDate` locks "to" to midnight-start-of-day (same as
 * this file's own `fromInputDate`) for BOTH dateFrom AND dateTo, with
 * no end-of-day bump — unlike this file, which bumps a committed
 * custom "to" to end-of-day (see commitCustomIfValid/endOfDay) for
 * exactly this reason. Downstream, `funnel-analytics.service.ts:220`
 * does `where(dateField, '<=', Timestamp.fromDate(filters.dateTo))` and
 * `push-performance-summary/route.ts:169` does
 * `if (dateToMillis != null && millis > dateToMillis) return false` —
 * both compare against that midnight instant. Picking "to = today" (or
 * any day) excludes essentially ALL of that day's real data, not a few
 * edge-case hours. Both screens are showing data short by one day,
 * right now, in production. Not fixed here — out of scope for this
 * round, neither screen's own tests were touched or re-verified. A
 * future fix: bump committed `dateTo` to end-of-day in both files,
 * same pattern this file already uses.
 *
 * A below-minimum custom range is never propagated via onChange — the
 * component holds the invalid draft internally and shows minGapMessage
 * instead. The caller's last valid value simply stays displayed; never
 * a number shown and then caveated.
 */
export default function DateRangePicker({ presets, value, onChange, minGapDays, minGapMessage, customLabel = 'טווח מותאם' }: DateRangePickerProps) {
  const [customActive, setCustomActive] = useState<boolean>(value.presetKey === null);
  const [draftFrom, setDraftFrom] = useState<string>(value.presetKey === null ? toInputDate(value.from) : '');
  const [draftTo, setDraftTo] = useState<string>(value.presetKey === null ? toInputDate(value.to) : '');

  const parsedFrom = fromInputDate(draftFrom);
  const parsedTo = fromInputDate(draftTo);
  const gapTooShort = !!(parsedFrom && parsedTo && daysBetween(parsedFrom, parsedTo) < minGapDays);
  const showWarning = customActive && !!parsedFrom && !!parsedTo && gapTooShort;

  const selectPreset = (preset: DateRangePreset) => {
    setCustomActive(false);
    onChange(resolveDateRangePreset(preset));
  };

  const commitCustomIfValid = (nextFromStr: string, nextToStr: string) => {
    const from = fromInputDate(nextFromStr);
    const toStart = fromInputDate(nextToStr);
    if (from && toStart && daysBetween(from, toStart) >= minGapDays) {
      onChange({ presetKey: null, from, to: endOfDay(toStart) });
    }
  };

  const todayStr = toInputDate(new Date());
  const minToStr = parsedFrom ? toInputDate(addDays(parsedFrom, minGapDays)) : undefined;
  const maxFromStr = parsedTo ? toInputDate(addDays(parsedTo, -minGapDays)) : todayStr;

  return (
    <div className="flex flex-wrap items-center gap-2" dir="rtl">
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p)}
            className={`px-3 py-1.5 text-xs font-bold transition-colors ${
              !customActive && value.presetKey === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomActive(true)}
          className={`px-3 py-1.5 text-xs font-bold transition-colors border-r border-gray-200 ${
            customActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {customLabel}
        </button>
      </div>

      {customActive && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-gray-500">מ-תאריך</label>
            <input
              type="date"
              value={draftFrom}
              max={maxFromStr}
              onChange={(e) => {
                setDraftFrom(e.target.value);
                commitCustomIfValid(e.target.value, draftTo);
              }}
              className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-gray-500">עד-תאריך</label>
            <input
              type="date"
              value={draftTo}
              min={minToStr}
              max={todayStr}
              onChange={(e) => {
                setDraftTo(e.target.value);
                commitCustomIfValid(draftFrom, e.target.value);
              }}
              className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {showWarning && (
            <p className="text-[11px] font-bold text-amber-700">{minGapMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
