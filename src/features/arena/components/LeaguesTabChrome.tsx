'use client';

/**
 * Leagues-tab chrome split out of /community (page.tsx) so it can render with
 * fixture data in the design preview route: the active-league selector button
 * and the sticky "my rank" bar. Purely presentational — every value and
 * handler comes from the page, unchanged.
 */

import React from 'react';
import { ChevronDown, Flame, Share2, UserPlus } from 'lucide-react';
import IconTile from '@/components/ui/v2/IconTile';
import Button from '@/components/ui/v2/Button';
import { leagueIconFor } from './league-icons';
import type { LeagueCardData } from './LeagueCarousel';
import type { LeaderboardEntry } from '@/features/arena/services/ranking.service';

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

// ── Sticky "my rank" bar ───────────────────────────────────────────────────

export interface MyRankStickyBarProps {
  myEntry: LeaderboardEntry;
  /** Already formatted via formatLeaderboardScore by the page. */
  scoreLabel: string;
  /** profile.progression.currentStreak — badge hidden when 0/undefined. */
  streak?: number;
  onInvite: () => void;
  onShare: () => void;
}

export function MyRankStickyBar({ myEntry, scoreLabel, streak, onInvite, onShare }: MyRankStickyBarProps) {
  return (
    <div
      className="sticky z-10 -mx-4 px-4 pointer-events-none"
      style={{
        bottom: 'calc(46px + env(safe-area-inset-bottom, 0px))',
      }}
      dir="rtl"
    >
      {/* Gradient fade — purely decorative, pointer-events:none via the
          wrapper; fades the scroll content into the bar's top edge. */}
      <div
        aria-hidden
        style={{
          height: 24,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.9))',
        }}
      />

      {/* v2 floating glass card — the one blurred layer in this scroll
          container; sits over the dark board / content as it scrolls. */}
      <div className="pointer-events-auto v2-glass-card shadow-v2-float rounded-v2-card flex items-center gap-3 py-2 pr-2 pl-2.5">
        <div className="w-11 h-11 rounded-[14px] flex flex-col items-center justify-center flex-shrink-0 bg-v2-cta text-v2-on-cta">
          <span className="text-[9px] font-bold leading-none opacity-80">דירוג</span>
          <span className="text-[16px] font-black tabular-nums leading-tight">{myEntry.rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-black text-v2-ink truncate leading-tight flex items-center gap-1.5">
            <span className="truncate">{myEntry.name}</span>
            {/* Streak badge — secondary to the metric-first score below
                (Stage B). profile.progression.currentStreak is already
                loaded client-side (no new fetch). */}
            {!!streak && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-black text-[#b37400] flex-shrink-0">
                <Flame size={12} strokeWidth={2.6} fill="#ffc83d" aria-hidden />
                {streak}
              </span>
            )}
          </p>
          <p className="text-[12px] text-v2-deep font-bold tabular-nums leading-tight mt-0.5 truncate">{scoreLabel}</p>
        </div>
        <button
          type="button"
          onClick={onInvite}
          aria-label="הזמן חברים"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-v2-tint text-v2-deep active:scale-[0.97] transition-transform ease-v2 flex-shrink-0"
        >
          <UserPlus size={16} strokeWidth={2.4} />
        </button>
        <Button variant="primary" size="sm" onClick={onShare} className="flex-shrink-0 !px-3.5">
          <Share2 size={14} strokeWidth={2.4} aria-hidden />
          שתף
        </Button>
      </div>
    </div>
  );
}
