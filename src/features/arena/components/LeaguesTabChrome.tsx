'use client';

/**
 * Leagues-tab chrome split out of /community (page.tsx) so it can render with
 * fixture data in the design preview route: the active-league selector button.
 * (The page-level sticky "my rank" bar was removed in design v2 — the board's
 * own sticky "you" row replaces it.) Purely presentational — every value and
 * handler comes from the page, unchanged.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import IconTile from '@/components/ui/v2/IconTile';
import { leagueIconFor } from './league-icons';
import type { LeagueCardData } from './LeagueCarousel';

// ── Active-league selector button ──────────────────────────────────────────

export interface LeagueSelectorButtonProps {
  isLoading: boolean;
  activeCard: LeagueCardData | undefined;
  filterLabel: string;
  rank: number | null | undefined;
  expanded: boolean;
  onOpen: () => void;
}

export function LeagueSelectorButton({
  isLoading,
  activeCard,
  filterLabel,
  rank,
  expanded,
  onOpen,
}: LeagueSelectorButtonProps) {
  if (isLoading) {
    return (
      <div className="w-full flex items-center gap-3 rounded-v2-card px-3.5 py-3 bg-white shadow-v2-card mb-3" dir="rtl">
        <div className="w-11 h-11 rounded-[14px] bg-v2-surface animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-v2-surface animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-v2-surface animate-pulse" />
        </div>
      </div>
    );
  }

  const LeagueIcon = leagueIconFor(activeCard?.key ?? '');

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="w-full flex items-center gap-3 rounded-v2-card px-3.5 py-3 bg-white shadow-v2-card active:scale-[0.97] transition-transform ease-v2 mb-3"
      dir="rtl"
    >
      {activeCard?.logoUrl ? (
        <span className="w-11 h-11 rounded-[14px] overflow-hidden flex-shrink-0 ring-1 ring-inset ring-v2-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeCard.logoUrl} alt="" className="w-full h-full object-cover" />
        </span>
      ) : (
        <IconTile icon={LeagueIcon} tone="accent" size="lg" className="!w-11 !h-11" />
      )}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-1.5">
          <span className="text-[16px] font-black text-v2-ink truncate tracking-v2-tight">{activeCard?.name ?? 'בחר ליגה'}</span>
          <ChevronDown size={16} strokeWidth={2.4} className="text-v2-muted flex-shrink-0" />
        </div>
        <div className="text-[12.5px] font-semibold text-v2-muted truncate">
          {activeCard?.subtitle ? `${activeCard.subtitle} • ` : ''}
          {filterLabel}
        </div>
      </div>
      {rank != null && (
        <div className="flex flex-col items-center flex-shrink-0 leading-none rounded-v2-tile bg-v2-tint px-2.5 py-1.5">
          <span className="font-black tabular-nums text-[15px] text-v2-deep">#{rank}</span>
          <span className="text-[10px] font-bold text-v2-deep/70 mt-0.5">דירוג</span>
        </div>
      )}
    </button>
  );
}
