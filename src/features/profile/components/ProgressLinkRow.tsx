'use client';

/**
 * Profile v2 (enable_home_v2): programs, weekly/monthly stats and the
 * activity charts moved to the "התקדמות" tab — this row points there.
 */
import Link from 'next/link';
import { BarChart3, ChevronLeft } from 'lucide-react';

export default function ProgressLinkRow() {
  return (
    <Link
      href="/progression"
      className="flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
        <BarChart3 className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">ההתקדמות שלי</span>
        <span className="block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">סיכום שבוע וחודש, ריצה, הליכה, צעדים, כוח ותוכניות</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
    </Link>
  );
}
