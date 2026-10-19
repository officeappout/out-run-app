'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BrandCard } from '@/components/ui/v2';
import Highlight from '../Highlight';

/** A question that opens in place (FAQ / help) — a real disclosure button with aria-expanded. */
export default function QaRow({ q, a, query, defaultOpen = false }: { q: string; a: string[]; query?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <BrandCard radius={16} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 p-3 text-start"
      >
        <span className="flex-1 text-[14px] font-bold text-[#171717]"><Highlight text={q} query={query} /></span>
        <ChevronDown size={16} className={`shrink-0 text-[#9ca3af] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2 px-3 pb-3 text-[13.5px] leading-[1.55] text-[#334155]">
          {a.map((p, i) => <p key={i} className="m-0">{p}</p>)}
        </div>
      )}
    </BrandCard>
  );
}
