'use client';

/**
 * The progress tab's week (owner 20.10.2026): THE home week strip —
 * SmartWeeklySchedule v2 with the same props mapping as home
 * (useWeekStripProps → strip-schedule.ts), so the day rings, flames, the
 * streak capsule, alternating icons on multi-activity days and the walk amber
 * are identical and in sync. Only the strip's own header is hidden; this one
 * says how many days were active and links the streak to "התמדה" (P-7).
 */
import { ChevronLeft, Flame } from 'lucide-react';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import { useWeekStripProps } from '@/features/home/hooks/useWeekStripProps';

export interface ProgressWeekStripProps {
  activeDays: number;
  currentStreak: number;
  /** Scroll to the התמדה card. */
  onOpenConsistency?: () => void;
}

export default function ProgressWeekStrip({ activeDays, currentStreak, onOpenConsistency }: ProgressWeekStripProps) {
  const { props } = useWeekStripProps();
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{activeDays} ימי פעילות השבוע</span>
        {currentStreak > 0 && (
          <button
            type="button"
            onClick={onOpenConsistency}
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Flame className="h-4 w-4" aria-hidden />
            רצף {currentStreak} ימים
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {/* Always the real week (a user without a schedule still sees what they did). */}
      <SmartWeeklySchedule {...props} calendarMode="week" hideMonthToggle hideHeader hasSchedule />
    </section>
  );
}
