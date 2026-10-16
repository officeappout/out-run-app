'use client';

/**
 * Fixture-driven preview of the /community?tab=leagues surface (design v2
 * rollout). Renders the real presentational views — no Firebase reads, no
 * auth. Query params:
 *   ?state=full    you mid-table (#14 of 24, outside the top-10 visible range)
 *   ?state=top     you are #1
 *   ?state=sparse  3 participants
 *   ?state=empty   nobody yet
 *   ?state=battle  neighborhood head-to-head card + neighborhood standings
 *   ?state=groups  group-vs-group list
 *   ?state=units   unit-vs-unit table (reserve league)
 *   ?mode=general|steps|distance   metric (default general)
 *   ?peek=1 / ?how=1               open the row peek / "how points work" sheet
 */

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NeighborhoodLeaderboardView } from '@/features/arena/components/NeighborhoodLeaderboard';
import { ScopeBattleCardView } from '@/features/arena/components/ScopeBattleCard';
import { ScopeCompetitionLeaderboardView } from '@/features/arena/components/ScopeCompetitionLeaderboard';
import { GroupLeaderboardView } from '@/features/arena/components/GroupLeaderboard';
import { UnitLeagueTableView } from '@/features/arena/components/UnitLeagueTable';
import { LeagueSelectorButton } from '@/features/arena/components/LeaguesTabChrome';
import type { LeaderboardMode } from '@/features/arena/components/format-leaderboard-score';
import type {
  LeaderboardEntry,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  ScopeCompetitionEntry,
  GroupCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import type { UnitLeagueRange, UnitLeagueResult } from '@/features/arena/services/unit-league.service';
import type { LeagueCardData } from '@/features/arena/components/LeagueCarousel';

const NAMES = [
  'נועה כהן', 'איתי לוי', 'מאיה פרץ', 'יונתן מזרחי', 'שירה אברהם', 'עומר ביטון',
  'תמר דהן', 'אורי פרידמן', 'הילה אזולאי', 'דניאל גבאי', 'רוני שפירא', 'גל חדד',
  'ליאור קפלן', 'דוד שחר', 'עדי מלכה', 'אלון סגל', 'מיכל עמר', 'יואב רוזן',
  'ענבל בן דוד', 'אסף וקנין', 'קרן טל', 'נדב אוחיון', 'שני ברק', 'רועי נחום',
];

const ME = 'דוד שחר';

function buildEntries(count: number, myRank: number | null, mode: LeaderboardMode): LeaderboardEntry[] {
  const top = mode === 'steps' ? 14200 : mode === 'distance' ? 48.6 : 21;
  const step = mode === 'steps' ? 430 : mode === 'distance' ? 1.7 : 0.8;
  const out: LeaderboardEntry[] = [];
  let nameIdx = 0;
  for (let i = 0; i < count; i++) {
    const rank = i + 1;
    const isMe = rank === myRank;
    const name = isMe ? ME : NAMES.filter((n) => n !== ME)[nameIdx++ % (NAMES.length - 1)];
    const raw = Math.max(0, top - step * i);
    const value = mode === 'distance' ? Math.round(raw * 10) / 10 : Math.round(raw);
    out.push({
      rank,
      uid: isMe ? 'me' : `u${rank}`,
      name,
      totalCredit: value,
      workoutCount: Math.max(1, 9 - Math.floor(i / 3)),
      isCurrentUser: isMe,
    });
  }
  return out;
}

const NEIGHBORHOODS: ScopeCompetitionEntry[] = [
  { rank: 1, scopeId: 'n1', scopeName: 'רמת אביב', totalScore: 18420, activeMemberCount: 64 },
  { rank: 2, scopeId: 'n2', scopeName: 'פלורנטין', totalScore: 16210, activeMemberCount: 51 },
  { rank: 3, scopeId: 'n3', scopeName: 'הצפון הישן', totalScore: 15870, activeMemberCount: 47 },
  { rank: 4, scopeId: 'n4', scopeName: 'נווה צדק', totalScore: 12440, activeMemberCount: 33 },
  { rank: 5, scopeId: 'n5', scopeName: 'יד אליהו', totalScore: 9810, activeMemberCount: 29 },
  { rank: 6, scopeId: 'n6', scopeName: 'רמת החייל', totalScore: 7120, activeMemberCount: 21 },
];

const GROUPS: GroupCompetitionEntry[] = [
  { rank: 1, groupId: 'g1', groupName: 'רצי הבוקר', totalScore: 9200, avgScore: 412, activeMemberCount: 22 },
  { rank: 2, groupId: 'g2', groupName: 'קליסתניקס פארק הירקון', totalScore: 7600, avgScore: 380, activeMemberCount: 20 },
  { rank: 3, groupId: 'g3', groupName: 'אמהות בתנועה', totalScore: 5100, avgScore: 340, activeMemberCount: 15 },
  { rank: 4, groupId: 'g4', groupName: 'הליכת ערב', totalScore: 2900, avgScore: 290, activeMemberCount: 10 },
  { rank: 5, groupId: 'g5', groupName: 'כושר 60+', totalScore: 1300, avgScore: 1, activeMemberCount: 1 },
];

const UNITS: UnitLeagueResult = {
  entries: [
    { directoryId: 'd1', unitId: 'u9255', name: 'גדוד 9255', parentBreadcrumb: 'חטיבה 55', iconUrl: null, avgSteps: 11240, activeParticipantCount: 38, isMyUnit: false },
    { directoryId: 'd2', unitId: 'u7008', name: 'גדוד 7008', parentBreadcrumb: 'חטיבה 55', iconUrl: null, avgSteps: 10380, activeParticipantCount: 41, isMyUnit: true },
    { directoryId: 'd3', unitId: 'u6310', name: 'גדוד 6310', parentBreadcrumb: 'חטיבה 55', iconUrl: null, avgSteps: 8920, activeParticipantCount: 26, isMyUnit: false },
    { directoryId: 'd4', unitId: 'u8101', name: 'גדוד 8101', parentBreadcrumb: 'חטיבה 55', iconUrl: null, avgSteps: 7410, activeParticipantCount: 19, isMyUnit: false },
  ],
  updatedAt: new Date(Date.now() - 23 * 60 * 1000),
  myUnitBelowFloor: null,
};

const CITY_CARD: LeagueCardData = {
  key: 'city',
  name: 'ליגת העיר',
  subtitle: 'תל אביב-יפו',
  emoji: '🏙️',
  memberCount: 24,
  rank: null,
};

const noop = () => {};

export default function LeaguesPreview() {
  const params = useSearchParams();
  const state = params.get('state') ?? 'full';
  const mode = (params.get('mode') as LeaderboardMode | null) ?? 'general';
  const peek = params.get('peek') === '1';
  const how = params.get('how') === '1';

  const [localMode, setLocalMode] = useState<LeaderboardMode>(mode);
  const [timeWindow, setTimeWindow] = useState<LeaderboardTimeWindow>('weekly');
  const [genderFilter, setGenderFilter] = useState<LeaderboardGenderFilter>('all');
  const [opponent, setOpponent] = useState<string>('n2');
  const [range, setRange] = useState<UnitLeagueRange>('my_brigade_battalions');

  const fixture = (() => {
    switch (state) {
      case 'top': return { entries: buildEntries(18, 1, localMode), myRank: 1, total: 18 };
      case 'sparse': return { entries: buildEntries(3, 2, localMode), myRank: 2, total: 3 };
      case 'empty': return { entries: [] as LeaderboardEntry[], myRank: null, total: 0 };
      default: return { entries: buildEntries(24, 14, localMode), myRank: 14, total: 24 };
    }
  })();
  const myEntry = fixture.entries.find((e) => e.isCurrentUser) ?? null;

  const showBoard = state === 'full' || state === 'top' || state === 'sparse' || state === 'empty';

  return (
    <div dir="rtl" className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28">
        <LeagueSelectorButton
          isLoading={false}
          activeCard={CITY_CARD}
          filterLabel="כללי • שבועי"
          rank={showBoard ? myEntry?.rank : undefined}
          expanded={false}
          onOpen={noop}
        />

        {showBoard && (
          <NeighborhoodLeaderboardView
            scope="city"
            scopeLabel="תל אביב-יפו"
            entries={fixture.entries}
            myEntry={myEntry}
            totalParticipants={fixture.total}
            isLoading={false}
            onRefresh={noop}
            localMode={localMode}
            onSetMode={setLocalMode}
            runSegment="all"
            setRunSegment={noop}
            strengthProgramId={null}
            setStrengthProgram={noop}
            programs={[]}
            timeWindow={timeWindow}
            setTimeWindow={setTimeWindow}
            genderFilter={genderFilter}
            setGenderFilter={setGenderFilter}
            shouldBlur={false}
            socialUnlocked
            myStreak={6}
            initialPeekUid={peek ? 'u3' : undefined}
            initialHowOpen={how}
          />
        )}

        {state === 'battle' && (
          <div className="space-y-4">
            <ScopeBattleCardView
              myScopeId="n3"
              myEntry={NEIGHBORHOODS[2]}
              entries={NEIGHBORHOODS}
              opponentScopeId={opponent}
              onSelectOpponent={setOpponent}
              category="overall"
              timeWindow={timeWindow}
            />
            <ScopeCompetitionLeaderboardView
              granularity="neighborhood"
              timeWindow={timeWindow}
              category="overall"
              isLoading={false}
              error={null}
              entries={NEIGHBORHOODS}
              onRefresh={noop}
            />
          </div>
        )}

        {state === 'groups' && (
          <GroupLeaderboardView timeWindow={timeWindow} isLoading={false} error={null} entries={GROUPS} onRefresh={noop} />
        )}

        {state === 'units' && (
          <UnitLeagueTableView range={range} onRangeChange={setRange} isLoading={false} result={UNITS} onRefresh={noop} />
        )}

      </div>
    </div>
  );
}
