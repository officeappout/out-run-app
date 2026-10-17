'use client';

/**
 * ActivityTileGrid — generic "story-in-square" tile grid shell ("public
 * profile" slice 1 extraction). Pure presentation: takes already-mapped
 * tile data and renders the 3-column gradient-tile grid, loading skeleton,
 * and empty state. Two adapters build on top of this one shared shell
 * instead of each re-implementing the grid:
 *   - WorkoutGrid.tsx    — self profile, reads private WorkoutHistoryEntry[]
 *   - PublicActivityGrid.tsx — public profile, reads public FeedPost[]
 * Neither adapter duplicates the grid/tile markup; both just map their own
 * data shape into `ActivityTile[]` and hand it to this component.
 */

import React from 'react';

export interface ActivityTile {
  id: string;
  Icon: React.ElementType;
  label: string;
  stat: string;
  /** Tailwind gradient stops, e.g. "from-purple-500 to-purple-400". */
  tileGradient: string;
  /** Omit for a non-interactive tile (e.g. no detail page exists for the
   * underlying record yet — see PublicActivityGrid's own comment). */
  onClick?: () => void;
  /** Home v2 tile: activity colour (rgb triplet), app icon, the headline
   * number + unit and a caption — the feed post shrunk to a square. */
  v2?: { rgb: string; iconSrc: string; value: string; unit: string; caption: string };
}

interface ActivityTileGridProps {
  tiles: ActivityTile[];
  isLoading: boolean;
  emptyIcon?: string;
  emptyMessage: React.ReactNode;
  /** Home v2 look (enable_home_v2). */
  v2?: boolean;
}

export default function ActivityTileGrid({
  tiles,
  isLoading,
  emptyIcon = '🏃',
  emptyMessage,
  v2 = false,
}: ActivityTileGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="text-3xl">{emptyIcon}</span>
        <p className="text-sm font-bold text-gray-500 text-center">{emptyMessage}</p>
      </div>
    );
  }

  if (v2) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((tile) => {
          const t = tile.v2;
          if (!t) return null;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={tile.onClick}
              disabled={!tile.onClick}
              aria-label={`${tile.label}, ${t.value} ${t.unit}, ${t.caption}`}
              className="relative aspect-square overflow-hidden rounded-[14px] text-start transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:cursor-default disabled:opacity-60"
              style={{ background: `linear-gradient(160deg, rgba(${t.rgb},0.22), rgba(${t.rgb},0.06))` }}
            >
              <span className="absolute inset-x-0 top-3 flex justify-center opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.iconSrc} alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/85 to-transparent px-2 pb-1.5 pt-4">
                <span className="block whitespace-nowrap text-[16px] font-black leading-none !tracking-[-0.02em] text-v2-ink">
                  {t.value}
                  <span className="ms-0.5 text-[10px] font-extrabold text-v2-ink-2">{t.unit}</span>
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-bold text-v2-muted">{t.caption}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          onClick={tile.onClick}
          disabled={!tile.onClick}
          className={`relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${tile.tileGradient} flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:cursor-default disabled:opacity-60`}
        >
          <tile.Icon className="w-6 h-6 text-white/90" />
          <span className="text-[10px] font-black text-white leading-tight">{tile.label}</span>
          <span className="text-[10px] font-bold text-white/80 tabular-nums">{tile.stat}</span>
        </button>
      ))}
    </div>
  );
}
