'use client';

/**
 * DrillChips — a leg's technique drills / exercises on the overview axis
 * (run overview, enable_home_v2): one small pill per drill with a play glyph;
 * a tap opens its video (the axis' `onDrillTap`). Restores the old briefing's
 * "tap a drill in מבנה האימון to watch it".
 */

import { Play } from 'lucide-react';
import type { OverviewDrill } from '../overview-legs';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export interface DrillChipsProps {
  drills: readonly OverviewDrill[];
  onTap: (drillKey: string) => void;
}

export default function DrillChips({ drills, onTap }: DrillChipsProps) {
  const t = useT(map);
  if (drills.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {drills.map((d) => (
        <button
          key={d.key}
          type="button"
          onClick={() => onTap(d.key)}
          aria-label={t('overview.axis.watchVideo', { name: d.label })}
          className="inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full bg-v2-surface px-3 ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Play size={12} strokeWidth={2.6} fill="currentColor" className="shrink-0 text-v2-deep" aria-hidden />
          <span className="min-w-0 truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink">{d.label}</span>
        </button>
      ))}
    </div>
  );
}
