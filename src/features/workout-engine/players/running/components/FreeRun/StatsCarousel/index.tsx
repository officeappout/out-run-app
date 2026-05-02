'use client';

import { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import MainMetrics from './MainMetrics';
import LapMetrics from './LapMetrics';

/**
 * StatsCarousel
 * -------------
 * Two-slide horizontal carousel for the metrics card.
 *
 * Structural notes:
 *   • The transparent drag overlay sits ONLY over the slide strip — NOT
 *     over the pagination dots. Earlier revisions used `absolute inset-0`
 *     on the parent which trapped pointer events for the dot row and any
 *     future tap target inside a slide.
 *   • The slide strip is `width: N * 100%` so each child slide is exactly
 *     `100 / N %` wide. Translating the strip by `-(currentSlide * 100/N)%`
 *     lands the desired slide in the viewport.
 *   • `minHeight: 240` on the carousel root reserves vertical space so an
 *     `overflow-hidden` ancestor (the metrics card) cannot collapse around
 *     a slide that's translated off-screen — that was the root cause of
 *     the "empty slide" symptom.
 *   • Each slide cell carries `min-h-[220px]` so the inner content area
 *     is never smaller than the carousel itself, even before the inner
 *     component (e.g. LapMetrics) finishes layout.
 */
export default function StatsCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    { id: 'main', component: MainMetrics },
    { id: 'lap', component: LapMetrics },
  ];

  const slideWidthPercent = 100 / slides.length;

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 50;
    const velocity = info.velocity.x;

    if (Math.abs(velocity) > 500) {
      if (velocity < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((prev) => prev + 1);
      } else if (velocity > 0 && currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1);
      }
    } else if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((prev) => prev + 1);
      } else if (info.offset.x > 0 && currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1);
      }
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* ── Slide region ─────────────────────────────────────────────────
          Wraps the slide strip + the drag overlay so the overlay's
          inset-0 cannot leak onto the pagination dots below. The
          slide region itself owns the minHeight so an `overflow-hidden`
          ancestor (the metrics card) can never collapse around an
          off-screen slide. */}
      <div className="relative" style={{ minHeight: 240 }}>
        {/* Drag handler lives on a SINGLE transparent overlay so the
            swipe gesture is captured ONCE for the whole slide region
            and not duplicated per-slide. Per-slide `drag` props were
            silently competing with the strip's `animate.x` translation
            and could "swallow" the layout transform on slide 2,
            leaving the user staring at an empty rectangle.
            `touchAction: 'pan-y'` lets vertical scroll inside an
            ancestor pass through; only horizontal pans are absorbed. */}
        <motion.div
          className="absolute inset-0 z-20"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          style={{ touchAction: 'pan-y' }}
          aria-hidden="true"
        />

        <motion.div
          className="flex relative z-10"
          animate={{ x: `-${currentSlide * slideWidthPercent}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ width: `${slides.length * 100}%` }}
        >
          {slides.map((slide, i) => {
            const Component = slide.component;
            return (
              <div
                key={slide.id}
                // `flex-shrink-0` + explicit width keep each slide at
                // exactly 1/N of the parent regardless of inner content.
                // `relative` + `opacity-100` are belt-and-braces against
                // any future stacking-context issue: even if some
                // ancestor accidentally sets opacity:0 we override here.
                className="flex-shrink-0 relative opacity-100"
                style={{ width: `${slideWidthPercent}%` }}
                data-testid={`stats-carousel-slide-${slide.id}`}
                data-slide-index={i}
              >
                <div className="w-full min-h-[220px] flex flex-col items-stretch">
                  <Component />
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Pagination dots — light theme to match the white metrics panel.
          Sibling of the slide region (NOT inside the drag overlay) so
          taps reach the buttons cleanly on mobile. */}
      <div className="flex justify-center gap-2 mt-2 pb-3">
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentSlide(index)}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: index === currentSlide ? '1.5rem' : '0.375rem',
              background:
                index === currentSlide ? '#00ADEF' : 'rgba(0, 0, 0, 0.18)',
            }}
            aria-label={`עבור לשקופית ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
