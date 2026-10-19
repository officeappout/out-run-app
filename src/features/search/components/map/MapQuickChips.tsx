'use client';

import { Dumbbell, Route as RouteIcon } from 'lucide-react';
import { MAP_QUICK_LABEL, type MapQuickChip } from '../../hooks/useMapQuickPlaces';

const ICON: Record<MapQuickChip, typeof Dumbbell> = { gyms: Dumbbell, routes: RouteIcon };

/** The map search's quick chips row (MapEmpty board). Only chips that have data are passed in. */
export default function MapQuickChips({ chips, active, onToggle }: { chips: MapQuickChip[]; active: MapQuickChip | null; onToggle: (c: MapQuickChip) => void }) {
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="חיפוש מהיר">
      {chips.map((c) => {
        const Icon = ICON[c];
        const on = active === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
              on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            <Icon size={14} strokeWidth={2.4} className={on ? '' : 'text-v2-muted'} aria-hidden />
            {MAP_QUICK_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
