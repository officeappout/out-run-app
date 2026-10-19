'use client';

import React from 'react';
import { NeighborhoodLeaderboard, GroupLeagueStatsBoard } from '@/app/community/CommunityWidgets';
import type { LeaguesVM } from '../leagues-vm';

export function LeagueSegment({ vm, groupId }: { vm: LeaguesVM; groupId: string }) {
  const {
    featureFlags,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    setActiveMyEntry,
    handleMyModeChange,
  } = vm;
  return (
    <div className="space-y-4" dir="rtl">
      {/* Home v2: the group's own points / steps points / km (server aggregates). */}
      {featureFlags.enableHomeV2 && <GroupLeagueStatsBoard groupId={groupId} timeWindow={leaderboardTimeWindow} />}
      <NeighborhoodLeaderboard
        scope="league"
        scopeId={groupId}
        isLeagueActive={true}
        category={leaderboardCategory}
        setCategory={setLeaderboardCategory}
        timeWindow={leaderboardTimeWindow}
        setTimeWindow={setLeaderboardTimeWindow}
        genderFilter={leaderboardGender}
        setGenderFilter={setLeaderboardGender}
        onMyEntryChange={setActiveMyEntry}
        onMyModeChange={handleMyModeChange}
      />
    </div>
  );
}
