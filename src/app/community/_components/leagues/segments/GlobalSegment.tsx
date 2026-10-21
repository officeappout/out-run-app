'use client';

import React from 'react';
import { NeighborhoodLeaderboard, GroupLeaderboard, ScopeCompetitionLeaderboard, ScopeBattleCard } from '@/app/community/CommunityWidgets';
import { CompetitionToggle } from '../CompetitionToggle';
import { GroupAxisChooser } from '../GroupAxisChooser';
import { ScopeContributionCard } from '../ScopeContributionCard';
import type { LeaguesVM } from '../leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

export function GlobalSegment({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    authority,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    setActiveMyEntry,
    handleMyModeChange,
    setActiveScopeEntry,
    competitionMode,
    globalGroupAxis,
    setGlobalGroupAxis,
  } = vm;
  const t = useT(community);
  return (
    <div className="space-y-4" dir="rtl">
      {/* יחידים | קבוצות toggle — mirrors city + org segments */}
      <CompetitionToggle vm={vm} />

      {competitionMode === 'individual' ? (
        <NeighborhoodLeaderboard
          scope="global"
          scopeId={null}
          scopeLabel={t('communityPage.global.scopeLabel')}
          isLeagueActive={true}
          isGlobal={true}
          bypassSocialGate={true}
          ageGroup={access.ageGroup}
          category={leaderboardCategory}
          setCategory={setLeaderboardCategory}
          timeWindow={leaderboardTimeWindow}
          setTimeWindow={setLeaderboardTimeWindow}
          genderFilter={leaderboardGender}
          setGenderFilter={setLeaderboardGender}
          onMyEntryChange={setActiveMyEntry}
          onMyModeChange={handleMyModeChange}
        />
      ) : (
        <>
          {/* 16.08.2026 IA fix: ערים (city-vs-city, always nationwide —
              see the note above cityGroupAxis) now lives here instead of
              nested under "ליגת העיר", where it was misleading. */}
          <GroupAxisChooser vm={vm} axis={globalGroupAxis} setAxis={setGlobalGroupAxis} options={['city', 'group']} />
          {globalGroupAxis === 'city' && (
            <>
              <ScopeContributionCard vm={vm} scopeTypeLabel={t('communityPage.scopeType.city')} />
              <ScopeBattleCard
                granularity="city"
                timeWindow={leaderboardTimeWindow}
                myScopeId={authority?.id ?? null}
                category={leaderboardCategory}
                genderFilter={leaderboardGender}
                onMyScopeEntryChange={setActiveScopeEntry}
              />
              <ScopeCompetitionLeaderboard
                granularity="city"
                timeWindow={leaderboardTimeWindow}
                category={leaderboardCategory}
                onCategoryChange={setLeaderboardCategory}
                genderFilter={leaderboardGender}
              />
            </>
          )}
          {globalGroupAxis === 'group' && (
            <GroupLeaderboard
              scope="global"
              scopeId={null}
              timeWindow={leaderboardTimeWindow}
              genderFilter={leaderboardGender}
            />
          )}
        </>
      )}
    </div>
  );
}
