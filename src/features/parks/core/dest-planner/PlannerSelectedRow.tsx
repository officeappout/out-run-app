'use client';

/**
 * The planner's COLLAPSED body (Google-Maps-style compact sheet): one line
 * for the selected route — minutes · km · its title — and, when there is
 * more than one way, "N דרכים לשם ⌃" to open the full list. A tap anywhere
 * on the row expands the sheet.
 */
import React from 'react';
import { Activity, Bike, ChevronUp, Footprints } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { PlannerMode, PlannerOption } from './types';

const MODE_ICON = { walking: Footprints, running: Activity, cycling: Bike } as const;
const fmtKm = (km: number) => (Math.round(km * 10) / 10).toFixed(1);

export function plannerOptionTitleKey(option: PlannerOption):
  | { key: 'destPlanner.title.shortest' | 'destPlanner.title.alternative' | 'destPlanner.title.quiet' }
  | { key: 'destPlanner.title.viaPark'; name: string } {
  if (option.kind === 'shortest') return { key: 'destPlanner.title.shortest' };
  if (option.kind === 'via_park' && option.stop) return { key: 'destPlanner.title.viaPark', name: option.stop.name };
  return { key: option.route.variant === 'quiet' ? 'destPlanner.title.quiet' : 'destPlanner.title.alternative' };
}

export function PlannerSelectedRow(props: {
  option: PlannerOption;
  mode: PlannerMode;
  optionCount: number;
  onExpand: () => void;
}) {
  const { option, mode, optionCount, onExpand } = props;
  const t = useT(map);
  const ModeIcon = MODE_ICON[mode];
  const title = plannerOptionTitleKey(option);
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={t('destPlanner.expand')}
      className="w-full text-start bg-white rounded-[18px] px-3.5 py-2.5 ring-2 ring-[#00baf7] flex items-center gap-2"
    >
      <ModeIcon size={16} strokeWidth={2.4} className="shrink-0 text-[#0e1419]" aria-hidden />
      <span className="text-[16px] font-black text-[#0e1419] whitespace-nowrap">{t('destPlanner.minutes', { n: option.route.duration })}</span>
      <span className="text-[#dfe7ed]">·</span>
      <span className="text-[13px] font-extrabold text-slate-500 whitespace-nowrap">{t('destPlanner.km', { km: fmtKm(option.route.distance) })}</span>
      <span className="text-[#dfe7ed]">·</span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-extrabold text-slate-600">
        {title.key === 'destPlanner.title.viaPark' ? t(title.key, { name: title.name }) : t(title.key)}
      </span>
      {optionCount > 1 && (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-extrabold text-sky-700 whitespace-nowrap shrink-0">
          {t('destPlanner.options.title', { count: optionCount })}
          <ChevronUp size={14} strokeWidth={2.6} aria-hidden />
        </span>
      )}
    </button>
  );
}
