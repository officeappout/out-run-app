'use client';

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { Dumbbell } from 'lucide-react';
import { hapticSelection } from '@/lib/haptics';

interface CoverflowStripProps {
  /** Real levels in ascending order, e.g. [1, 4, 7, 10, 13, 16, 20]. */
  steps: number[];
  /** Index into `steps` — mirrors VisualSlider's sliderVal. */
  selectedIndex: number;
  /** level -> thumbnailUrl. Missing/null/undefined all render the neutral placeholder tile. */
  thumbnails: Record<number, string | null | undefined>;
  /** Same contract as VisualSlider's handleSliderChange — called on both tap and scroll-settle. */
  onSelect: (index: number) => void;
}

const TILE_SIZE = 56;
const TILE_SIZE_SELECTED = 92;
/** Every tile's cell reserves TILE_SIZE_SELECTED width so neighbours never
 *  reflow when the selected tile grows — the gap between small tiles is just
 *  the unused cell margin (92 - 56 = 36px split both sides). */
const CELL_SIZE = TILE_SIZE_SELECTED;
const STRIP_HEIGHT = 116;

/**
 * Horizontal scroll-snap coverflow strip — the app is RTL (`<html dir="rtl">`,
 * `src/app/layout.tsx:32`), but the scroll container is forced `dir: 'ltr'`
 * here (mirroring the same fix already proven necessary in this exact codebase
 * — see HorizontalPicker.tsx's "[Picker RTL Check]" comment: WebKit's
 * `scrollLeft` semantics under `dir: rtl` are inconsistent enough to cause real
 * bugs). To keep the EASIEST step on the right (matching the old dot-track's
 * `right: 0%` convention for index 0, i.e. the reading-start side in RTL), the
 * rendered tile order is `steps` REVERSED — DOM/scroll math stays plain
 * ascending-left-to-right internally; only the array fed to `.map()` is flipped.
 */
export default function CoverflowStrip({
  steps,
  selectedIndex,
  thumbnails,
  onSelect,
}: CoverflowStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserGesture = useRef(false);
  const hasPositioned = useRef(false);
  const lastEmitted = useRef<number | null>(null);
  // Every scroll WE trigger programmatically (initial silent positioning, or
  // the tap-driven recenter) still fires real 'scroll'/'scrollend' events —
  // browsers don't distinguish "caused by JS" from "caused by the user" for
  // these. Confirmed live: the initial positioning's own scrollend was
  // re-emitting a selection change during mount, before tile offsetLeft
  // layout had fully settled, silently overriding the correct default
  // (steps[0]) with whatever the premature centering math computed. Any
  // scrollend/debounced-scroll-settle that follows a programmatic scroll we
  // initiated is consumed here and never reaches emitFromScroll — only a
  // scrollend with NO preceding programmatic scroll (i.e. a real drag) does.
  const suppressNextEmit = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  // displayIndex 0 = hardest (leftmost in forced-ltr DOM) ... last = easiest (rightmost).
  const displaySteps = [...steps].reverse();
  const displayIndexFor = useCallback(
    (stepIndex: number) => steps.length - 1 - stepIndex,
    [steps.length],
  );
  const stepIndexFor = useCallback(
    (displayIndex: number) => steps.length - 1 - displayIndex,
    [steps.length],
  );

  const scrollToDisplayIndex = useCallback((displayIndex: number, smooth: boolean) => {
    const el = scrollRef.current;
    const tile = tileRefs.current[displayIndex];
    if (!el || !tile) return;
    suppressNextEmit.current = true;
    const target = tile.offsetLeft + tile.offsetWidth / 2 - el.clientWidth / 2;
    if (smooth) {
      el.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      el.scrollLeft = target;
    }
  }, []);

  // Initial silent positioning — no visible jump, opacity gated until placed
  // (same technique as HorizontalPicker.tsx's mount-scroll: direct scrollLeft
  // assignment, not scrollTo(), then reveal after a frame).
  useLayoutEffect(() => {
    hasPositioned.current = false;
    setIsVisible(false);
    const raf = requestAnimationFrame(() => {
      scrollToDisplayIndex(displayIndexFor(selectedIndex), false);
      lastEmitted.current = selectedIndex;
      hasPositioned.current = true;
      requestAnimationFrame(() => setIsVisible(true));
    });
    return () => cancelAnimationFrame(raf);
    // Re-run only when the step list itself changes (category switch) — not on
    // every selectedIndex change, which is handled by the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.join(',')]);

  // External sync: selectedIndex changed via a tile tap elsewhere or a fresh
  // step list — smooth-scroll to it unless the user is mid-gesture right now.
  useEffect(() => {
    if (!hasPositioned.current) return;
    if (isUserGesture.current) return;
    if (lastEmitted.current === selectedIndex) return;
    lastEmitted.current = selectedIndex;
    scrollToDisplayIndex(displayIndexFor(selectedIndex), true);
  }, [selectedIndex, displayIndexFor, scrollToDisplayIndex]);

  const readCenteredDisplayIndex = useCallback((): number | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < tileRefs.current.length; i++) {
      const tile = tileRefs.current[i];
      if (!tile) continue;
      const tileCenter = tile.offsetLeft + tile.offsetWidth / 2;
      const dist = Math.abs(center - tileCenter);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, []);

  const emitFromScroll = useCallback(() => {
    const displayIdx = readCenteredDisplayIndex();
    if (displayIdx === null) return;
    const idx = stepIndexFor(displayIdx);
    if (idx !== lastEmitted.current) {
      lastEmitted.current = idx;
      hapticSelection();
      onSelect(idx);
    }
  }, [readCenteredDisplayIndex, stepIndexFor, onSelect]);

  // Live scale/opacity blend as the user scrolls (zero-lag direct DOM writes,
  // same technique as HorizontalPicker.tsx's applyVisuals).
  const applyVisuals = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    const maxDist = CELL_SIZE * 1.5;
    for (const tile of tileRefs.current) {
      if (!tile) continue;
      const tileCenter = tile.offsetLeft + tile.offsetWidth / 2;
      const dist = Math.abs(center - tileCenter);
      const proximity = Math.max(0, 1 - dist / maxDist);
      const scale = 1 + proximity * (TILE_SIZE_SELECTED / TILE_SIZE - 1);
      const img = tile.firstElementChild as HTMLElement | null;
      if (img) {
        img.style.transform = `scale(${scale})`;
        img.style.opacity = String(0.5 + proximity * 0.5);
        img.style.boxShadow = proximity > 0.8
          ? '0 6px 20px rgba(0,186,247,0.30), 0 0 0 3px #00BAF7'
          : '0 1px 4px rgba(0,0,0,0.08)';
      }
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasNativeScrollend = 'onscrollend' in window;

    const settleScroll = () => {
      // Ignore anything before OUR OWN initial positioning has run at all —
      // this is what catches the browser's own scroll-snap auto-correction
      // (CSS `scroll-snap-type` snaps scrollLeft:0 to the nearest valid snap
      // point the instant the strip lays out, on its own, before any JS of
      // ours ever runs — confirmed live via console trace: that auto-snap's
      // scrollend fired and emitted a selection BEFORE the initial-positioning
      // rAF even executed, since `suppressNextEmit` is only ever armed inside
      // scrollToDisplayIndex, called from that same not-yet-run rAF).
      if (!hasPositioned.current) return;
      // Consume the suppression exactly once — a scrollend that follows a
      // programmatic scroll we ourselves triggered (initial positioning's own
      // resulting scrollend, or a tap-recenter) never emits; the next one
      // that isn't preceded by our own scrollToDisplayIndex call does.
      if (suppressNextEmit.current) { suppressNextEmit.current = false; return; }
      emitFromScroll();
    };
    const onScroll = () => {
      applyVisuals();
      if (!hasNativeScrollend) {
        if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
        scrollEndTimer.current = setTimeout(settleScroll, 120);
      }
    };
    const onScrollEnd = () => {
      applyVisuals();
      settleScroll();
    };
    const onTouchStart = () => {
      isUserGesture.current = true;
      // A real grab always wins over any pending programmatic-scroll suppression.
      suppressNextEmit.current = false;
    };
    const onTouchEnd = () => {
      // Small delay so the trailing scroll-snap settle isn't mistaken for
      // an external update by the sync effect above.
      setTimeout(() => { isUserGesture.current = false; }, 150);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    if (hasNativeScrollend) el.addEventListener('scrollend', onScrollEnd);
    // Initial paint of scale/opacity once mounted.
    requestAnimationFrame(applyVisuals);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      if (hasNativeScrollend) el.removeEventListener('scrollend', onScrollEnd);
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, [applyVisuals, emitFromScroll]);

  const handleTap = (displayIndex: number) => {
    const idx = stepIndexFor(displayIndex);
    isUserGesture.current = false; // tap is deterministic — let the sync effect drive the scroll
    if (idx !== lastEmitted.current) {
      lastEmitted.current = idx;
      hapticSelection();
      onSelect(idx);
    } else {
      // Same tile re-tapped — still (re)center it.
      scrollToDisplayIndex(displayIndex, true);
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: STRIP_HEIGHT }}
    >
      <div
        className="absolute inset-y-0 left-0 w-6 z-20 pointer-events-none bg-gradient-to-r from-white to-transparent"
        aria-hidden
      />
      <div
        className="absolute inset-y-0 right-0 w-6 z-20 pointer-events-none bg-gradient-to-l from-white to-transparent"
        aria-hidden
      />
      <div
        ref={scrollRef}
        className="flex h-full items-center overflow-x-auto scrollbar-hide"
        dir="ltr"
        style={{
          direction: 'ltr',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 120ms ease-out',
        }}
      >
        {/* Edge spacers so the first/last real tile can still center. */}
        <div className="flex-none" style={{ width: '50%' }} aria-hidden />

        {displaySteps.map((level, displayIndex) => {
          const stepIdx = stepIndexFor(displayIndex);
          const isSelected = stepIdx === selectedIndex;
          const thumb = thumbnails[level];
          return (
            <button
              key={level}
              type="button"
              ref={(el) => { tileRefs.current[displayIndex] = el; }}
              onClick={() => handleTap(displayIndex)}
              aria-label={`רמה ${level}`}
              aria-pressed={isSelected}
              className="flex-none flex items-center justify-center snap-center touch-manipulation"
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
            >
              <div
                className="rounded-2xl overflow-hidden flex items-center justify-center bg-slate-100"
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  transition: 'none',
                  willChange: 'transform, opacity',
                }}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Dumbbell size={20} className="text-slate-300" aria-hidden />
                )}
              </div>
            </button>
          );
        })}

        <div className="flex-none" style={{ width: '50%' }} aria-hidden />
      </div>
    </div>
  );
}
