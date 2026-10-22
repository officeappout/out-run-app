'use client';

/**
 * "שבוע עמוס? נסדר לך את שאר השבוע" (enable_week_builder_v1; owner 22.10) — a calm offer on the
 * planner while the current week has sessions that did not happen and can still move. Never a
 * count, never "פספסת". Tapping it opens the week builder with the engine's suggestion; nothing
 * saves from here.
 */
import { CalendarClock } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';

export interface CalmArrangeCardProps {
  show: boolean;
  onArrange: () => void;
}

export default function CalmArrangeCard({ show, onArrange }: CalmArrangeCardProps) {
  const t = useT(schedule);
  if (!show) return null;
  return (
    <div dir="rtl" className="mx-4 mt-3 flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 font-simpler text-v2-ink shadow-v2-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep">
        <CalendarClock size={16} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[14.5px] font-extrabold">{t('planner.calm.title')}</span>
        <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{t('planner.calm.body')}</span>
      </span>
      <button
        type="button"
        onClick={onArrange}
        className="h-10 shrink-0 whitespace-nowrap rounded-full bg-v2-ink px-4 text-[13.5px] font-extrabold text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        {t('planner.calm.cta')}
      </button>
    </div>
  );
}
