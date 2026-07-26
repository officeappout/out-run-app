/**
 * Single source of truth for the floating route-card WIDTH.
 *
 * Shared by both bottom route surfaces so they stay locked to one size:
 *   - the aerobic RouteCarousel card (generated loop / commute routes)
 *   - the discover BottomJourneyContainer card (curated "גלה מסלולים" routes)
 *
 * Change the width in ONE place and both carousels move together — no drift
 * between the two route surfaces.
 *
 * The value is the width the RouteCarousel card has always used. `w-[85vw]`
 * fills most of a phone; `max-w-[340px]` caps it on tablet/desktop. The DOM-
 * based snap math in both carousels reads each card's real offsetWidth, so it
 * stays correct even where max-w clips.
 *
 * NOTE: the full literal class string must live here so Tailwind's JIT scanner
 * emits `w-[85vw]` / `max-w-[340px]` even though they're consumed via string
 * interpolation.
 */
export const ROUTE_CARD_WIDTH = 'w-[85vw] max-w-[340px]';
