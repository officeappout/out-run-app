'use client';

/**
 * LeagueCarousel — horizontal scrollable row of league cards used at the top
 * of the leagues tab. Replaces the old segmented sub-tab bar (עיר / ארצי /
 * org / park) with a richer card-per-league surface.
 *
 * The component is purely presentational: it renders cards from a `leagues`
 * array provided by the parent and surfaces selection through `onSelect`.
 * Rank, member count, and the small filter label all come from the parent —
 * the carousel never reads from any hook or service of its own. This
 * intentionally avoids firing one leaderboard query per card on mount.
 *
 * A trailing dashed "+" card invites the user to create a new league via the
 * existing `/arena/create` route.
 */

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';

export type LeagueCardKey = string;

export interface LeagueCardData {
  key: LeagueCardKey;
  /** Display name (e.g. "ליגת העיר", "ארצי", "ליגת בית הספר") */
  name: string;
  /** Subtitle line — typically the city/org/park name */
  subtitle?: string;
  /** Single emoji used when no logo is available (city is the only card that
   *  passes a logo today; the rest fall back to emojis). */
  emoji?: string;
  /** Optional logo URL (city authorities). When present, replaces the emoji. */
  logoUrl?: string;
  /** Member count for this league. Show `null` to render an em-dash. */
  memberCount: number | null;
  /** User's rank in this league. Show `null` to render an em-dash — used for
   *  every non-active card so we don't fan out 4 leaderboard queries. */
  rank: number | null;
}

interface LeagueCarouselProps {
  leagues: LeagueCardData[];
  selectedKey: LeagueCardKey;
  onSelect: (key: LeagueCardKey) => void;
  /** Small label rendered under the rank on the *active* card only, e.g.
   *  "ריצה • שבועי". Updates whenever the parent's category/timeWindow
   *  state changes so users can see what filter their rank reflects. */
  activeFilterLabel: string;
  /** Path to navigate to when the trailing "+" card is tapped. Defaults to
   *  the existing `/arena/create` flow. */
  createHref?: string;
}

const ACTIVE_BORDER = '#1D9E75';
const ACTIVE_RING = '#E1F5EE';

export default function LeagueCarousel({
  leagues,
  selectedKey,
  onSelect,
  activeFilterLabel,
  createHref = '/arena/create',
}: LeagueCarouselProps) {
  return (
    <div className="-mx-4" dir="rtl">
      <div
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-3 snap-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {leagues.map((league) => {
          const active = selectedKey === league.key;
          return (
            <button
              key={league.key}
              type="button"
              onClick={() => onSelect(league.key)}
              aria-selected={active}
              role="tab"
              className="snap-start flex-shrink-0 bg-white text-center transition-transform active:scale-[0.97]"
              style={{
                width: 110,
                height: 110,
                borderRadius: 14,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: active
                  ? `2px solid ${ACTIVE_BORDER}`
                  : '1.5px solid #E5E7EB',
                boxShadow: active ? `0 0 0 3px ${ACTIVE_RING}` : 'none',
              }}
            >
              {/* Top: icon + names */}
              <div className="flex flex-col items-center w-full min-w-0">
                <div
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden"
                  aria-hidden="true"
                >
                  {league.logoUrl ? (
                    <Image
                      src={league.logoUrl}
                      alt=""
                      width={36}
                      height={36}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-base leading-none">
                      {league.emoji ?? '🏆'}
                    </span>
                  )}
                </div>
                <div
                  className="font-medium text-gray-900 truncate w-full mt-1 leading-tight"
                  style={{ fontSize: 11 }}
                >
                  {league.name}
                </div>
              </div>

              {/* Bottom: compact stats row OR active-only filter label */}
              <div className="w-full">
                <div className="flex justify-between items-center w-full leading-none">
                  <div className="flex items-baseline gap-0.5">
                    <span
                      className="font-bold tabular-nums"
                      style={{ fontSize: 12, color: ACTIVE_BORDER }}
                    >
                      {league.rank != null ? `#${league.rank}` : '—'}
                    </span>
                    <span className="text-gray-500" style={{ fontSize: 8 }}>
                      דירוג
                    </span>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span
                      className="font-bold tabular-nums text-gray-900"
                      style={{ fontSize: 12 }}
                    >
                      {league.memberCount != null
                        ? league.memberCount.toLocaleString('he-IL')
                        : '—'}
                    </span>
                    <span className="text-gray-500" style={{ fontSize: 8 }}>
                      חברים
                    </span>
                  </div>
                </div>
                {active && (
                  <div
                    className="text-center text-gray-500 truncate mt-0.5"
                    style={{ fontSize: 9 }}
                  >
                    {activeFilterLabel}
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Trailing "+" card — create / join a new league */}
        <Link
          href={createHref}
          aria-label="הצטרף לליגה"
          className="snap-start flex-shrink-0 flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-[0.97]"
          style={{
            width: 110,
            height: 110,
            borderRadius: 14,
            padding: 8,
            border: '1.5px dashed #D1D5DB',
            backgroundColor: '#F9FAFB',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center mb-1 border border-dashed border-gray-300">
            <Plus className="w-4 h-4 text-gray-400" />
          </div>
          <span style={{ fontSize: 11 }} className="font-medium">
            הצטרף לליגה
          </span>
        </Link>
      </div>
    </div>
  );
}
