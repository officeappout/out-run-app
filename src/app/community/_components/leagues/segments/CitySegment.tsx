'use client';

import React from 'react';
import { LeagueFilterSheet } from '@/app/community/CommunityOverlays';
import { CityArenaView, NeighborhoodLeaderboard, GroupLeaderboard, ScopeCompetitionLeaderboard, ScopeBattleCard, MunicipalPressureCard } from '@/app/community/CommunityWidgets';
import { CompetitionToggle } from '../CompetitionToggle';
import { GroupAxisChooser } from '../GroupAxisChooser';
import { ScopeContributionCard } from '../ScopeContributionCard';
import { NeighborhoodInviteCTA } from '../NeighborhoodInviteCTA';
import { NeighborhoodSetupCTA } from '../NeighborhoodSetupCTA';
import type { LeaguesVM } from '../leagues-vm';

export function CitySegment({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    authority,
    isLeagueActive,
    arenaLoading,
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
    cityGroupAxis,
    setCityGroupAxis,
    leagueFilterSheetOpen,
    setLeagueFilterSheetOpen,
  } = vm;
  if (arenaLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-500 animate-pulse">טוען נתוני עיר...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {!isLeagueActive && (
        <>
          <MunicipalPressureCard
            cityName={access.cityName ?? 'העיר שלך'}
            authority={authority}
          />

          <NeighborhoodLeaderboard
            scope="city"
            scopeId={access.cityAuthorityId}
            scopeLabel={access.cityName ?? 'עיר'}
            isLeagueActive={false}
            category={leaderboardCategory}
            setCategory={setLeaderboardCategory}
            timeWindow={leaderboardTimeWindow}
            setTimeWindow={setLeaderboardTimeWindow}
            genderFilter={leaderboardGender}
            setGenderFilter={setLeaderboardGender}
            onMyEntryChange={setActiveMyEntry}
          onMyModeChange={handleMyModeChange}
          />
        </>
      )}

      {isLeagueActive && authority && (
        <>
          {/* יחידים | קבוצות toggle */}
          <CompetitionToggle vm={vm} />

          {competitionMode === 'individual' ? (
            <CityArenaView
              authority={authority}
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
              <GroupAxisChooser vm={vm} axis={cityGroupAxis} setAxis={setCityGroupAxis} options={['neighborhood', 'group']} />
              {cityGroupAxis === 'neighborhood' && (
                <>
                  {access.hasNeighborhoodAccess ? (
                    <>
                      <ScopeContributionCard vm={vm} scopeTypeLabel="השכונה שלך" />
                      <ScopeBattleCard
                        granularity="neighborhood"
                        timeWindow={leaderboardTimeWindow}
                        myScopeId={access.neighborhoodAuthorityId}
                        cityAuthorityId={authority.id}
                        category={leaderboardCategory}
                        genderFilter={leaderboardGender}
                        onMyScopeEntryChange={setActiveScopeEntry}
                      />
                    </>
                  ) : (
  <NeighborhoodSetupCTA vm={vm} />
  )}
                  <ScopeCompetitionLeaderboard
                    granularity="neighborhood"
                    timeWindow={leaderboardTimeWindow}
                    cityAuthorityId={authority.id}
                    category={leaderboardCategory}
                    onCategoryChange={setLeaderboardCategory}
                    genderFilter={leaderboardGender}
                  />
                  {access.hasNeighborhoodAccess && <NeighborhoodInviteCTA vm={vm} />}
                </>
              )}
              {cityGroupAxis === 'group' && (
                <GroupLeaderboard
                  scope="city"
                  scopeId={authority.id}
                  timeWindow={leaderboardTimeWindow}
                  genderFilter={leaderboardGender}
                />
              )}
            </>
          )}
        </>
      )}
      <LeagueFilterSheet
        isOpen={leagueFilterSheetOpen}
        onClose={() => setLeagueFilterSheetOpen(false)}
        genderFilter={leaderboardGender}
        onGenderFilterChange={setLeaderboardGender}
      />
    </div>
  );
}
