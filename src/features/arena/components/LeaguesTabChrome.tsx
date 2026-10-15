'use client';

/**
 * Leagues-tab chrome split out of /community (page.tsx) so it can render with
 * fixture data in the design preview route: the active-league selector button
 * and the sticky "my rank" bar. Purely presentational — every value and
 * handler comes from the page, unchanged.
 */

import React from 'react';
import { ChevronDown, Share2, UserPlus } from 'lucide-react';
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
      <div
        className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 bg-white border border-gray-200 mb-3"
        dir="rtl"
      >
        <div className="w-11 h-11 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 bg-white border border-gray-200 shadow-subtle active:scale-[0.98] transition-transform mb-3"
      dir="rtl"
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={activeCard?.logoUrl ? undefined : { background: 'linear-gradient(135deg, #00ADEF, #00dcd0)' }}
      >
        {activeCard?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeCard.logoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl leading-none text-white">{activeCard?.emoji ?? '🏆'}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-gray-900 text-sm truncate">{activeCard?.name ?? 'בחר ליגה'}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </div>
        <div className="text-xs text-gray-500 truncate">
          {activeCard?.subtitle ? `${activeCard.subtitle} • ` : ''}
          {filterLabel}
        </div>
      </div>
      {rank != null && (
        <div className="flex flex-col items-center flex-shrink-0 leading-none">
          <span className="font-black tabular-nums text-sm" style={{ color: '#10B981' }}>
            #{rank}
          </span>
          <span className="text-gray-400 mt-0.5" style={{ fontSize: 9 }}>
            דירוג
          </span>
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
      {/* Gradient fade — purely decorative, pointer-events:none via
          the wrapper. Sits flush above the white bar (no margin) so
          the fade meets the bar's top edge cleanly. */}
      <div
        aria-hidden
        style={{
          height: 32,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
        }}
      />

      <div
        className="pointer-events-auto flex items-center gap-3 rounded-2xl shadow-floating"
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
          border: '0.5px solid rgba(229,231,235,0.9)',
          padding: '8px 12px 8px 8px',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white"
          style={{
            background: 'linear-gradient(135deg, #00ADEF, #00dcd0)',
            boxShadow: '0 4px 12px rgba(0,173,239,0.35)',
          }}
        >
          <span className="text-[8px] font-bold leading-none opacity-80">דירוג</span>
          <span className="text-sm font-black tabular-nums leading-tight">{myEntry.rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 truncate leading-tight flex items-center gap-1">
            {myEntry.name}
            {/* Streak badge — secondary to the metric-first score below
                (Stage B). profile.progression.currentStreak is already
                loaded client-side (no new fetch) and reflects the
                current user regardless of which metric is selected. */}
            {!!streak && (
              <span className="text-[10px] font-bold flex-shrink-0" style={{ color: '#f4b400' }} aria-hidden>
                {streak}🔥
              </span>
            )}
          </p>
          <p className="text-[11px] text-[#00ADEF] font-bold tabular-nums leading-tight">{scoreLabel}</p>
        </div>
        <button
          type="button"
          onClick={onInvite}
          aria-label="הזמן חברים"
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[#00ADEF] active:scale-95 transition-transform flex-shrink-0"
          style={{ background: 'rgba(0,173,239,0.1)' }}
        >
          <UserPlus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-black active:scale-95 transition-transform flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #00ADEF, #00dcd0)',
            boxShadow: '0 4px 12px rgba(0,173,239,0.3)',
          }}
        >
          <Share2 className="w-3.5 h-3.5" />
          שתף
        </button>
      </div>
    </div>
  );
}
