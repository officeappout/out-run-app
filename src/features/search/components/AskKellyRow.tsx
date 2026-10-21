'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

export const askKellyHref = (q?: string) => (q ? `/ai-coach?q=${encodeURIComponent(q.slice(0, 200))}` : '/ai-coach');

/** The dark "שאל את קלי" row (Main / Results boards). */
export default function AskKellyRow({ query }: { query?: string }) {
  const t = useT(library);
  return (
    <Link
      href={askKellyHref(query)}
      className="flex items-center gap-2.5 rounded-2xl bg-[#04222b] px-3.5 py-3 text-white transition-transform duration-150 ease-v2 active:scale-[0.98]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] font-bold text-[#04222b]" style={{ background: BRAND_GRADIENT }} aria-hidden>{t('search.kelly.initial')}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        {query ? (
          <span className="truncate text-[14px] font-bold">{t('search.kelly.askQuery', { query })}</span>
        ) : (
          <>
            <span className="text-[14px] font-bold">{t('search.kelly.notFound')}</span>
            <span className="text-[12px] text-[#bae6fd]">{t('search.kelly.knowsYou')}</span>
          </>
        )}
      </span>
      <ChevronLeft size={16} strokeWidth={2} aria-hidden />
    </Link>
  );
}
