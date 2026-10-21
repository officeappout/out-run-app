'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { CommunityTopTab } from '../_lib/community-constants';

/**
 * Top-level tabs (פיד / ליגות) — underline style (matches
 * ExerciseReplacementModal). No pill chrome, no background fill — just text
 * with a 2px bottom accent on the active item and a hairline rule below the
 * row. Rendered inside the AppHeader's children slot.
 */
export function CommunityTopTabs({
  topTab,
  setTopTab,
  leaguesFirst,
  isFeedTabAvailable,
  enableLeagues,
}: {
  topTab: CommunityTopTab;
  setTopTab: (next: CommunityTopTab) => void;
  leaguesFirst: boolean;
  isFeedTabAvailable: boolean;
  enableLeagues: boolean;
}) {
  const t = useT(community);
  const leaguesTabButton = (
    <button
      type="button"
      role="tab"
      aria-selected={topTab === 'leagues'}
      onClick={() => setTopTab('leagues')}
      className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
        topTab === 'leagues'
          ? 'text-[#00ADEF] border-[#00ADEF]'
          : 'text-slate-600 dark:text-slate-500 border-transparent'
      }`}
    >
      {t('communityPage.tabs.leagues')}
    </button>
  );

  return (
    <div className="max-w-md mx-auto px-5" dir="rtl">
      <div
        className="flex border-b border-slate-100 dark:border-slate-800"
        role="tablist"
        aria-label={t('communityPage.tabs.label')}
      >
        {/* v2: ליגות first (the default tab), then פיד. */}
        {leaguesFirst && leaguesTabButton}
        {isFeedTabAvailable && (
          <button
            type="button"
            role="tab"
            aria-selected={topTab === 'feed'}
            onClick={() => setTopTab('feed')}
            className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
              topTab === 'feed'
                ? 'text-[#00ADEF] border-[#00ADEF]'
                : 'text-slate-600 dark:text-slate-500 border-transparent'
            }`}
          >
            {t('communityPage.tabs.feed')}
          </button>
        )}
        {!leaguesFirst && enableLeagues && leaguesTabButton}
      </div>
    </div>
  );
}
