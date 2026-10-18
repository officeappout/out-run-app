'use client';

import { TrendingUp } from 'lucide-react';
import { ExerciseThumb } from './ExerciseSetsTable';
import { deltaLabel, improvementHeadline, type ImprovementUnit } from './summary';

/**
 * "שיפור מהפעם הקודמת" — the big green card: a green tile, the title, one
 * line of context, a big green delta, then one row per improved item
 * (picture, name, "פעם קודמת X · היום Y", green delta pill). Only real
 * previous-session data; the caller passes nothing ⇒ nothing renders.
 */

export interface ImprovementItem {
  key: string;
  name: string;
  imageUrl?: string;
  /** Printed values ("21", "0:45"). */
  previous: string;
  today: string;
  delta: number;
  unit: ImprovementUnit;
}

export interface ImprovementCardProps {
  items: ImprovementItem[];
  /** Context line; default "N תרגילים השתפרו". */
  context?: string;
}

const GREEN = '#10b981';
const GREEN_TEXT = '#047857';
const GREEN_SUB = '#065f46';

export default function ImprovementCard({ items, context }: ImprovementCardProps) {
  const head = improvementHeadline(items);
  if (!head) return null;
  const line = context ?? (items.length === 1 ? 'תרגיל אחד השתפר' : `${items.length} תרגילים השתפרו`);
  return (
    <div className="rounded-[22px] bg-[#ecfdf5] p-3.5" style={{ boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.28)' }}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]" style={{ background: GREEN }}>
          <TrendingUp size={21} strokeWidth={2.5} color="#fff" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-black" style={{ color: GREEN_TEXT }}>
            שיפור מהפעם הקודמת
          </div>
          <div className="mt-px truncate text-[12.5px] font-bold" style={{ color: GREEN_SUB }}>
            {line}
          </div>
        </div>
        <div className="shrink-0 text-center">
          <div dir="ltr" className="text-[26px] font-black leading-none tracking-[-0.03em]" style={{ color: GREEN_TEXT }}>
            {head.value}
          </div>
          <div className="mt-0.5 whitespace-nowrap text-[11px] font-extrabold" style={{ color: GREEN_SUB }}>
            {head.unit}
          </div>
        </div>
      </div>
      {items.map((it) => (
        <div
          key={it.key}
          className="mt-2 flex items-center gap-3 rounded-2xl bg-white p-2"
          style={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.28)' }}
        >
          <span className="grid h-11 w-11 shrink-0 overflow-hidden rounded-xl">
            <ExerciseThumb imageUrl={it.imageUrl} size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-extrabold text-v2-ink">{it.name}</div>
            <div className="mt-px truncate text-[12.5px] font-bold text-v2-muted">
              פעם קודמת{' '}
              <b dir="ltr" className="text-v2-ink-2">
                {it.previous}
              </b>{' '}
              · היום{' '}
              <b dir="ltr" style={{ color: GREEN_TEXT }}>
                {it.today}
              </b>
            </div>
          </div>
          <span
            className="inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#ecfdf5] px-2.5 text-[13px] font-black"
            style={{ color: GREEN_TEXT }}
          >
            <TrendingUp size={14} strokeWidth={2.6} aria-hidden />
            {deltaLabel(it.delta, it.unit)}
          </span>
        </div>
      ))}
    </div>
  );
}
