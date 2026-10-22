'use client';

/**
 * "פספסת X — לסדר מחדש את השאר?" (enable_week_builder_v1, phase 2) — a small card on the
 * planner while the current week has missed sessions that can still move. Tapping it opens the
 * week builder with the engine's re-plan; nothing saves from here.
 */
import { RotateCcw } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';

export interface MissedWeekCardProps {
  count: number;
  onReplan: () => void;
}

export default function MissedWeekCard({ count, onReplan }: MissedWeekCardProps) {
  const t = useT(schedule);
  if (count <= 0) return null;
  return (
    <div dir="rtl" className="mx-4 mt-3 flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 font-simpler text-v2-ink shadow-v2-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-700">
        <RotateCcw size={16} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[14.5px] font-extrabold">
          {count === 1 ? t('planner.missed.one') : t('planner.missed.many', { n: String(count) })}
        </span>
        <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{t('planner.missed.question')}</span>
      </span>
      <button
        type="button"
        onClick={onReplan}
        className="h-10 shrink-0 whitespace-nowrap rounded-full bg-v2-ink px-4 text-[13.5px] font-extrabold text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        {t('planner.missed.cta')}
      </button>
    </div>
  );
}
