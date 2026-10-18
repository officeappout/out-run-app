'use client';

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { tonesPresent, type SetTile, type SetTone } from './summary';

/**
 * ExerciseSetsTable — the one strength table used by every v2 summary
 * (strength, hybrid station, …): an exercise card per row (thumbnail, name,
 * target) with one result tile per set. Turquoise = target met, amber =
 * below target, dashed = planned but not done. Display-only.
 */

export interface ExerciseSetsRow {
  key: string;
  name: string;
  /** Exercise image; absent ⇒ a neutral dumbbell thumbnail. */
  imageUrl?: string;
  /** "יעד 8 חזרות" / "יעד 6–8 חזרות" / "לא בוצע". */
  subtitle: string;
  tiles: SetTile[];
  /** Dim the row (exercise not done at all). */
  muted?: boolean;
}

const TONE_CLASS: Record<SetTone, string> = {
  in: 'bg-v2-accent text-white',
  below: 'bg-v2-amber text-white',
  missed: 'bg-white text-v2-muted border border-dashed border-v2-pill-border',
};

const LEGEND_LABEL: Record<SetTone, string> = {
  in: 'ביעד',
  below: 'מתחת ליעד',
  missed: 'לא בוצע',
};

export function SetTileBox({ tile, size = 28 }: { tile: SetTile; size?: number }) {
  return (
    <span
      dir="ltr"
      className={`box-border grid shrink-0 place-items-center whitespace-nowrap rounded-[9px] px-1 text-[12.5px] font-black tabular-nums ${TONE_CLASS[tile.tone]}`}
      style={{ minWidth: size, height: size }}
    >
      {tile.value}
    </span>
  );
}

export function SetsLegend({ tones }: { tones: SetTone[] }) {
  if (tones.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 text-[11.5px] font-extrabold text-v2-muted">
      {tones.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-[3px] ${
              t === 'in' ? 'bg-v2-accent' : t === 'below' ? 'bg-v2-amber' : 'border border-dashed border-v2-muted bg-white'
            }`}
          />
          {LEGEND_LABEL[t]}
        </span>
      ))}
    </span>
  );
}

export function ExerciseThumb({ imageUrl, size }: { imageUrl?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-[#e7eef2] to-[#d5e1e8] text-[#64748b]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Dumbbell size={Math.round(size * 0.4)} strokeWidth={2.2} />
      )}
    </div>
  );
}

function tileSize(maxTiles: number): number {
  if (maxTiles >= 6) return 22;
  if (maxTiles === 5) return 25;
  return 28;
}

export interface ExerciseSetsTableProps {
  /** Block title on the start edge ("סופרסט 1", "תחנת כוח · 2 סבבים"). Optional. */
  title?: string;
  rows: ExerciseSetsRow[];
  /** Hide the legend (e.g. when the parent already shows one). */
  hideLegend?: boolean;
}

export default function ExerciseSetsTable({ title, rows, hideLegend = false }: ExerciseSetsTableProps) {
  if (rows.length === 0) return null;
  const tones = tonesPresent(rows.flatMap((r) => r.tiles));
  const size = tileSize(Math.max(...rows.map((r) => r.tiles.length)));
  const showHead = !!title || (!hideLegend && tones.length > 0);
  return (
    <div>
      {showHead && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[14.5px] font-black text-v2-ink">{title}</span>
          {!hideLegend && <SetsLegend tones={tones} />}
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`flex h-[58px] items-stretch overflow-hidden rounded-2xl bg-white shadow-v2-ring ${r.muted ? 'opacity-70' : ''}`}
          >
            <ExerciseThumb imageUrl={r.imageUrl} size={58} />
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-1">
              <span className="truncate text-[14px] font-extrabold text-v2-ink">{r.name}</span>
              <span className="mt-px truncate text-[12.5px] font-bold text-v2-ink-2">{r.subtitle}</span>
            </div>
            {r.tiles.length > 0 && (
              <div className="flex shrink-0 items-center gap-1 pl-2.5" aria-label="סטים">
                {r.tiles.map((t, i) => (
                  <SetTileBox key={i} tile={t} size={size} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
