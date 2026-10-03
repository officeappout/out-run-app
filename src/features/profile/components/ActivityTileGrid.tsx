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
}

interface ActivityTileGridProps {
  tiles: ActivityTile[];
  isLoading: boolean;
  emptyIcon?: string;
  emptyMessage: React.ReactNode;
}

export default function ActivityTileGrid({
  tiles,
  isLoading,
  emptyIcon = '🏃',
  emptyMessage,
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
