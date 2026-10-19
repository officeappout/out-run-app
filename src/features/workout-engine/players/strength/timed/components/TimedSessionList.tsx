'use client';

/**
 * TimedSessionList — the layer BEHIND the timed player (boards A-2e3 "הסל",
 * A-4e, A-1d): the block's cart ring + totals, what is already in the basket
 * (earlier segments collapsed to one line), what comes next (the next item
 * marked "עכשיו", upcoming dimmed) and the segments after the block.
 */
import React from 'react';
import { Footprints } from 'lucide-react';
import { CartProgressIcon, ExerciseThumb } from '@/components/ui/v2';
import type { CartRingItem } from '@/components/ui/v2';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import SessionListLayer from '../../../shared/v2/SessionListLayer';
import type { PillTone, TimedListModel, TimedListRow } from '../logic/timed-list';

export interface TimedSessionListProps {
  workout: WorkoutPlan;
  segmentIndex: number;
  blockTitle: string;
  model: TimedListModel;
  cartItems: readonly CartRingItem[];
  remaining: string;
  onClose: () => void;
}

const PILL: Record<PillTone, string> = {
  done: 'bg-v2-tint text-v2-deep ring-v2-accent/40',
  partial: 'bg-[#fff7ed] text-[#c2410c] ring-[#fdba74]',
  missed: 'bg-v2-surface text-v2-muted ring-v2-hairline',
};

function Row({ row, dim }: { row: TimedListRow; dim?: boolean }) {
  return (
    <li
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
        row.now ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-white shadow-v2-ring'
      } ${dim ? 'opacity-60' : ''}`}
    >
      <div className="overflow-hidden rounded-[10px]">
        {row.kind === 'aerobic_leg' ? (
          <div className="grid h-10 w-10 place-items-center bg-[#ecfccb] text-[#65a30d]">
            <Footprints size={18} strokeWidth={2.2} aria-hidden />
          </div>
        ) : (
          <ExerciseThumb imageUrl={row.imageUrl} size={40} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate whitespace-nowrap text-[14.5px] font-extrabold text-v2-ink">{row.name}</div>
        <div className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{row.detail}</div>
        {row.pills && row.pills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1" dir="ltr">
            {row.pills.map((p, i) => (
              <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums ring-1 ring-inset ${PILL[p.tone]}`}>
                {p.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {row.trailing && (
        <span className={`shrink-0 whitespace-nowrap text-[12.5px] font-extrabold tabular-nums ${row.now ? 'text-v2-deep' : 'text-v2-ink-2'}`}>
          {row.trailing}
        </span>
      )}
    </li>
  );
}

function segmentLine(workout: WorkoutPlan, i: number): string | null {
  const s = workout.segments[i];
  const n = s?.exercises?.length ?? 0;
  if (!s || n === 0) return null;
  return `${s.title || 'חלק'} · ${n} ${n === 1 ? 'תרגיל' : 'תרגילים'}`;
}

export default function TimedSessionList({ workout, segmentIndex, blockTitle, model, cartItems, remaining, onClose }: TimedSessionListProps) {
  const before = workout.segments.map((_, i) => (i < segmentIndex ? segmentLine(workout, i) : null)).filter(Boolean) as string[];
  const after = workout.segments.map((_, i) => (i > segmentIndex ? segmentLine(workout, i) : null)).filter(Boolean) as string[];
  return (
    <SessionListLayer subtitle={`${blockTitle} · ${workout.name}`} onClose={onClose}>
      <div className="mt-4 flex items-center gap-3 rounded-[20px] bg-white px-3 py-3 shadow-v2-ring">
        <CartProgressIcon items={cartItems} onClick={onClose} ariaLabel="חזרה לנגן" />
        <div className="min-w-0">
          <div className="truncate whitespace-nowrap text-[16px] font-black text-v2-ink">{model.headline}</div>
          <div className="truncate whitespace-nowrap text-[12.5px] font-bold tabular-nums text-v2-muted">
            {model.summary} · {remaining} נותרו
          </div>
        </div>
      </div>

      <h3 className="mb-2 mt-5 text-[15px] font-black text-v2-ink">בסל</h3>
      <ul className="space-y-2">
        {before.map((line) => (
          <li key={line} className="truncate whitespace-nowrap rounded-2xl bg-white px-3 py-2.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">
            {line}
          </li>
        ))}
        {model.done.map((r) => (
          <Row key={r.key} row={r} />
        ))}
      </ul>

      {model.queue.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-[15px] font-black text-v2-ink">
            הבא בתור{model.queueTitle && model.queueTitle !== 'הבא בתור' ? ` · ${model.queueTitle}` : ''}
          </h3>
          <ul className="space-y-2">
            {model.queue.map((r) => (
              <Row key={r.key} row={r} dim={!r.now} />
            ))}
          </ul>
        </>
      )}

      {after.length > 0 && (
        <p className="mt-4 truncate whitespace-nowrap text-[13px] font-bold text-v2-muted">אחר כך: {after.join(' · ')}</p>
      )}
    </SessionListLayer>
  );
}
