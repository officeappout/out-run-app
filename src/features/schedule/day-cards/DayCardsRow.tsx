'use client';

/**
 * DayCardsRow: one day's cards side by side, scrolled sideways, with a fade on the inline-end edge
 * (boards WeekPlan / HomeToday). The first card sits at the inline-start edge.
 */
import type { ReactNode } from 'react';

export default function DayCardsRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="relative -mt-[5px] min-w-0 flex-1 overflow-hidden pt-[5px]">
      <div
        role={label ? 'group' : undefined}
        aria-label={label}
        className="-mt-[5px] flex gap-2 overflow-x-auto overscroll-x-contain pe-6 pt-[5px] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-0 w-7 from-white to-white/0 ltr:bg-gradient-to-l rtl:bg-gradient-to-r"
      />
    </div>
  );
}
