'use client';

/** "שומר…" → "נשמר" — the background write's status (hidden when there is nothing to save). */
import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export type SaveState = 'saving' | 'saved' | 'hidden';

export default function SaveStatusPill({ state }: { state: SaveState }) {
  const t = useT(player);
  if (state === 'hidden') return <span className="w-[72px]" aria-hidden="true" />;
  const saved = state === 'saved';
  return (
    <span
      role="status"
      aria-live="polite"
      className={`h-[30px] px-[11px] rounded-full text-[12.5px] font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-200 ${
        saved
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
      }`}
    >
      {saved ? (
        <Check className="w-[13px] h-[13px]" strokeWidth={3} aria-hidden="true" />
      ) : (
        <Loader2 className="w-[13px] h-[13px] animate-spin motion-reduce:animate-none" strokeWidth={3} aria-hidden="true" />
      )}
      {t(saved ? 'levelup.save.saved' : 'levelup.save.saving')}
    </span>
  );
}
