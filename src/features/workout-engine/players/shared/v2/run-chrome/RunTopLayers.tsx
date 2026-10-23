'use client';

/**
 * RunTopLayers — the header's sliding layers with pager dots (board H-7):
 * layer 1 = the blocks / progress bars, layer 2 = "ביחד N ק״מ" + faces, layer 3
 * = the race bar. Native scroll-snap (swipe), controlled `index` so the rail can
 * jump to the race layer. A single layer renders with no pager and no dots.
 */

import React, { useEffect, useRef } from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '@/features/workout-engine/together/hooks/useTogetherLocale';
import { indexFromScroll } from './run-chrome-logic';

export interface RunTopLayersProps {
  layers: React.ReactNode[];
  index: number;
  onIndexChange: (i: number) => void;
}

export default function RunTopLayers({ layers, index, onIndexChange }: RunTopLayersProps) {
  const t = useT(together);
  const { isRtl } = useTogetherLocale();
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef(false);

  // Controlled: scroll to `index` when it changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el || layers.length < 2) return;
    const current = indexFromScroll(el.scrollLeft, el.clientWidth, layers.length);
    if (current === index) return;
    settling.current = true;
    el.scrollTo({ left: (isRtl ? -1 : 1) * index * el.clientWidth, behavior: 'smooth' });
    const id = setTimeout(() => { settling.current = false; }, 450);
    return () => clearTimeout(id);
  }, [index, layers.length, isRtl]);

  if (layers.length < 2) return <>{layers[0] ?? null}</>;

  return (
    <div>
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: 'pan-x' }}
        onScroll={(e) => {
          if (settling.current) return;
          const el = e.currentTarget;
          const i = indexFromScroll(el.scrollLeft, el.clientWidth, layers.length);
          if (i !== index) onIndexChange(i);
        }}
      >
        {layers.map((l, i) => (
          <div key={i} className="w-full shrink-0 snap-center" aria-label={t('chrome.layer.aria', { n: i + 1, total: layers.length })}>
            {l}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-[5px]" aria-hidden>
        {layers.map((_, i) => (
          <span key={i} className="h-1.5 rounded-full" style={{ width: i === index ? 16 : 6, background: i === index ? '#0e1419' : '#cbd5e1' }} />
        ))}
      </div>
    </div>
  );
}
