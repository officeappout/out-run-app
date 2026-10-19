'use client';

/**
 * Swipeable template previews (SH-4): the selected one centred with a cyan
 * ring, its neighbours peeking at half opacity; name + dots underneath.
 */
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { ShareTemplateDef } from '../../share-v2/templates/template';
import type { ShareFormat } from '../../share-v2/types';
import { CHECKER_STYLE } from './checker';

export default function ShareTemplateCarousel({
  templates,
  selectedId,
  previews,
  format,
  onSelect,
}: {
  templates: ShareTemplateDef[];
  selectedId: string;
  previews: Record<string, string>;
  format: ShareFormat;
  onSelect: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const cardW = format === 'story' ? 160 : format === 'sticker' ? 190 : 230;
  const cardH = format === 'story' ? (cardW * 16) / 9 : cardW;
  const sticker = format === 'sticker';

  // Keep the selected card centred (also after a format switch).
  useEffect(() => {
    const el = itemRefs.current.get(selectedId);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedId, format]);

  // Swiping: whichever card ends up nearest the centre becomes the selection.
  const onScrollEnd = () => {
    const box = scroller.current?.getBoundingClientRect();
    if (!box) return;
    const mid = box.left + box.width / 2;
    let best: string | null = null;
    let bestD = Infinity;
    itemRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    if (best && best !== selectedId) onSelect(best);
  };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onScrollEnd, 120);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const selected = templates.find((t) => t.id === selectedId);
  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory items-center gap-3.5 overflow-x-auto px-[calc(50%-80px)] py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: cardH + 24 }}
      >
        {templates.map((t) => {
          const on = t.id === selectedId;
          const src = previews[t.id];
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) itemRefs.current.set(t.id, el);
                else itemRefs.current.delete(t.id);
              }}
              type="button"
              aria-label={t.label}
              aria-pressed={on}
              onClick={() => onSelect(t.id)}
              className={`relative shrink-0 snap-center overflow-hidden rounded-[16px] bg-v2-surface transition-[opacity,transform] duration-200 ease-v2 ${
                on ? 'opacity-100 shadow-[0_0_0_3px_#00baf7,0_22px_40px_-22px_rgba(9,30,50,0.6)]' : 'scale-[0.84] opacity-50'
              }`}
              style={{ width: cardW, height: cardH, ...(sticker ? CHECKER_STYLE : null) }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className={`h-full w-full ${sticker ? 'object-contain p-1.5' : 'object-cover'}`} draggable={false} />
              ) : (
                <span className="grid h-full w-full place-items-center text-v2-muted">
                  <Loader2 size={20} className="animate-spin" aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-col items-center gap-1.5">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{selected?.label}</span>
        <span className="flex gap-[5px]" aria-hidden>
          {templates.map((t) => (
            <span
              key={t.id}
              className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${t.id === selectedId ? 'w-[18px] bg-[#00baf7]' : 'w-1.5 bg-[#cfdde6]'}`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
