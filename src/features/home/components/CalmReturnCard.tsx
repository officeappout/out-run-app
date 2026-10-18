'use client';

/**
 * CalmReturnCard — the ONE quiet card a returning user sees (CALM_RETURN_V1), on the first
 * app open after 7+ days away: "שבוע חדש מתחיל היום". Inline in the home flow (never a
 * modal), no day count, no "missed" wording. 28+ days adds an optional level-check link;
 * nothing ever routes there on its own. Copy: src/lib/calm-return/surface.ts.
 */
import React from 'react';
import { X } from 'lucide-react';
import { calmCopy, type CalmGender } from '@/lib/calm-return/surface';

const CARD_STYLE = { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

export default function CalmReturnCard({
  gender,
  showLevelCheckLink,
  onLevelCheck,
  onDismiss,
}: {
  gender: CalmGender;
  showLevelCheckLink: boolean;
  onLevelCheck?: () => void;
  onDismiss: () => void;
}) {
  const copy = calmCopy(gender);
  return (
    <div
      className="relative w-full max-w-[358px] mx-auto bg-white dark:bg-[#1E2A28] rounded-2xl px-5 py-4"
      style={CARD_STYLE}
      dir="rtl"
      role="status"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירה"
        className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:text-gray-500"
      >
        <X size={16} />
      </button>
      <p className="text-base font-extrabold text-gray-900 dark:text-white pl-8">{copy.freshWeekTitle}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{copy.freshWeekBody}</p>
      {showLevelCheckLink && onLevelCheck && (
        <button
          type="button"
          onClick={onLevelCheck}
          className="mt-2 text-sm font-bold text-[#00AEEF] underline underline-offset-2"
        >
          {copy.levelCheckLink}
        </button>
      )}
    </div>
  );
}
