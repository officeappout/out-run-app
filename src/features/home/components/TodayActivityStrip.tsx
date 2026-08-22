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
 * The "תציעו לי עוד אימון" CTA that used to sit below the strip was
 * removed (21.08.2026, "ארכיטקטורת הבית" doc redesign) — David: it was a
 * temporary mechanism, now redundant with the real post-workout
 * suggestions carousel ("המשך הפעילות של היום") that already renders
 * separately, below this strip's new top-of-page position. Its handler,
 * home/page.tsx's handleRequestMore, also owned the post-workout-carousel
 * stall/timeout escape hatch (postWorkoutCarouselTimedOut) — removed
 * along with it, since that was its only remaining call site. See that
 * removal's own commit message for the tradeoff this drops.
 */

import React from 'react';
import { SuggestionCarousel } from '@/features/workout-engine/core/components/SuggestionCarousel';
import TodayActivityCard, { TODAY_ACTIVITY_CARD_HEIGHT, type TodayActivityCardData } from './TodayActivityCard';

export interface TodayActivityStripProps {
  cards: TodayActivityCardData[];
  /**
   * F2.3 (19.08.2026, "unified workout summary" plan) — tap a card to open
   * its workout's summary. Wrapped here (not inside TodayActivityCard
   * itself, which stays a pure display component).
   *
   * Gated on SuggestionCarousel's own `isActive` param (adversarial review,
   * 19.08.2026 — the FIRST version of this comment claimed the outer
   * carousel's `!isActive && handleSelect(i)` onClick alone was enough to
   * prevent a race, but that's wrong: renderCard's own isActive argument
   * was being silently discarded here, so a tap on ANY card — including a
   * partially-visible, non-centered side card, N>=2 only — fired
   * navigation immediately, before the user had even brought it into
   * focus. Explicitly checking `isActive` here restores the intended
   * two-tap sequence: first tap on a side card focuses it (via the
   * carousel's own onClick), a second tap (now active) opens it. For N=1
   * (SuggestionCarousel's static single-card path) isActive is always
   * `true` — confirmed by reading its source — so this is a no-op change
   * for the single-card case, which is the common one.
   */
  onCardTap?: (card: TodayActivityCardData) => void;
}

export default function TodayActivityStrip({ cards, onCardTap }: TodayActivityStripProps) {
  if (cards.length === 0) return null;

  return (
    <div className="w-full" dir="rtl">
      <h3 className="text-right text-[16px] font-bold text-gray-900 mb-3">הפעילות שלי היום</h3>

      <SuggestionCarousel<TodayActivityCardData>
        items={cards}
        keyExtractor={(c) => c.key}
        cardHeight={TODAY_ACTIVITY_CARD_HEIGHT}
        renderCard={(c, isActive) =>
          onCardTap ? (
            <button
              type="button"
              onClick={() => isActive && onCardTap(c)}
              className="w-full h-full block text-right bg-transparent border-0 p-0 m-0 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <TodayActivityCard {...c} />
            </button>
          ) : (
            <TodayActivityCard {...c} />
          )
        }
      />
    </div>
  );
}
