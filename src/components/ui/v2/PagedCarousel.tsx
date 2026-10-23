'use client';

/**
 * v2 PagedCarousel — full-width cards in one snap rail with pager dots below
 * (RTL: the first card on the right). Swipe or tap a dot. One child → just the
 * child, no rail and no dots. Text-free: the caller passes the labels.
 *
 *   <PagedCarousel ariaLabel={t('…')} dotLabel={(i, n) => t('…', { page: i + 1, count: n })}>
 *     <StrengthCard key="strength" />
 *     <RunCard key="run" />
 *   </PagedCarousel>
 *
 * Slides stretch to the tallest one, so the pair always reads as one card size.
 */
import { Children, isValidElement, useCallback, useRef, useState, type ReactNode } from 'react';
import { pageFromScroll } from './paged-carousel';

export interface PagedCarouselProps {
  children: ReactNode;
  /** Accessible name of the carousel region. */
  ariaLabel: string;
  /** Accessible name of dot `index` (0-based) out of `count`. */
  dotLabel: (index: number, count: number) => string;
  className?: string;
  /** Called when the resting page changes (swipe or dot). */
  onPageChange?: (index: number) => void;
}

export default function PagedCarousel({ children, ariaLabel, dotLabel, className = '', onPageChange }: PagedCarouselProps) {
  const slides = Children.toArray(children).filter(Boolean);
  const railRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const count = slides.length;

  const settle = useCallback(
    (next: number) => {
      if (pageRef.current === next) return;
      pageRef.current = next;
      setPage(next);
      onPageChange?.(next);
    },
    [onPageChange],
  );

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (el) settle(pageFromScroll(el.scrollLeft, el.clientWidth, count));
  }, [count, settle]);

  const goTo = useCallback(
    (i: number) => {
      const slide = railRef.current?.children[i] as HTMLElement | undefined;
      slide?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      settle(i);
    },
    [settle],
  );

  if (count <= 1) return <div className={`flex min-w-0 ${className}`}>{slides}</div>;

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`} role="region" aria-roledescription="carousel" aria-label={ariaLabel} data-v2-paged-carousel>
      <div
        ref={railRef}
        dir="rtl"
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {slides.map((slide, i) => (
          <div
            key={isValidElement(slide) && slide.key != null ? slide.key : i}
            className="flex w-full shrink-0 snap-start snap-always"
            data-slide-index={i}
            data-active={i === page ? 'true' : undefined}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-0.5" dir="rtl">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={dotLabel(i, count)}
            aria-current={i === page ? 'true' : undefined}
            className="grid h-6 min-w-6 place-items-center px-1"
          >
            <span
              aria-hidden
              className={`block h-1.5 rounded-full transition-[width,background-color] duration-200 ease-v2 ${
                i === page ? 'w-[18px] bg-v2-ink' : 'w-1.5 bg-v2-pill-border'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
