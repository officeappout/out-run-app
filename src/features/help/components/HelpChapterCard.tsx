'use client';

import React from 'react';
import { Play } from 'lucide-react';
import type { HelpChapter } from '@/lib/app-help/chapters';

/** A help-hub chapter: title, one line, and "תראה לי" when it has a tour or a screen to open. */
export default function HelpChapterCard({ chapter, onShow, onSelect, selected }: {
  chapter: HelpChapter;
  onShow?: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(14,27,42,0.06)] ${selected ? 'ring-2 ring-v2-accent' : ''}`}
    >
      <button type="button" onClick={onSelect} className="text-right">
        <span className="block text-[14.5px] font-black text-v2-ink">{chapter.title}</span>
        <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-v2-muted">{chapter.blurb}</span>
      </button>
      {onShow && (
        <button
          type="button"
          onClick={onShow}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-v2-tint text-[12.5px] font-extrabold text-v2-deep active:scale-[0.97]"
        >
          <Play size={12} strokeWidth={2.6} className="fill-current" aria-hidden />
          {chapter.tour ? 'תראה לי' : 'פתח'}
        </button>
      )}
    </div>
  );
}
