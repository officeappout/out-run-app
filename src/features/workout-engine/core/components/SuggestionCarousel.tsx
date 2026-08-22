'use client';

/**
 * SuggestionCarousel — the shared, surface-neutral shell for rendering a ranked
 * Suggestion[] as 1-3 swipeable cards (home-generator-v2 plan, step 5).
 *
 * Deliberately a FRESH build, not a migration of either existing hand-rolled carousel —
 * WorkoutSelectionCarousel (home) is flag-dormant today (HOME_ANCHOR_V2_ENABLED routes
 * around it) and HybridSlotCarousel (map) is live but map-specific (armed/settle tap
 * disambiguation, duration chips) — neither needed unifying for THIS build (David,
 * 16.08.2026: the real live aerobic card on home, StatsOverview's stepDeficitRoute, already
 * renders the same RouteCardUnified the map uses — card-content sharing already exists;
 * there was never a second competing carousel SHELL problem to solve here). This shell's
 * drag/spring/pagination mechanics mirror both existing implementations' proven pattern
 * (measured card width, spring track position, ±40px drag-end threshold, center-scaled
 * active card) purely for visual consistency with the rest of the app — no import from
 * either feature, so this stays genuinely surface-neutral (CLAUDE.md's domain-agnostic
 * rule: src/features/{domain}/ is self-contained).
 *
 * "Middle/first = recommended" (unlike both existing implementations, which default to a
 * hardcoded index): callers pass `items` already ranked by rankSuggestions — item 0 is the
 * top-ranked suggestion — and this shell defaults activeIndex to 0, not 1.
 *
 * N=1 (e.g. only the safety-net generator was eligible) renders a single static centered
 * card — no drag/pagination chrome for a lone item, matching the instinct already proven by
 * the home step-deficit card's own single-card rendering.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { motion, type PanInfo } from 'framer-motion';

const CARD_MAX_W = 260;
const CARD_VW = 68;
const GAP = 12;
const ACTIVE_SCALE = 1.05;
const SIDE_SCALE = 0.92;
const DRAG_THRESHOLD_PX = 40;
/** Mirrors HybridSlotCarousel's proven preview-on-settle timing (map, live) — a fast swipe
 *  through several cards only fires onSettle once, on the one it actually rests on. */
const SETTLE_DELAY_MS = 300;
const SPRING_TRACK = { type: 'spring', stiffness: 300, damping: 30 } as const;
const SPRING_CARD = { type: 'spring', stiffness: 300, damping: 25 } as const;
const ACTIVE_DOT_COLOR = '#00ADEF';
const INACTIVE_DOT_COLOR = 'rgba(0,173,239,0.28)';

export interface SuggestionCarouselProps<T> {
  items: T[];
  renderCard: (item: T, isActive: boolean) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  cardHeight: number;
  /**
   * Per-instance width cap override (22.08.2026, home compact-card shape
   * fix) — both default to CARD_MAX_W/CARD_VW when omitted, so every
   * existing caller (post-workout suggestions) stays byte-identical.
   * TodayActivityStrip is the one caller opting into a wider card.
   */
  maxCardWidthPx?: number;
  maxCardWidthVw?: number;
  /** Fires SETTLE_DELAY_MS after the active card stops changing. */
  onSettle?: (item: T, index: number) => void;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}

export function SuggestionCarousel<T>({
  items,
  renderCard,
  keyExtractor,
  cardHeight,
  maxCardWidthPx = CARD_MAX_W,
  maxCardWidthVw = CARD_VW,
  onSettle,
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: SuggestionCarouselProps<T>) {
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex ?? internalIndex;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(maxCardWidthPx);
  const [viewportW, setViewportW] = useState(390);

  useEffect(() => {
    const sync = () => {
      setCardW(Math.min(maxCardWidthPx, (window.innerWidth * maxCardWidthVw) / 100));
      if (viewportRef.current) setViewportW(viewportRef.current.offsetWidth);
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [maxCardWidthPx, maxCardWidthVw]);

  const stride = cardW + GAP;
  const centerX = viewportW / 2 - cardW / 2;
  const trackX = centerX - activeIndex * stride;

  const lastIndex = Math.max(0, items.length - 1);
  const dragLeft = centerX - lastIndex * stride;
  const dragRight = centerX;

  const handleSelect = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      setInternalIndex(clamped);
      onActiveIndexChange?.(clamped);
    },
    [items.length, onActiveIndexChange],
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -DRAG_THRESHOLD_PX) handleSelect(activeIndex + 1);
      else if (info.offset.x > DRAG_THRESHOLD_PX) handleSelect(activeIndex - 1);
    },
    [activeIndex, handleSelect],
  );

  // Ref-held so the effect keys only on [activeIndex, items] (mirrors the same
  // avoid-stale-closure pattern HybridSlotCarousel's own settle effect already uses).
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  useEffect(() => {
    const item = items[activeIndex];
    if (!item) return;
    const t = setTimeout(() => onSettleRef.current?.(item, activeIndex), SETTLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [activeIndex, items]);

  if (items.length <= 1) {
    const only = items[0];
    if (!only) return null;
    return (
      <div dir="rtl" className="w-full flex justify-center" style={{ paddingTop: 8, paddingBottom: 16 }}>
        <div style={{ width: cardW, height: cardHeight }}>{renderCard(only, true)}</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full">
      <div ref={viewportRef} className="overflow-hidden w-full" style={{ height: cardHeight + 24 }}>
        <motion.div
          className="flex flex-row items-center"
          style={{ gap: GAP, paddingTop: 8, paddingBottom: 16, direction: 'ltr' }}
          initial={{ x: trackX }}
          animate={{ x: trackX }}
          transition={SPRING_TRACK}
          drag="x"
          dragConstraints={{ left: dragLeft, right: dragRight }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          {items.map((item, i) => {
            const isActive = i === activeIndex;
            return (
              <motion.div
                key={keyExtractor(item, i)}
                className="flex-shrink-0"
                style={{ width: cardW, height: cardHeight }}
                initial={false}
                animate={{ scale: isActive ? ACTIVE_SCALE : SIDE_SCALE, zIndex: isActive ? 20 : 0 }}
                transition={SPRING_CARD}
                onClick={() => !isActive && handleSelect(i)}
              >
                {renderCard(item, isActive)}
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className="flex justify-center items-center gap-2 mt-2 mb-8">
        {items.map((item, i) => (
          <button
            key={keyExtractor(item, i)}
            aria-label={`הצעה ${i + 1}`}
            onClick={() => handleSelect(i)}
            className="transition-all duration-300 rounded-full"
            style={{
              width: i === activeIndex ? 16 : 6,
              height: 6,
              background: i === activeIndex ? ACTIVE_DOT_COLOR : INACTIVE_DOT_COLOR,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}
