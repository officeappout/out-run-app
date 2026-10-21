'use client';

/**
 * The week builder's header (boards S-2c…S-2g): title + subtitle (+ an action slot, e.g. the
 * Kelly chip), the track tabs (כוח / ריצה / משולב — only when the week has two tracks), the
 * priority slider (two tracks), the days-per-week picker, the session chips and the hint.
 */
import type { ReactNode } from 'react';
import { Chip, SegmentedPicker } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule, type ScheduleKey } from '@/messages/ns/schedule';
import type { SchedulePriority } from '../../engine-v2/types';
import type { WbChip, WbTab } from '../summary';
import type { WbTrack } from '../types';
import PrioritySlider from './PrioritySlider';

const TAB_KEY: Record<WbTab, ScheduleKey> = {
  strength: 'weekBuilder.tab.strength',
  run: 'weekBuilder.tab.run',
  walk: 'weekBuilder.tab.walk',
  all: 'weekBuilder.tab.all',
};

export interface WeekBuilderHeaderProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  tracks: WbTrack[];
  tab: WbTab;
  onTab: (t: WbTab) => void;
  priority?: { value: SchedulePriority; onChange: (p: SchedulePriority) => void } | null;
  counts: Record<WbTrack, number>;
  daysCount?: { value: number; options: number[]; onChange: (n: number) => void } | null;
  chips: WbChip[];
}

export default function WeekBuilderHeader(p: WeekBuilderHeaderProps) {
  const t = useT(schedule);
  const tabs: WbTab[] = p.tracks.length > 1 ? [...p.tracks, 'all'] : [];
  return (
    <div className="px-4 pb-2 pt-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{p.title}</h1>
          <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{p.subtitle}</p>
        </div>
        {p.action}
      </div>

      {tabs.length > 0 && (
        <SegmentedPicker
          ariaLabel={t('weekBuilder.tabsAria')}
          className="mt-3.5"
          options={tabs.map((k) => ({ key: k, label: t(TAB_KEY[k]) }))}
          value={p.tab}
          onChange={p.onTab}
        />
      )}

      {p.priority && (
        <PrioritySlider value={p.priority.value} onChange={p.priority.onChange} strengthCount={p.counts.strength} runCount={p.counts.run} />
      )}

      {p.daysCount && (
        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{t('weekBuilder.daysLabel')}</span>
          <SegmentedPicker
            ariaLabel={t('weekBuilder.daysLabel')}
            className="min-w-0 flex-1"
            options={p.daysCount.options.map((n) => ({ key: String(n), label: String(n) }))}
            value={String(p.daysCount.value)}
            onChange={(k) => p.daysCount!.onChange(Number(k))}
          />
        </div>
      )}

      {p.chips.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
          {p.chips.map((c) => (
            <Chip key={c.key} tone="accent" className="shrink-0">
              {c.labelHe} <span className="tabular-nums">×{c.count}</span>
            </Chip>
          ))}
        </div>
      )}

      <p className="mt-3 truncate whitespace-nowrap px-1 text-[12px] font-bold text-v2-muted">{t('weekBuilder.hint')}</p>
    </div>
  );
}
