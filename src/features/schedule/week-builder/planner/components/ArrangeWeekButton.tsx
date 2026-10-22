'use client';

/** "סידור השבוע" on a planner week label (enable_week_builder_v1, phase 2). */
import { CalendarCog } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';

export default function ArrangeWeekButton({ onPress, range }: { onPress: () => void; range: string }) {
  const t = useT(schedule);
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={t('planner.arrangeAria', { range })}
      className="ms-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <CalendarCog size={14} strokeWidth={2.4} aria-hidden />
      {t('planner.arrange')}
    </button>
  );
}
