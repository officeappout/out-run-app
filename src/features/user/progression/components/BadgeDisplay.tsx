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

import React, { useState } from 'react';
import {
  Trophy,
  Lock,
  Footprints,
  Dumbbell,
  Flame,
  Users,
  Medal,
  MapPin,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { ACHIEVEMENT_DEFINITIONS } from '../config/achievement-definitions';
import {
  TIER_COLORS,
  TIER_EMOJI,
  TIER_ORDER,
  TIER_LABELS_HE,
} from '../types/achievement.types';
import {
  getHighestUnlockedTier,
  isOneTimeUnlocked,
} from '../services/achievement.service';
import type { UnlockedAchievementsMap, TierKey, AchievementCategory } from '../types/achievement.types';

interface BadgeDisplayProps {
  unlockedAchievements: UnlockedAchievementsMap;
  /** Called when user taps "+N more" or "כל ההישגים" */
  onViewAll: () => void;
  /** Number of badges to show in compact row before collapsing (default 6) */
  maxVisible?: number;
  /** Home v2 (enable_home_v2) look — 3-column grid of white cards. */
  v2?: boolean;
}

interface EarnedBadge {
  id: string;
  emoji: string;
  name_he: string;
  tier?: TierKey;
  category?: AchievementCategory;
}

function buildEarnedBadges(unlocked: UnlockedAchievementsMap): EarnedBadge[] {
  const result: EarnedBadge[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (def.type === 'one_time') {
      if (isOneTimeUnlocked(def.id, unlocked)) {
        result.push({ id: def.id, emoji: def.emoji, name_he: def.name_he, category: def.category });
      }
    } else {
      const tier = getHighestUnlockedTier(def.id, unlocked);
      if (tier) {
        result.push({ id: def.id, emoji: def.emoji, name_he: def.name_he, tier, category: def.category });
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

// ── v2 (enable_home_v2) ────────────────────────────────────────────────────

/** Category → lucide icon + activity colour (v2 uses icons, not emoji). */
const V2_CATEGORY_STYLE: Record<AchievementCategory, { Icon: React.ElementType; color: string }> = {
  running:     { Icon: Footprints, color: '#00c9f2' },
  strength:    { Icon: Dumbbell,   color: '#00baf7' },
  consistency: { Icon: Flame,      color: '#f59e0b' },
  social:      { Icon: Users,      color: '#8b5cf6' },
  leagues:     { Icon: Medal,      color: '#f59e0b' },
  map:         { Icon: MapPin,     color: '#84cc16' },
  special:     { Icon: Sparkles,   color: '#0284c7' },
};

function v2Style(category: AchievementCategory | undefined) {
  return (category && V2_CATEGORY_STYLE[category]) || { Icon: Trophy, color: '#00baf7' };
}

/** Definitions the user hasn't earned any tier of yet — shown muted with a lock. */
function buildLockedBadges(unlocked: UnlockedAchievementsMap): EarnedBadge[] {
  return ACHIEVEMENT_DEFINITIONS.filter((def) =>
    def.type === 'one_time'
      ? !isOneTimeUnlocked(def.id, unlocked)
      : !getHighestUnlockedTier(def.id, unlocked),
  ).map((def) => ({ id: def.id, emoji: def.emoji, name_he: def.name_he, category: def.category }));
}

function BadgeCardV2({ badge, locked, onClick }: { badge: EarnedBadge; locked: boolean; onClick: () => void }) {
  const { Icon, color } = v2Style(badge.category);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-2 rounded-[20px] bg-white px-2 pb-3 pt-3.5 text-center shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      {locked ? (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ backgroundColor: color }}>
          <Icon className="h-[22px] w-[22px]" aria-hidden />
        </span>
      )}
      <span className={`w-full truncate text-[12px] font-extrabold ${locked ? 'text-v2-muted' : 'text-v2-ink'}`}>
        {badge.name_he}
      </span>
      {!locked && badge.tier && (
        <span className="-mt-1 whitespace-nowrap text-[11px] font-bold text-v2-deep">{TIER_LABELS_HE[badge.tier]}</span>
      )}
    </button>
  );
}

function BadgeGridV2({ unlockedAchievements, onViewAll, maxVisible }: Required<Omit<BadgeDisplayProps, 'v2'>>) {
  const earned = buildEarnedBadges(unlockedAchievements);
  const visibleEarned = earned.slice(0, maxVisible);
  const remaining = earned.length - visibleEarned.length;
  const locked = buildLockedBadges(unlockedAchievements).slice(0, Math.max(0, maxVisible - visibleEarned.length));

  return (
    <div dir="rtl">
      {earned.length === 0 && (
        <p className="mb-3 text-[12.5px] font-bold text-v2-muted">אין הישגים עדיין — התחל לאמן!</p>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {visibleEarned.map((badge) => (
          <BadgeCardV2 key={`${badge.id}_${badge.tier ?? 'ot'}`} badge={badge} locked={false} onClick={onViewAll} />
        ))}
        {locked.map((badge) => (
          <BadgeCardV2 key={`${badge.id}_locked`} badge={badge} locked onClick={onViewAll} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-3 text-[13px] font-extrabold text-v2-deep"
        >
          +{remaining} הישגים נוספים
        </button>
      )}
    </div>
  );
}

export function BadgeDisplay({
  unlockedAchievements,
  onViewAll,
  maxVisible = 6,
  v2 = false,
}: BadgeDisplayProps) {
  if (v2) {
    return <BadgeGridV2 unlockedAchievements={unlockedAchievements} onViewAll={onViewAll} maxVisible={maxVisible} />;
  }
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
