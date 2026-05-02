'use client';

/**
 * ActivityCarousel — floating horizontal carousel for free-run activity selection.
 *
 * Replaces the previous in-drawer activity-pill row. Sits OVER the map (no
 * full-screen scrim) so the user can still see and pan the world behind the
 * cards, mirroring the BottomJourneyContainer / RoutePreviewCard pattern.
 *
 * Z-index: z-[60] — same tier as WorkoutDrawer / RoutePreviewCard per the
 * z-index budget in .cursorrules. This is the "must complete" step before
 * the user enters the FreeRunDrawer config stage.
 *
 * Flow:
 *   mount → user swipes through 3 cards (Running / Walking / Cycling)
 *        → tap a card  → onSelect(activity) → parent advances to config stage
 *        → tap close X → onClose() → parent exits free-run mode
 *
 * Layout matches BottomJourneyContainer's premium carousel:
 *   - dir="ltr" outer for positive scrollLeft math, flex-row-reverse so
 *     the first activity (Running) lands on the right (RTL UX).
 *   - 78vw cards, snap-x snap-mandatory, scrollbar-hide.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Bike, Footprints, X, ChevronLeft } from 'lucide-react';
import type { ActivityType } from '../types/route.types';

const ACCENT = '#00ADEF';

type CarouselActivity = Extract<ActivityType, 'running' | 'walking' | 'cycling'>;

interface ActivityCard {
  id: CarouselActivity;
  title: string;
  subtitle: string;
  emoji: string;
  Icon: React.ElementType;
  /** tailwind from→to gradient classes for the icon halo */
  gradient: string;
  /** rgba shadow tint that matches the gradient base */
  shadowTint: string;
}

const ACTIVITIES: ActivityCard[] = [
  {
    id: 'running',
    title: 'ריצה',
    subtitle: 'דחוף את הקצב והרגש את הלב',
    emoji: '🏃',
    Icon: Activity,
    gradient: 'from-orange-400 to-rose-500',
    shadowTint: '0 12px 28px rgba(244, 63, 94, 0.32)',
  },
  {
    id: 'walking',
    title: 'הליכה',
    subtitle: 'התחל בקלילות, התקדם בכיף',
    emoji: '🚶',
    Icon: Footprints,
    gradient: 'from-cyan-400 to-blue-500',
    shadowTint: '0 12px 28px rgba(14, 165, 233, 0.32)',
  },
  {
    id: 'cycling',
    title: 'רכיבה',
    subtitle: 'מרחקים ארוכים בקלות',
    emoji: '🚴',
    Icon: Bike,
    gradient: 'from-violet-400 to-fuchsia-500',
    shadowTint: '0 12px 28px rgba(168, 85, 247, 0.32)',
  },
];

interface ActivityCarouselProps {
  /** The currently-selected activity, used to highlight the matching card. */
  currentActivity?: ActivityType;
  /** Fired when the user taps a card. Parent should set activity AND advance. */
  onSelect: (activity: CarouselActivity) => void;
  /** Fired when the user taps the close affordance — exits free-run mode. */
  onClose: () => void;
}

export default function ActivityCarousel({
  currentActivity,
  onSelect,
  onClose,
}: ActivityCarouselProps) {
  const carouselRef = useRef<HTMLDivElement>(null);

  // Track which card is currently centered in the viewport so the dots
  // indicator can reflect scroll progress, not just the persisted activity.
  // Initialised from the user's saved activity (first paint highlights the
  // matching dot); afterwards driven by the scroll handler.
  const initialIndex =
    currentActivity && ACTIVITIES.findIndex((a) => a.id === currentActivity) >= 0
      ? ACTIVITIES.findIndex((a) => a.id === currentActivity)
      : 0;
  const [activeIndex, setActiveIndex] = useState<number>(initialIndex);

  // Inject scrollbar-hide style once (safe if BottomJourneyContainer also
  // injected it — same selector, identical body, idempotent at the CSSOM level).
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent =
      '.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // ── Initial scroll — centre the matching/first card on the RIGHT (RTL UX) ──
  // Outer container is dir="ltr" + flex-row-reverse so ACTIVITIES[0]
  // (running) is the rightmost DOM child. We read the matching card's
  // actual `offsetLeft` from the DOM and centre it — robust to the
  // `max-w-[300px]` clip that kicks in on tablet-sized viewports, where
  // a derived `containerWidth × 0.78` formula would over-shoot the snap
  // point and the carousel would land between cards. useLayoutEffect
  // prevents a left-to-right flash on first paint.
  useLayoutEffect(() => {
    const container = carouselRef.current;
    if (!container) return;
    const target = container.children[initialIndex] as HTMLElement | undefined;
    if (!target) return;
    container.scrollLeft =
      target.offsetLeft + target.offsetWidth / 2 - container.offsetWidth / 2;
    // Fire once on mount only — the user is free to swipe afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snap-to-active update on scroll. Reads each card's actual
  // `offsetLeft` and picks the one closest to the viewport's centre,
  // independent of any width-derivation formula. This is the same
  // approach used by RouteCarousel — see its file-header doc for the
  // full rationale on why the derived-formula approach drifted on
  // viewports where `max-w` was active.
  const handleScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) return;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closestIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });
    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }
  }, [activeIndex]);

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      dir="rtl"
      role="dialog"
      aria-label="בחירת סוג פעילות"
    >
      {/* ── Carousel — floating bottom strip ──
          Position mirrors BottomJourneyContainer: fixed bottom + safe-area
          padding so the cards clear the OS bottom inset and any tab bar.
          The whole free-run flow is closed by re-tapping the active
          "אירובי חופשי" pill in MapModeHeader, so we don't render a
          dedicated close X here — it would only duplicate that affordance
          and clash with the MapLayersControl icon at top-right. */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))',
        }}
      >
        {/* Title chip — narrow, centered, sits just above the cards.
            In-flow (NOT absolutely positioned) so it never collides with
            the search bar / mode pills / layers button at the top. */}
        <div className="flex justify-center pointer-events-none mb-2">
          <div
            className="pointer-events-auto bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-gray-100 px-3.5 py-1.5 flex items-center gap-2"
            dir="rtl"
          >
            <span className="text-[12px] font-black text-gray-800 leading-tight">
              בחר את סוג הפעילות
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="סגור"
            >
              <X size={11} className="text-gray-600" />
            </button>
          </div>
        </div>

        <div
          ref={carouselRef}
          dir="ltr"
          onScroll={handleScroll}
          className="w-full overflow-x-auto snap-x snap-mandatory flex flex-row-reverse gap-3 pb-3 pt-2 scrollbar-hide pointer-events-auto"
          style={{
            paddingInlineStart: '16px',
            paddingInlineEnd: '40px',
            scrollBehavior: 'smooth',
          }}
        >
          {ACTIVITIES.map((card) => {
            const isCurrent = currentActivity === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelect(card.id)}
                dir="rtl"
                // ── Compact mobile-first card sizing (refinement pass) ──
                // Field test flagged the old 78vw / 300px / w-24 halo
                // sizing as "huge on phones". Trimmed all dimensions
                // ~20-30% so 3 cards fit cleanly above the iOS home
                // indicator on a 375 pt iPhone SE without dwarfing
                // the rest of the chrome:
                //   - Card width  : 78vw / 300px → 68vw / 260px
                //   - Padding     : p-5          → p-4
                //   - Icon halo   : w-24 h-24    → w-16 h-16 (icon 44 → 30)
                //   - Title       : text-xl      → text-base
                //   - Subtitle    : text-[13px]  → text-[11px]
                //   - CTA         : py-3 text-sm → py-2.5 text-[13px]
                // Everything else (snap, scaling, focus ring) is kept
                // bit-identical so the scroll/snap math doesn't drift.
                className={`w-[68vw] max-w-[260px] snap-center snap-always flex-shrink-0 bg-white rounded-3xl p-4 text-start active:scale-[0.98] transition-all duration-300 ${
                  isCurrent
                    ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_12px_28px_rgba(0,0,0,0.16)] scale-[1.02]'
                    : 'shadow-[0_8px_22px_rgba(0,0,0,0.12)]'
                }`}
                aria-label={`${card.title} — ${card.subtitle}`}
              >
                {/* ── Icon halo — gradient disc with lucide icon + tiny
                    emoji "sticker" pinned to the corner for the playful
                    "game" vibe. Compact sizing per the refinement pass. */}
                <div className="flex items-center justify-center mb-3">
                  <div
                    className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${card.gradient} flex items-center justify-center`}
                    style={{ boxShadow: card.shadowTint }}
                  >
                    <card.Icon size={30} className="text-white" strokeWidth={2.2} />
                    <span
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center text-base shadow-md"
                      aria-hidden="true"
                    >
                      {card.emoji}
                    </span>
                  </div>
                </div>

                {/* ── Title + subtitle ─────────────────────────────────── */}
                <h3 className="text-base font-black text-gray-900 text-center leading-tight">
                  {card.title}
                </h3>
                <p className="text-[11px] text-gray-500 text-center mt-0.5 mb-3 leading-snug">
                  {card.subtitle}
                </p>

                {/* ── Select CTA — same shape as the route-card CTA ───── */}
                <div
                  className="w-full text-center py-2.5 rounded-xl text-white text-[13px] font-black flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: ACCENT }}
                >
                  בחר
                  <ChevronLeft size={13} strokeWidth={3} />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Page indicator dots — driven by scroll position ───────────
            Mirrors the visual order of the cards (running rightmost in RTL):
            we render the dots in reverse-DOM order so the rightmost dot
            corresponds to ACTIVITIES[0]. */}
        <div className="flex justify-center items-center gap-1.5 pt-1 pointer-events-none">
          {[...ACTIVITIES].reverse().map((card) => {
            const idx = ACTIVITIES.findIndex((a) => a.id === card.id);
            const isActive = idx === activeIndex;
            return (
              <span
                key={card.id}
                className={`block rounded-full transition-all ${
                  isActive ? 'bg-white' : 'bg-white/55'
                }`}
                style={{
                  width: isActive ? 18 : 6,
                  height: 6,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
