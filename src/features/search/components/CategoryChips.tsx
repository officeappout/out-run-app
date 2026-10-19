'use client';

import { BRAND_GRADIENT } from '@/components/ui/v2';
import { CATEGORY_LABEL, SEARCH_CATEGORIES, type SearchCategory } from '../core/types';

interface Props {
  value: SearchCategory;
  onChange: (c: SearchCategory) => void;
  /** Shown as "תרגילים · 8" while there is a query; null = no counts. */
  counts: Record<SearchCategory, number> | null;
}

/** הכל · תרגילים · גינות · מסלולים · אנשים וקבוצות · אירועים · מאמרים · עזרה */
export default function CategoryChips({ value, onChange, counts }: Props) {
  return (
    <div
      role="tablist"
      aria-label="סוג תוצאה"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SEARCH_CATEGORIES.map((c) => {
        const on = c === value;
        const n = counts?.[c];
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c)}
            className="h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[14px] font-bold transition-transform duration-150 ease-v2 active:scale-[0.97]"
            style={on ? { background: BRAND_GRADIENT, color: '#04222b' } : { background: '#ffffff', color: '#4b5563', border: '1px solid #e5e7eb' }}
          >
            {CATEGORY_LABEL[c]}
            {counts && typeof n === 'number' && (c === 'all' || n > 0) ? <span className="tabular-nums"> · {n}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
