'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { FIRST_RUN_COACH } from '@/features/user/onboarding/services/first-run-tour';
import { BoardToggle } from '@/features/arena/components/LeagueBoard';
import { ScopeCompetitionLeaderboard, ScopeBattleCard, NationalLeagueBoard, InviteBonusCard, CityChallengeCard } from '@/app/community/CommunityWidgets';
import type { LeagueTabV2 } from '@/app/community/_lib/community-constants';
import { leagueCalendarChips } from '@/app/community/_lib/community-logic';
import { ScopeContributionCard } from './ScopeContributionCard';
import { NeighborhoodSetupCTA } from './NeighborhoodSetupCTA';
import { ReserveSegment } from './segments/ReserveSegment';
import { LeaguesTab } from './LeaguesTab';
import type { LeaguesVM } from './leagues-vm';
import { useT } from '@/hooks/useT';
import { community, type CommunityKey } from '@/messages/ns/community';

/** Home v2 leagues: month / week-close chips, the four tabs, each tab's boards. */
export function LeaguesTabV2({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    authority,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    leaderboardGender,
    activeScopeEntry,
    setActiveScopeEntry,
    setCompetitionMode,
    leagueTabV2,
    setLeagueTabV2,
    setScopePointsOpen,
    setGroupWalkOpen,
    hoodScopeV2,
    setHoodScopeV2,
  } = vm;
  const t = useT(community);
  const tabs: { id: LeagueTabV2; labelKey: CommunityKey }[] = [
    { id: 'people', labelKey: 'communityPage.leagues.v2.tab.people' },
    { id: 'neighborhoods', labelKey: 'communityPage.leagues.v2.tab.neighborhoods' },
    { id: 'settlements', labelKey: 'communityPage.leagues.v2.tab.settlements' },
    ...(access.hasUnitLeagueAccess ? [{ id: 'units' as const, labelKey: 'communityPage.leagues.v2.tab.units' as const }] : []),
  ];
  // The Israeli week ends on Saturday.
  const { month, weekCloses } = leagueCalendarChips(new Date(), t);
  const pick = (tab: LeagueTabV2) => {
    setLeagueTabV2(tab);
    if (tab === 'people') setCompetitionMode('individual');
    if (tab === 'units') setCompetitionMode('group');
  };
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex h-8 items-center rounded-full bg-v2-tint px-3 text-[12.5px] font-extrabold text-v2-deep">
          {t('communityPage.leagues.v2.month', { month })}
        </span>
        <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-[12.5px] font-extrabold text-v2-ink-2 shadow-v2-ring">
          {weekCloses}
        </span>
        {leagueTabV2 !== 'people' && (
          <button
            type="button"
            onClick={() => setScopePointsOpen(true)}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Info size={14} strokeWidth={2.6} aria-hidden />
            {t('communityPage.leagues.v2.pointsHowTo')}
          </button>
        )}
      </div>

      <div
        className="sticky top-0 z-[3] -mx-4 bg-v2-surface/95 px-4 pb-1 pt-1 backdrop-blur-sm"
        role="tablist"
        aria-label={t('communityPage.leagues.v2.tabsLabel')}
        data-coach={FIRST_RUN_COACH.communityLeague}
      >
        <div className="grid rounded-full bg-white p-1 shadow-v2-ring" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const on = tab.id === leagueTabV2;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(tab.id)}
                className={`h-10 whitespace-nowrap rounded-full text-[14px] font-extrabold transition-colors duration-200 ease-v2 ${
                  on ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta' : 'text-v2-ink-2'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {leagueTabV2 === 'people' && <LeaguesTab vm={vm} />}

      {leagueTabV2 === 'neighborhoods' && (
        <div className="space-y-4">
          <BoardToggle
            label={t('communityPage.leagues.v2.where')}
            value={hoodScopeV2}
            onChange={setHoodScopeV2}
            options={[
              { id: 'city', label: access.cityName ? t('communityPage.leagues.v2.whereCity', { city: access.cityName }) : t('communityPage.leagues.v2.whereMyCity') },
              { id: 'national', label: t('communityPage.leagues.v2.whereNational') },
            ]}
          />
          {hoodScopeV2 === 'city' ? (
            authority ? (
              <>
                {access.hasNeighborhoodAccess && <ScopeContributionCard vm={vm} scopeTypeLabel={t('communityPage.scopeType.neighborhood')} />}
                {access.hasNeighborhoodAccess ? (
                  <ScopeBattleCard
                    granularity="neighborhood"
                    timeWindow={leaderboardTimeWindow}
                    myScopeId={access.neighborhoodAuthorityId}
                    cityAuthorityId={authority.id}
                    category={leaderboardCategory}
                    genderFilter={leaderboardGender}
                    onMyScopeEntryChange={setActiveScopeEntry}
                    onGroupWalk={() => setGroupWalkOpen(true)}
                  />
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
                <div data-coach={FIRST_RUN_COACH.communityInvite}>
                  <InviteBonusCard scopeName={activeScopeEntry?.scopeName ?? null} />
                </div>
              </>
            ) : (
  <NeighborhoodSetupCTA vm={vm} />
  )
          ) : (
            <NationalLeagueBoard
              mode="neighborhoods"
              timeWindow={leaderboardTimeWindow}
              category={leaderboardCategory}
              onCategoryChange={setLeaderboardCategory}
              genderFilter={leaderboardGender}
              myScopeIds={[access.neighborhoodAuthorityId]}
            />
          )}
        </div>
      )}

      {leagueTabV2 === 'settlements' && (
        <div className="space-y-4">
          {authority && <CityChallengeCard cityId={authority.id} cityName={access.cityName} />}
          {authority && <ScopeContributionCard vm={vm} scopeTypeLabel={t('communityPage.scopeType.city')} />}
          {authority && (
            <ScopeBattleCard
              granularity="city"
              timeWindow={leaderboardTimeWindow}
              myScopeId={authority.id}
              category={leaderboardCategory}
              genderFilter={leaderboardGender}
              onMyScopeEntryChange={setActiveScopeEntry}
              onGroupWalk={() => setGroupWalkOpen(true)}
            />
          )}
          <NationalLeagueBoard
            mode="settlements"
            timeWindow={leaderboardTimeWindow}
            category={leaderboardCategory}
            onCategoryChange={setLeaderboardCategory}
            genderFilter={leaderboardGender}
            myScopeIds={[authority?.id, access.neighborhoodAuthorityId]}
          />
        </div>
      )}

      {leagueTabV2 === 'units' && <ReserveSegment vm={vm} />}
    </div>
  );
}
