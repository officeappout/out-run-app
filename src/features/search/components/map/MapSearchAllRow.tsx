'use client';

import Link from 'next/link';
import { ChevronLeft, Search } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import { searchHref } from '../../core/url-state';

/** The bottom row of the map search: the same words in the whole app (unified search). */
export default function MapSearchAllRow({ query }: { query: string }) {
  const q = query.trim();
  return (
    <Link
      href={searchHref(q)}
      className="mt-3 flex items-center gap-3 rounded-[20px] bg-white px-3 py-3 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.98]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: BRAND_GRADIENT }} aria-hidden>
        <Search size={17} strokeWidth={2.4} className="text-v2-on-cta" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-black text-v2-ink">{q ? `״${q}״ בכל האפליקציה` : 'מחפש תרגיל, קבוצה או מאמר?'}</span>
        <span className="truncate text-[12px] font-bold text-v2-muted">{q ? 'קבוצות, אירועים ומאמרים' : 'לחיפוש בכל האפליקציה'}</span>
      </span>
      <ChevronLeft size={16} className="shrink-0 text-v2-muted" aria-hidden />
    </Link>
  );
}
