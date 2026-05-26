'use client';

import React from 'react';
import type { Authority } from '@/types/admin-types';
import NeighborhoodLeaderboard from './NeighborhoodLeaderboard';
import type {
  LeaderboardCategory,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  LeaderboardEntry,
} from '@/features/arena/services/ranking.service';

interface CityArenaViewProps {
  authority: Authority;
  /** Controlled leaderboard filters — forwarded to the embedded
   *  NeighborhoodLeaderboard so the parent (community/page.tsx) can drive
   *  filter state from the league carousel. All optional — when omitted the
   *  leaderboard falls back to its own internal state. */
  category?: LeaderboardCategory;
  setCategory?: (value: LeaderboardCategory) => void;
  timeWindow?: LeaderboardTimeWindow;
  setTimeWindow?: (value: LeaderboardTimeWindow) => void;
  genderFilter?: LeaderboardGenderFilter;
  setGenderFilter?: (value: LeaderboardGenderFilter) => void;
  onMyEntryChange?: (entry: LeaderboardEntry | null) => void;
}

export default function CityArenaView({
  authority,
  category,
  setCategory,
  timeWindow,
  setTimeWindow,
  genderFilter,
  setGenderFilter,
  onMyEntryChange,
}: CityArenaViewProps) {
  // Normalize the raw Firestore string defensively — handles 'Soft Launch',
  // 'soft_launch', 'SOFT_LAUNCH', etc. stored by older admin writes.
  const rawMode     = (authority.gatingMode ?? '').toLowerCase().replace(/\s+/g, '_');
  const isSoftLaunch = rawMode === 'soft_launch';

  return (
    <div className="space-y-5" dir="rtl">
      {/* City Identity Banner removed — the active league card in the
          /community carousel already shows the authority logo, name, and
          member count. The dark banner here was redundant and clashed with
          the new light leaderboard surface. */}

      {/* ── League / Leaderboard ─────────────────────────────── */}
      <NeighborhoodLeaderboard
        scope="city"
        scopeId={authority.id}
        scopeLabel={authority.name}
        bypassSocialGate={isSoftLaunch}
        category={category}
        setCategory={setCategory}
        timeWindow={timeWindow}
        setTimeWindow={setTimeWindow}
        genderFilter={genderFilter}
        setGenderFilter={setGenderFilter}
        onMyEntryChange={onMyEntryChange}
      />

      {/* Upcoming Events section removed — events live in /search now,
          not in the leagues tab. */}

      {/* Active Groups section removed — groups belong to the feed tab
          (CommunityCircles + GroupDetailsDrawer), not the leagues tab. */}
    </div>
  );
}
