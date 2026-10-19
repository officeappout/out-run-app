'use client';

/**
 * Small presentational parts of the v2 run briefing: the zone ladder, the coaching tip and the "where to run" tiles.
 */

import { CircleDashed, Lightbulb, Route, TreePine, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ZoneLadderItem } from '../../utils/run-preview/run-zone-ladder';
import type { SurfaceIcon, SurfaceTile } from '../../utils/run-preview/run-surfaces';

export function RunZoneLadder({ items }: { items: readonly ZoneLadderItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-black text-v2-ink">איפה הקצב הזה אצלך</h3>
        <span className="text-[11.5px] font-extrabold text-v2-muted">דק׳/ק״מ</span>
      </div>
      <ol className="mt-3 flex items-start gap-1.5">
        {items.map((z) => (
          <li key={z.rung} className="min-w-0 flex-1 text-center" aria-current={z.active ? 'true' : undefined}>
            <div
              className="rounded-full"
              style={
                z.active
                  ? { height: 14, background: z.color, boxShadow: `0 0 0 3px #ffffff, 0 0 0 5px ${z.color}` }
                  : { height: 8, background: z.color, opacity: 0.55 }
              }
              aria-hidden
            />
            <div className={`mt-[7px] whitespace-nowrap text-[11.5px] ${z.active ? 'font-black text-v2-ink' : 'font-bold text-v2-muted'}`}>
              {z.label}
            </div>
            <div dir="ltr" className={`text-[11px] font-extrabold ${z.active ? 'text-v2-deep' : 'text-v2-muted'}`}>
              {z.pace}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RunCoachTip({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-[18px] bg-v2-tint px-3.5 py-3">
      <Lightbulb size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-v2-deep" aria-hidden />
      <p className="text-[13px] font-bold leading-relaxed text-v2-ink-2">{text}</p>
    </div>
  );
}

const SURFACE_ICONS: Record<SurfaceIcon, ComponentType<LucideProps>> = {
  track: CircleDashed,
  trail: TreePine,
  road: Route,
};

export function RunSurfaceTiles({ tiles }: { tiles: readonly SurfaceTile[] }) {
  return (
    <section>
      <h3 className="text-[15px] font-black text-v2-ink">איפה כדאי לרוץ</h3>
      <div className="mt-2.5 flex gap-2">
        {tiles.map((t) => {
          const Icon = SURFACE_ICONS[t.icon];
          return (
            <div key={t.id} className="min-w-0 flex-1 rounded-[18px] bg-white p-2.5 shadow-v2-ring">
              <span className="grid h-[30px] w-[30px] place-items-center rounded-[10px] bg-v2-tint text-v2-deep" aria-hidden>
                <Icon size={16} strokeWidth={2.4} />
              </span>
              <div className="mt-1.5 truncate whitespace-nowrap text-[12.5px] font-black text-v2-ink">{t.label}</div>
              <div className="truncate whitespace-nowrap text-[11px] font-bold text-v2-muted">{t.tip}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
