'use client';

import { Target } from 'lucide-react';

/**
 * "קרובים לסף" (04.10.2026, §13.85) — a clickable summary strip, not a
 * fourth grid card: inserting it into the existing OverallReadinessCard/
 * ComponentReadinessCard grid would disturb that grid's own column-count
 * math (sized purely off component count) for no real benefit. Rendered
 * as its own banner directly above the table it filters, on both the
 * brigade dashboard (filters by unit) and the unit-detail screen
 * (filters by soldier) — same control, same visual language, two
 * different tables underneath it.
 */
interface NearThresholdCardProps {
  count: number;
  active: boolean;
  onClick: () => void;
}

export default function NearThresholdCard({ count, active, onClick }: NearThresholdCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 text-right transition-all ${
        active ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-100 shadow-sm hover:border-amber-200'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Target size={18} className={active ? 'text-amber-600' : 'text-amber-500'} />
        <span className="text-sm font-black text-gray-900">קרובים לסף</span>
        <span className="text-[11px] text-gray-400">מרכיב אחד או יותר קרוב להצלחה — לא תחזית, רק מרחק אמיתי מהסף</span>
      </span>
      <span className={`text-lg font-black ${active ? 'text-amber-700' : 'text-gray-800'}`}>{count}</span>
    </button>
  );
}
