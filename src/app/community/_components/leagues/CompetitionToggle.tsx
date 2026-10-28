'use client';

import React from 'react';
import type { LeaguesVM } from './leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/** יחידים | קבוצות toggle (hidden in Home v2 — the v2 tabs decide). */
export function CompetitionToggle({ vm }: { vm: LeaguesVM }) {
  const t = useT(community);
  const {
    featureFlags,
    competitionMode,
    setCompetitionMode,
  } = vm;
  if (featureFlags.enableHomeV2) return null;
  return (
    <div
      className="flex p-1 rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
      role="tablist"
      aria-label={t('competitionToggle.label')}
    >
      {(['individual', 'group'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={competitionMode === mode}
          onClick={() => setCompetitionMode(mode)}
          className={`flex-1 h-9 rounded-full text-[14px] font-extrabold text-center transition-colors ease-v2 ${
            competitionMode === mode
              ? 'bg-white text-v2-ink shadow-v2-ring'
              : 'text-v2-muted'
          }`}
        >
          {mode === 'individual' ? t('competitionToggle.individual') : t('competitionToggle.group')}
        </button>
      ))}
    </div>
  );
}
