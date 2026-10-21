'use client';

import React from 'react';
import { GroupCard, NeighborhoodLeaderboard, GroupLeaderboard, SchoolOutreachCard } from '@/app/community/CommunityWidgets';
import { CompetitionToggle } from '../CompetitionToggle';
import type { LeaguesVM } from '../leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

export function OrgSegment({ vm }: { vm: LeaguesVM }) {
  const {
    access,
    groups,
    leaderboardCategory,
    setLeaderboardCategory,
    leaderboardTimeWindow,
    setLeaderboardTimeWindow,
    leaderboardGender,
    setLeaderboardGender,
    setActiveMyEntry,
    handleMyModeChange,
    competitionMode,
  } = vm;
  const t = useT(community);
  const orgGroups = groups.filter(
    (g) => g.category === 'calisthenics' || g.category === 'other',
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Org identity row removed — the active league card and the small
          label below the carousel already show the org name + emoji. */}

      {access.orgType && (
        <SchoolOutreachCard
          schoolName={access.orgName ?? t('communityPage.org.outreachName', { orgType: access.orgType })}
          orgType={
            access.orgType === 'work'
              ? 'company'
              : access.orgType === 'youth_movement'
                ? 'youth_movement'
                : 'school'
          }
        />
      )}

      {/* יחידים | קבוצות toggle */}
      <CompetitionToggle vm={vm} />

      {competitionMode === 'individual' ? (
        <NeighborhoodLeaderboard
          scope={access.orgType === 'work' ? 'tenant' : 'school'}
          scopeId={access.orgId}
          scopeLabel={access.orgName ?? t('communityPage.org.scopeLabelFallback')}
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
      ) : (
        <GroupLeaderboard
          scope="school"
          scopeId={access.orgId ?? ''}
          timeWindow={leaderboardTimeWindow}
        />
      )}

      {orgGroups.length > 0 && competitionMode === 'individual' && (
        <div className="space-y-2.5">
          {orgGroups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
