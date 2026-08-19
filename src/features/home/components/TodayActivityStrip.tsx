'use client';

/**
 * TodayActivityStrip — Stage D+E (19.08.2026, "completion-loop" plan).
 *
 * REPLACES HeroWorkoutCard's celebration-mode card entirely — a locked
 * product decision (documented in adaptive-snacking-valiant.md's Stage
 * C/D section): the strip doesn't render alongside the old completion
 * card, it IS the completion card now, generalized to N sessions.
 *
 * N=1 vs N>=2 is handled by SuggestionCarousel itself, not hand-rolled
 * here — confirmed by reading its source before building this: for
 * items.length<=1 it already renders a plain centered static card with
 * zero scroll/drag/dot chrome (SuggestionCarousel.tsx:120-128), which is
 * exactly what the plan's "N=1 → כרטיס סטטי במרכז בלי גלילה" describes.
 * For N>=2 it provides real horizontal scroll + pager dots built in, no
 * extra work needed here.
 *
 * Header ("הפעילות שלי היום") lives here, not as a separate stage/mount
 * condition — per the plan's own note, its visibility IS the strip's own
 * mount condition (this component returns null when there's nothing to
 * show — the caller doesn't need a second check for the empty/rest-day
 * case; see the doc comment at the call site in home/page.tsx for the
 * card-list construction, which is empty on a rest day by design).
 *
 * The CTA ("תציעו לי עוד אימון") lives here once, below the whole strip —
 * not per-card. Its action ("suggest me something else") is about the
 * overall post-workout moment, not any one specific session card.
 */

import React from 'react';
import { SuggestionCarousel } from '@/features/workout-engine/core/components/SuggestionCarousel';
import TodayActivityCard, { type TodayActivityCardData } from './TodayActivityCard';

// Checkmark row (~40px) + thumbnail-or-info-box row (~130px incl. padding).
// Not device-verified — a reasonable estimate; visual check on-device
// recommended before this ships, per this project's UI verification rules.
const CARD_HEIGHT = 220;

export interface TodayActivityStripProps {
  cards: TodayActivityCardData[];
  /** Same "תציעו לי עוד אימון" CTA the old completion card had — undefined hides it. */
  onRequestMore?: () => void;
}

export default function TodayActivityStrip({ cards, onRequestMore }: TodayActivityStripProps) {
  if (cards.length === 0) return null;

  return (
    <div className="w-full" dir="rtl">
      <h3 className="text-right text-[16px] font-bold text-gray-900 mb-3">הפעילות שלי היום</h3>

      <SuggestionCarousel<TodayActivityCardData>
        items={cards}
        keyExtractor={(c) => c.key}
        cardHeight={CARD_HEIGHT}
        renderCard={(c) => <TodayActivityCard {...c} />}
      />

      {onRequestMore && (
        <button
          onClick={onRequestMore}
          className="w-full mt-3 text-white font-extrabold rounded-full shadow-lg shadow-cyan-400/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(to left, #0CF2E3, #00BAF7)',
            height: 48,
            fontSize: 16,
          }}
        >
          <span>אני על הגל, תציעו לי עוד אימון!</span>
        </button>
      )}
    </div>
  );
}
