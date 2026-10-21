'use client';

import React from 'react';
import { formatKm } from '@/features/arena/components/league-board-logic';
import { formatLeaderboardScore } from '@/features/arena/components/format-leaderboard-score';
import { CATEGORY_UNIT_LABEL_KEYS } from '@/features/arena/components/scope-category-unit-label';
import { timeWindowPhrase } from '@/app/community/_lib/community-logic';
import type { LeaguesVM } from './leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// "התרומה שלך" dark contribution card (mockup, Screens 2/3). Left side =
// your own real activity total, reusing activeMyEntry/activeMyMode
// already bubbled from the Individuals tab (zero extra fetch) — note this
// reflects whichever metric was last selected there, which can lag behind
// Groups mode's own `leaderboardCategory` filter since nothing here fetches
// your personal total pre-filtered to it; a fully metric-synced version
// would need a small new fetch, parked alongside the other per-metric
// follow-ups. Right side = your scope's real rank, bubbled from
// ScopeBattleCard's existing getScopeCompetitionLeaderboard fetch.
export function ScopeContributionCard({ vm, scopeTypeLabel }: { vm: LeaguesVM; scopeTypeLabel: string }) {
  const {
    featureFlags,
    myScopeKm,
    myScopeKmGranularity,
    myScopeKmKey,
    leaderboardCategory,
    leaderboardTimeWindow,
    activeMyEntry,
    activeMyMode,
    activeMyIsSegment,
    activeScopeEntry,
  } = vm;
  const t = useT(community);
  if (!activeScopeEntry) return null;
  const windowPhrase = timeWindowPhrase(leaderboardTimeWindow, t);
  const myKm = myScopeKm && myScopeKm.key === myScopeKmKey && leaderboardTimeWindow !== 'daily' ? myScopeKm.km : 0;
  return (
    <div
      className="rounded-v2-card p-4 text-v2-ink relative overflow-hidden mb-3 border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb]"
      dir="rtl"
    >
      <div
        aria-hidden
        className="absolute -top-8 -left-8 w-36 h-36 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,186,247,0.14), transparent 70%)' }}
      />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px]" style={{ color: '#64748b' }}>
            {t('communityPage.contribution.title', { phrase: windowPhrase, scope: activeScopeEntry.scopeName })}
          </p>
          <p className="text-lg font-black mt-0.5 truncate text-v2-deep tabular-nums">
            {activeMyEntry
              ? formatLeaderboardScore(activeMyEntry.totalCredit, activeMyMode, activeMyIsSegment, t)
              : t(CATEGORY_UNIT_LABEL_KEYS[leaderboardCategory])}
          </p>
          {featureFlags.enableHomeV2 && myKm > 0 && (
            <p className="mt-0.5 truncate whitespace-nowrap text-[12.5px] font-bold text-v2-ink-2 tabular-nums">
              {t('communityPage.contribution.km', { km: formatKm(myKm), granularity: myScopeKmGranularity, phrase: windowPhrase })}
            </p>
          )}
        </div>
        <div
          className="text-center rounded-v2-tile px-3 py-1.5 flex-shrink-0 bg-white shadow-v2-ring"
        >
          <p className="text-lg font-black leading-none tabular-nums">#{activeScopeEntry.rank}</p>
          <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>{scopeTypeLabel}</p>
        </div>
      </div>
    </div>
  );
}
