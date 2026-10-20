'use client';

/**
 * RevealOnScroll — staggered entrance for a column of blocks: each block
 * rises 14px and fades in once it enters the viewport (IntersectionObserver,
 * fires once). Timing from the plan-summary boards (jr/J2-11): 220ms per
 * block, 80ms between blocks — `index` sets the block's place in the stagger.
 *
 * prefers-reduced-motion → shown immediately, no transform. No
 * IntersectionObserver (old WebView) → shown immediately.
 *
 *   {tiles.map((t, i) => <RevealOnScroll key={t.id} index={i}>{t.node}</RevealOnScroll>)}
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { revealStyle } from './reveal';

export interface RevealOnScrollProps {
  /** Position in the stagger (0 = first). */
  index?: number;
  className?: string;
  children: ReactNode;
}

export default function RevealOnScroll({ index = 0, className = '', children }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (reduced || !el || typeof IntersectionObserver === 'undefined') {
      setReduce(reduced);
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-v2-reveal={shown ? 'in' : 'out'} className={className} style={revealStyle({ shown, index, reduce })}>
      {children}
    </div>
  );
}
