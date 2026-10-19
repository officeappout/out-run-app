'use client';

import React from 'react';
import { Trees } from 'lucide-react';
import IconTile from '@/components/ui/v2/IconTile';
import { NeighborhoodLeaderboard } from '@/app/community/CommunityWidgets';
import type { LeaguesVM } from '../leagues-vm';

export function ParkSegment({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    setActiveMyEntry,
    handleMyModeChange,
  } = vm;
  if (!access.preferredParkId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
        <IconTile icon={Trees} tone="accent" size="lg" className="mb-3" />
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
          עוד לא התאמנת בפארק
        </p>
        <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
          כשתתאמנו ליד פארק, הדירוג שלו יופיע כאן אוטומטית
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Park identity row removed — the active league card and the small
          label below the carousel already show the park name + 🌳. */}

      <NeighborhoodLeaderboard
        scope="park"
        scopeId={access.preferredParkId}
        scopeLabel={access.preferredParkName ?? 'הפארק שלך'}
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
