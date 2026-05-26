'use client';

/**
 * BadgeDisplay — compact achievement badge grid for the profile DashboardTab.
 *
 * Compact mode (default): shows the first `maxVisible` earned achievement cards
 * in a row, plus a "+N more" pill that opens the full AchievementSheet.
 *
 * The component is purely presentational: it receives `unlockedAchievements`
 * and `onViewAll` as props.
 */

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import clsx from 'clsx';
import { ACHIEVEMENT_DEFINITIONS } from '../config/achievement-definitions';
import {
  TIER_COLORS,
  TIER_EMOJI,
  TIER_ORDER,
} from '../types/achievement.types';
import {
  getHighestUnlockedTier,
  isOneTimeUnlocked,
} from '../services/achievement.service';
import type { UnlockedAchievementsMap, TierKey } from '../types/achievement.types';

interface BadgeDisplayProps {
  unlockedAchievements: UnlockedAchievementsMap;
  /** Called when user taps "+N more" or "כל ההישגים" */
  onViewAll: () => void;
  /** Number of badges to show in compact row before collapsing (default 6) */
  maxVisible?: number;
}

interface EarnedBadge {
  id: string;
  emoji: string;
  name_he: string;
  tier?: TierKey;
}

function buildEarnedBadges(unlocked: UnlockedAchievementsMap): EarnedBadge[] {
  const result: EarnedBadge[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (def.type === 'one_time') {
      if (isOneTimeUnlocked(def.id, unlocked)) {
        result.push({ id: def.id, emoji: def.emoji, name_he: def.name_he });
      }
    } else {
      const tier = getHighestUnlockedTier(def.id, unlocked);
      if (tier) {
        result.push({ id: def.id, emoji: def.emoji, name_he: def.name_he, tier });
      }
    }
  }

  // Sort: most recently unlocked first (using key lexicographic order as proxy)
  return result;
}

function BadgePill({ badge }: { badge: EarnedBadge }) {
  const tierColors = badge.tier ? TIER_COLORS[badge.tier] : null;

  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-1 px-2 py-1.5 rounded-2xl border min-w-[56px]',
        tierColors
          ? [tierColors.bg, tierColors.border]
          : 'bg-emerald-50 border-emerald-200',
      )}
    >
      <span className="text-xl leading-none">{badge.emoji}</span>
      {badge.tier && (
        <span className="text-[9px] font-semibold leading-none">
          {TIER_EMOJI[badge.tier]}
        </span>
      )}
      <span className="text-[9px] text-gray-600 font-hebrew text-center leading-snug max-w-[48px] truncate">
        {badge.name_he}
      </span>
    </div>
  );
}

export function BadgeDisplay({
  unlockedAchievements,
  onViewAll,
  maxVisible = 6,
}: BadgeDisplayProps) {
  const earned = buildEarnedBadges(unlockedAchievements);
  const visible = earned.slice(0, maxVisible);
  const remaining = earned.length - visible.length;

  if (earned.length === 0) {
    return (
      <button
        type="button"
        onClick={onViewAll}
        className="w-full flex flex-col items-center gap-2 py-4 rounded-2xl border border-dashed border-gray-200 text-gray-400"
        dir="rtl"
      >
        <Trophy className="w-7 h-7" />
        <p className="text-xs font-hebrew">אין הישגים עדיין — התחל לאמן!</p>
      </button>
    );
  }

  return (
    <div dir="rtl" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {visible.map((badge) => (
        <BadgePill key={`${badge.id}_${badge.tier ?? 'ot'}`} badge={badge} />
      ))}

      {remaining > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl border border-gray-200 bg-gray-50 min-w-[56px] h-full"
        >
          <span className="text-sm font-bold text-gray-600">+{remaining}</span>
          <span className="text-[9px] text-gray-400 font-hebrew">עוד</span>
        </button>
      )}

      {remaining === 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl border border-gray-200 bg-gray-50 min-w-[64px] h-full"
        >
          <Trophy className="w-4 h-4 text-gray-400" />
          <span className="text-[9px] text-gray-400 font-hebrew">כולם</span>
        </button>
      )}
    </div>
  );
}
