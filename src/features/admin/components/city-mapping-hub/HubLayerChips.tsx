'use client';

/**
 * HubLayerChips — one row of layer toggles above the map, grouped (§3.3).
 * Scrolls horizontally inside itself on a phone; the page never does.
 * Counts come from the loaded layer (or "…" while loading).
 */
import type { HubChipLayer } from '@/lib/city-mapping-hub/layers';
import { HUB_CHIPS } from '@/lib/city-mapping-hub/layers';

export interface HubLayerChipsProps {
  enabled: HubChipLayer[];
  /** Per-chip feature count once loaded; undefined = not loaded / no authority. */
  counts: Partial<Record<HubChipLayer, number | string>>;
  onToggle: (key: HubChipLayer) => void;
}

export default function HubLayerChips({ enabled, counts, onToggle }: HubLayerChipsProps) {
  const groups = Array.from(new Set(HUB_CHIPS.map((c) => c.group)));
  return (
    <div className="flex gap-3 overflow-x-auto border-b border-slate-100 px-3 py-2.5" role="group" aria-label="שכבות מפה">
      {groups.map((g) => (
        <div key={g} className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-extrabold text-slate-400">{g}</span>
          {HUB_CHIPS.filter((c) => c.group === g).map((c) => {
            const on = enabled.includes(c.key);
            const n = counts[c.key];
            return (
              <button key={c.key} type="button" aria-pressed={on} data-testid={`chip-${c.key}`} onClick={() => onToggle(c.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold ${on ? 'border-cyan-300 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-600'}`}>
                <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color, opacity: on ? 1 : 0.4 }} aria-hidden />
                {c.label}
                {n !== undefined && <span className="tabular-nums text-slate-500">{n}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
