'use client';

/**
 * One route option in the destination planner (M-2e "במתכנן ליעד ·
 * footer=select"): badge + selected check, title, minutes · km · climb,
 * data-only tags, and the stop row for a via-park option.
 */
import React from 'react';
import { Activity, Bike, Check, Droplet, Dumbbell, Footprints, Lamp, Mountain, Route as RouteIcon, Trees } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { deriveRouteTags, type PlannerTag } from './route-tags';
import { plannerOptionTitleKey } from './PlannerSelectedRow';
import type { LatLng, PlannerMode, PlannerOption } from './types';

const MODE_ICON = { walking: Footprints, running: Activity, cycling: Bike } as const;
const TAG_ICON = { fitness: Dumbbell, lit: Lamp, water: Droplet, composition: RouteIcon, shade: Trees } as const;

const fmtKm = (km: number) => (Math.round(km * 10) / 10).toFixed(1);

function useTitle(option: PlannerOption): string {
  const t = useT(map);
  const title = plannerOptionTitleKey(option);
  return title.key === 'destPlanner.title.viaPark' ? t(title.key, { name: title.name }) : t(title.key);
}

function TagChip({ tag }: { tag: PlannerTag }) {
  const t = useT(map);
  const Icon = TAG_ICON[tag.key];
  const label =
    tag.key === 'composition' ? t('destPlanner.tag.composition', { pct: tag.pct ?? 0 })
    : tag.key === 'shade' ? t('destPlanner.tag.shade', { pct: tag.pct ?? 0 })
    : tag.key === 'fitness' ? t('destPlanner.tag.fitness')
    : tag.key === 'lit' ? t('destPlanner.tag.lit')
    : t('destPlanner.tag.water');
  return (
    <span className="h-[26px] px-2.5 rounded-full bg-[#f6fbfd] ring-1 ring-inset ring-[#e6edf2] text-[#4b5a66] text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
      <Icon size={13} className="text-sky-600" strokeWidth={2.3} aria-hidden />
      {label}
    </span>
  );
}

export function PlannerRouteCard(props: {
  option: PlannerOption;
  mode: PlannerMode;
  selected: boolean;
  fountains: LatLng[];
  onSelect: () => void;
}) {
  const { option, mode, selected, fountains, onSelect } = props;
  const t = useT(map);
  const title = useTitle(option);
  const ModeIcon = MODE_ICON[mode];
  const tags = deriveRouteTags(option.route, { viaFitnessPark: option.kind === 'via_park', fountains });
  const climb = option.route.elevationGain;
  const badge =
    option.badge === 'recommended' ? t('destPlanner.badge.recommended')
    : option.badge === 'stop' ? t('destPlanner.badge.stop')
    : option.badge === 'shortest' ? t('destPlanner.badge.shortest')
    : null;
  const stop = option.stop;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-start bg-white rounded-[22px] px-3.5 pt-3 pb-3.5 shadow-[0_24px_50px_-36px_rgba(9,30,50,0.45)] transition-shadow ${
        selected ? 'ring-2 ring-[#00baf7]' : 'ring-1 ring-[rgba(14,27,42,0.08)]'
      }`}
    >
      <div className="flex items-center gap-2 min-h-[22px]">
        {badge && (
          <span className="h-[22px] px-2 rounded-full bg-[#eef8fc] text-sky-700 ring-1 ring-inset ring-[rgba(0,186,247,0.4)] text-[11px] font-extrabold inline-flex items-center whitespace-nowrap">
            {badge}
          </span>
        )}
        <span className="flex-1" />
        {selected && (
          <span className="w-[22px] h-[22px] rounded-full bg-[#00baf7] grid place-items-center shrink-0" aria-label={t('destPlanner.selected')}>
            <Check size={13} color="#fff" strokeWidth={3} aria-hidden />
          </span>
        )}
      </div>
      <div className="text-[17px] font-black tracking-tight mt-1.5 truncate text-[#0e1419]">{title}</div>
      <div className="flex items-center gap-1.5 mt-1.5 text-[13px] font-extrabold text-slate-500 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <ModeIcon size={15} strokeWidth={2.4} aria-hidden />
          <span className="text-[#0e1419] text-[15px] font-black">{t('destPlanner.minutes', { n: option.route.duration })}</span>
        </span>
        <span className="text-[#dfe7ed]">·</span>
        <span>{t('destPlanner.km', { km: fmtKm(option.route.distance) })}</span>
        {typeof climb === 'number' && Number.isFinite(climb) && (
          <>
            <span className="text-[#dfe7ed]">·</span>
            <span className="inline-flex items-center gap-1">
              <Mountain size={13} strokeWidth={2.3} aria-hidden />
              <bdi dir="ltr">+{Math.round(climb)}</bdi> {t('destPlanner.climb')}
            </span>
          </>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 mt-2.5 overflow-hidden">
          {tags.map((tag) => <TagChip key={tag.key} tag={tag} />)}
        </div>
      )}
      {stop && (
        <div className="flex items-center gap-2 mt-2.5 px-2.5 py-[7px] rounded-[14px] bg-[#eef7df]">
          <Dumbbell size={15} className="text-lime-600 shrink-0" strokeWidth={2.4} aria-hidden />
          <span className="flex-1 min-w-0 text-[12.5px] font-extrabold text-lime-800 truncate">
            {stop.afterKm != null
              ? t('destPlanner.stop', { name: stop.name, km: fmtKm(stop.afterKm) })
              : t('destPlanner.stopNoKm', { name: stop.name })}
          </span>
        </div>
      )}
    </button>
  );
}
