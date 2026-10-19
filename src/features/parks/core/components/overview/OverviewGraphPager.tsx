'use client';

/**
 * OverviewGraphPager — the overview drawer's top graph card slot. One page →
 * a plain card; several → a swipeable, snapping pager with dots (planned:
 * page 1 intensity profile (ProfileStrip), page 2 the route's elevation with
 * the workout's segments overlaid). Generic: pages are any ReactNode.
 */

import { useState, type ReactNode, type UIEvent } from 'react';

export default function OverviewGraphPager({ pages }: { pages: readonly ReactNode[] }) {
  const [page, setPage] = useState(0);
  if (pages.length === 0) return null;
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const w = el.clientWidth || 1;
    setPage(Math.min(pages.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / w))));
  };
  return (
    <div className="mt-3">
      <div onScroll={pages.length > 1 ? onScroll : undefined}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[20px] bg-white shadow-v2-card"
        style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}>
        {pages.map((p, i) => (
          <div key={i} className="w-full shrink-0 snap-center p-3">{p}</div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="mt-1.5 flex justify-center gap-1.5" aria-hidden>
          {pages.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-150 ease-v2 ${i === page ? 'w-[18px] bg-v2-accent' : 'w-1.5 bg-v2-pill-border'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
