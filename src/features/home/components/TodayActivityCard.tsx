'use client';

/**
 * TodayActivityCard — Stage D+E (19.08.2026, "completion-loop" plan).
 *
 * One card per distinct category done today (strength/cardio/maintenance).
 * Structurally modeled on HeroWorkoutCard's celebration-mode JSX (the
 * component this strip replaces — see TodayActivityStrip's own doc comment)
 * but deliberately trimmed for a compact, multi-card scrolling strip: no
 * separate CTA (that lives once at the strip level, not per-card) and a
 * single duration line instead of a 3-row stats block.
 *
 * Fill color is category-aware (CATEGORY_COLORS from day-display.utils —
 * the same canonical brand-color source AgendaDayCard's own local
 * CATEGORY_ACCENT mirrors) rather than a single hardcoded hex. This
 * deliberately resolves a real inconsistency Stage C's adversarial review
 * surfaced but didn't need to fix at the time: AgendaDayCard's completed
 * fill is a fixed green (#1D9E75) and HeroWorkoutCard's is a fixed brand
 * cyan (#00BAF7), neither category-aware. Since this is a brand-new
 * component (not literally reusing either), and a strip can realistically
 * show a strength card next to a cardio card side by side, using the real
 * per-category color is the more correct resolution, not a coin flip.
 */

import React from 'react';
import { Check, Clock, Flag } from 'lucide-react';
import { CATEGORY_COLORS } from '@/features/home/utils/day-display.utils';
import type { ActivityCategory } from '@/features/activity/types/activity.types';

export interface TodayActivityCardData {
  key: string;
  category: ActivityCategory;
  title: string;
  minutes: number;
  thumbnailUrl?: string;
  streak: number;
  /**
   * F2.3 (19.08.2026, adversarial review — must-fix): the REAL category to
   * match against a saved workout doc when resolving a tap, distinct from
   * `category` above. `category` is display-only and can't hold 'hybrid'
   * (ActivityCategory = 'strength'|'cardio'|'maintenance'), but a real
   * hybrid workout's Firestore doc has category:'hybrid' — for the one
   * card type where `category` is a styling choice rather than a fact
   * (home/page.tsx's Safety Net 2, a hybrid completion under the 10-min
   * floor in every category), matching on `category` would compare
   * 'strength' against a real doc's 'hybrid' and never find it. Usually
   * equal to `category`; differs only for that one fallback case.
   */
  matchCategory: ActivityCategory | 'hybrid';
}

export default function TodayActivityCard({
  category,
  title,
  minutes,
  thumbnailUrl,
  streak,
}: TodayActivityCardData) {
  const color = CATEGORY_COLORS[category];

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col"
      dir="rtl"
      style={{ borderRadius: 16, background: color, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
    >
      {/* Header row: checkmark + success text — white-on-color, matching Stage
          C's HeroWorkoutCard/AgendaDayCard inversion pattern for solid fills.
          Deliberately category-agnostic text (matches the old HeroWorkoutCard
          celebration header exactly) — the specific activity is already
          conveyed by the title/color/icon below. A category-specific header
          ("אימון כוח בוצע בהצלחה!") would misrepresent a genuine hybrid
          completion whenever page.tsx's safety-net fallback picks a display
          category for styling purposes only (adversarial review, 19.08.2026). */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
          <Check size={16} className="stroke-[3]" style={{ color }} />
        </div>
        <span className="text-[15px] font-bold text-white truncate">האימון בוצע בהצלחה!</span>
      </div>

      {/* Body: thumbnail (right in RTL) + info box (left in RTL). Thumbnail only
          when a real one exists — currently never true in production (see
          TodayActivityStrip's doc comment), forward-compatible, no visual gap
          when absent (info box grows to fill via flex-1). */}
      <div className="flex items-stretch px-4 pb-4 gap-3 flex-1">
        {thumbnailUrl && (
          <div className="w-[90px] flex-shrink-0 overflow-hidden" style={{ borderRadius: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover"
              style={{ minHeight: 90 }}
            />
          </div>
        )}

        {/* Info box — category-tinted (not a hardcoded cyan tint) so it reads
            correctly against any of the 3 possible outer fill colors. */}
        <div
          className="flex-1 flex flex-col justify-center items-center gap-2 py-3 px-3 text-center min-w-0"
          style={{ borderRadius: 12, border: `1px solid ${color}40`, background: `${color}12` }}
        >
          <span className="text-[14px] font-bold text-gray-900 truncate w-full">{title}</span>
          <div className="flex items-center gap-1 text-[13px] text-gray-700">
            <Clock size={14} className="text-gray-500" />
            <span>{minutes} דק&apos;</span>
          </div>
          <div className="flex items-center gap-1 text-[13px] text-gray-700">
            <Flag size={14} className="text-gray-500" />
            <span>{streak} אימונים ברצף</span>
          </div>
        </div>
      </div>
    </div>
  );
}
