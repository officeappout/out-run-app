'use client';

/** WideNextUp — the next-up card at the bottom of the wide side panel. */

import React from 'react';
import { ExerciseThumb } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface WideNextUpProps {
  name: string;
  /** Reps / duration line. */
  caption?: string | null;
  imageUrl?: string | null;
}

export default function WideNextUp({ name, caption = null, imageUrl = null }: WideNextUpProps) {
  const t = useT(player);
  if (!name) return null;
  return (
    <div data-wide-next="" className="mt-3 flex items-center gap-3 rounded-2xl bg-v2-surface px-3 py-2.5 ring-1 ring-inset ring-v2-hairline">
      <div className="shrink-0 overflow-hidden rounded-[12px]">
        <ExerciseThumb imageUrl={imageUrl ?? undefined} size={52} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="whitespace-nowrap text-[14px] font-extrabold text-v2-deep">{t('wide.nextUp')}</div>
        <div className="truncate text-[18px] font-black text-v2-ink">{name}</div>
        {caption && <div className="truncate text-[14px] font-bold text-v2-muted">{caption}</div>}
      </div>
    </div>
  );
}
