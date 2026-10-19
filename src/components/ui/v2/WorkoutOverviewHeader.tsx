'use client';

/**
 * WorkoutOverviewHeader — the summary row on top of a workout overview:
 * title, then "·"-separated meta ("41 דק׳ · ~6.4 ק״מ · מסיים ~07:42").
 * Extracted (19.10.2026) from the route+stops hybrid overview
 * (HybridOverviewScreen), whose output it reproduces byte for byte in both
 * flag states; the run preview / briefing use it too.
 *
 * v2: the title takes its own line (22px), meta wraps under it.
 * Tones: `primary` (the time — heavier) / `secondary` (muted).
 */

import type { ReactNode } from 'react';

export interface OverviewMetaItem {
  key: string;
  text: ReactNode;
  tone?: 'primary' | 'secondary';
}

export interface WorkoutOverviewHeaderProps {
  title: ReactNode;
  meta: readonly OverviewMetaItem[];
  /** Home v2 look (enable_home_v2); false = the pre-v2 look, unchanged. */
  v2?: boolean;
}

function Sep({ v2 }: { v2: boolean }) {
  return <span className={v2 ? 'text-v2-pill-border' : undefined} style={v2 ? undefined : { color: '#D1D5DB' }}>·</span>;
}

export default function WorkoutOverviewHeader({ title, meta, v2 = false }: WorkoutOverviewHeaderProps) {
  return (
    <div className={v2 ? 'flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-[13px]' : 'flex items-center gap-1.5 flex-wrap text-[13px]'}>
      <span className={v2 ? 'basis-full text-[22px] font-black leading-tight !tracking-[-0.02em] text-v2-ink' : 'text-[18px] font-black'} style={v2 ? undefined : { color: '#111827' }}>
        {title}
      </span>
      {meta.map((m, i) => {
        const primary = (m.tone ?? (i === 0 ? 'primary' : 'secondary')) === 'primary';
        return [
          // Pre-v2 the title and the first meta sit on one line, so they get a dot too.
          ...(i > 0 || !v2 ? [<Sep key={`sep-${m.key}`} v2={v2} />] : []),
          <span
            key={m.key}
            className={v2
              ? primary ? 'whitespace-nowrap font-extrabold text-v2-ink-2' : 'whitespace-nowrap font-bold text-v2-muted'
              : primary ? 'font-black' : 'font-bold'}
            style={v2 ? undefined : { color: primary ? '#374151' : '#6B7280' }}
          >
            {m.text}
          </span>,
        ];
      })}
    </div>
  );
}
