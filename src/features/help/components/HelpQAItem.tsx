'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HelpQA } from '@/lib/app-help/types';

/** One question with its answer, collapsed by default. */
export default function HelpQAItem({ entry, defaultOpen = false }: { entry: HelpQA; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-right"
      >
        <span className="flex-1 text-[14.5px] font-bold text-v2-ink">{entry.q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-v2-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4 text-[13.5px] leading-relaxed text-v2-ink-2">
          {entry.a.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
