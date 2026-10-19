'use client';

/**
 * Kelly phase 2 — quick replies (first open, and 2-3 follow-ups under Kelly's newest reply).
 * A chip sends its message to Kelly, or ("להתחיל") opens the newest workout card.
 */
import React from 'react';
import type { SuggestionChip } from '@/lib/ai/coach/suggestions/types';

export default function AiCoachSuggestionChips({
  chips,
  onSend,
  onOpenCard,
  disabled,
  className = '',
}: {
  chips: SuggestionChip[];
  onSend: (message: string) => void;
  onOpenCard?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const shown = chips.filter((c) => !c.openCard || !!onOpenCard);
  if (shown.length === 0) return null;
  return (
    <div className={`flex gap-2 overflow-x-auto ${className}`}>
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled && !c.openCard}
          onClick={() => (c.openCard ? onOpenCard?.() : onSend(c.message ?? c.label))}
          className="shrink-0 rounded-full border border-cyan-200 bg-white px-3.5 py-2 text-[13px] font-bold text-cyan-700 shadow-sm transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
