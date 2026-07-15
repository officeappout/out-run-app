/**
 * Single source of truth for the floating route-card WIDTH.
 *
 * Shared by all bottom route surfaces so they stay locked to one size:
 *   - RouteCarousel (aerobic), BottomJourneyContainer (discover), and the
 *     HybridSlotCarousel slot card.
 *
 * The value is the width the RouteCarousel card has always used. `w-[85vw]`
 * fills most of a phone; `max-w-[340px]` caps it on tablet/desktop.
 *
 * NOTE: the full literal class string must live here so Tailwind's JIT scanner
 * emits `w-[85vw]` / `max-w-[340px]` even when consumed via interpolation.
 *
 * Mirrors constants/routeCardSize.ts on the fix/route-card-park-style branch.
 */
export const ROUTE_CARD_WIDTH = 'w-[85vw] max-w-[340px]';
