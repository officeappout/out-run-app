'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export type HScrollerGap = 2 | 2.5 | 3 | 4;
export type HScrollerEdge = 0 | 4 | 5;

const GAP: Record<HScrollerGap, string> = { 2: 'gap-2', 2.5: 'gap-2.5', 3: 'gap-3', 4: 'gap-4' };
// Edge padding + matching scroll-padding so a snapped item lines up with the page gutter.
const EDGE: Record<HScrollerEdge, string> = { 0: '', 4: 'px-4 scroll-px-4', 5: 'px-5 scroll-px-5' };

export interface HScrollerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Gap between items (Tailwind spacing). Default 2. */
  gap?: HScrollerGap;
  /** Side gutter in Tailwind spacing (4 = 16px, 5 = 20px). Default 5. */
  edge?: HScrollerEdge;
  /** Scroll snapping. Default 'proximity'; false = free scroll. */
  snap?: 'mandatory' | 'proximity' | false;
  /** Reading direction. Default 'rtl' (first item on the right). */
  dir?: 'rtl' | 'ltr';
}

/**
 * v2 HScroller — a horizontal rail: RTL by default, hidden scrollbar, side
 * gutters that scroll with the content, optional snap. Direct children are
 * made non-shrinking and (with snap) `snap-start`.
 *
 *   <HScroller gap={2.5}>{cards.map((c) => <Card key={c.id} className="w-[220px]" />)}</HScroller>
 */
const HScroller = forwardRef<HTMLDivElement, HScrollerProps>(function HScroller(
  { children, gap = 2, edge = 5, snap = 'proximity', dir = 'rtl', className = '', style, ...rest },
  ref,
) {
  const snapClass = snap ? `snap-x ${snap === 'mandatory' ? 'snap-mandatory' : 'snap-proximity'} [&>*]:snap-start` : '';
  return (
    <div
      ref={ref}
      dir={dir}
      data-v2-hscroller
      className={[
        'flex overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden [&>*]:shrink-0',
        GAP[gap],
        EDGE[edge],
        snapClass,
        className,
      ].join(' ')}
      style={{ scrollbarWidth: 'none', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});

export default HScroller;
