'use client';

/**
 * TodayActivityCard — compact redesign (21.08.2026, "ארכיטקטורת הבית
 * ומנוע-ההמלצות" doc — top-of-page carousel, replaces the old tall hero
 * layout below the tabbed stats section).
 *
 * Visual pattern from a David-approved mockup (QuickDraft.dc.html, read
 * directly from its source before building this): solid CATEGORY_COLORS
 * fill, translucent-white checkmark badge, single info column. The
 * mockup's own secondary line shows an XP figure — deliberately omitted
 * here: TodayActivityCardData/todayActivityCards (home/page.tsx) carry
 * no xp field today, confirmed before building this, and David chose to
 * ship without one rather than wire a new data source for this pass.
 * `streak` stays in the interface (no interface changes) but isn't
 * rendered — no room in a compact row, and not part of the mockup.
 *
 * TODAY_ACTIVITY_CARD_HEIGHT is exported and consumed by
 * TodayActivityStrip's own cardHeight, so the two stay byte-identical by
 * construction rather than two numbers hoping to agree — SuggestionCarousel's
 * layout/animation breaks if the card's real rendered height and the
 * slot height it's told to expect ever drift apart.
 */

import React from 'react';
import { Check } from 'lucide-react';
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

export const TODAY_ACTIVITY_CARD_HEIGHT = 80;

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: 'כוח',
  cardio: 'אירובי',
  maintenance: 'גמישות',
};

export default function TodayActivityCard({
  category,
  title,
  minutes,
}: TodayActivityCardData) {
  const color = CATEGORY_COLORS[category];
  // `title` sometimes already carries an "אימון " prefix (home/page.tsx's
  // category-label fallback, e.g. "אימון כוח") and sometimes doesn't (a
  // real workout title like "כל הגוף") — strip it so the template below
  // never doubles up into "אימון אימון כוח בוצע".
  const label = title.replace(/^אימון\s+/, '');

  return (
    <div
      className="w-full h-full flex items-center gap-3 overflow-hidden"
      dir="rtl"
      style={{
        borderRadius: 18,
        background: color,
        padding: '0 16px',
        boxShadow: `0 3px 10px ${color}47`,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.24)' }}
      >
        <Check size={21} strokeWidth={2.4} color="#FFFFFF" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-[15.5px] font-extrabold text-white truncate">
          אימון {label} בוצע
        </span>
        <span
          className="block text-[12.5px] font-semibold truncate mt-0.5"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          {minutes} דק&apos; · {CATEGORY_LABEL[category]}
        </span>
      </div>
    </div>
  );
}
