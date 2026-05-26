'use client';

/**
 * AchievementSheet — full-screen bottom sheet showing all achievements
 * grouped by category, with unlock status per tier.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Trophy } from 'lucide-react';
import { ACHIEVEMENT_DEFINITIONS } from '../config/achievement-definitions';
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS_HE,
  TIER_ORDER,
  TIER_EMOJI,
  TIER_LABELS_HE,
  TIER_COLORS,
} from '../types/achievement.types';
import {
  getHighestUnlockedTier,
  isOneTimeUnlocked,
} from '../services/achievement.service';
import type { AchievementDefinition, TierKey, UnlockedAchievementsMap } from '../types/achievement.types';
import clsx from 'clsx';

interface AchievementSheetProps {
  isOpen: boolean;
  onClose: () => void;
  unlockedAchievements: UnlockedAchievementsMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TierBadge({ tier, unlocked }: { tier: TierKey; unlocked: boolean }) {
  const colors = TIER_COLORS[tier];
  return (
    <span
      className={clsx(
        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
        unlocked
          ? [colors.bg, colors.text, colors.border]
          : 'bg-gray-100 text-gray-400 border-gray-200',
      )}
    >
      {TIER_EMOJI[tier]} {TIER_LABELS_HE[tier]}
    </span>
  );
}

function AchievementCard({
  achievement,
  unlocked,
}: {
  achievement: AchievementDefinition;
  unlocked: UnlockedAchievementsMap;
}) {
  const isOneTime = achievement.type === 'one_time';
  const isUnlocked = isOneTime
    ? isOneTimeUnlocked(achievement.id, unlocked)
    : getHighestUnlockedTier(achievement.id, unlocked) !== undefined;

  const highestTier = isOneTime ? undefined : getHighestUnlockedTier(achievement.id, unlocked);

  return (
    <div
      className={clsx(
        'rounded-2xl border p-3 flex flex-col gap-2 transition-opacity',
        isUnlocked ? 'bg-white border-gray-200 shadow-subtle' : 'bg-gray-50 border-gray-100 opacity-60',
      )}
    >
      {/* Icon + Name */}
      <div className="flex items-start gap-2">
        <span className={clsx('text-2xl leading-none', !isUnlocked && 'grayscale')}>
          {isUnlocked ? achievement.emoji : '🔒'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 font-hebrew leading-snug">
            {achievement.name_he}
          </p>
          <p className="text-xs text-gray-500 font-hebrew leading-snug mt-0.5">
            {achievement.description_he}
          </p>
        </div>
      </div>

      {/* Status */}
      {isOneTime ? (
        <div className="flex items-center gap-1.5">
          {isUnlocked ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold font-hebrew">
              <Trophy className="w-3 h-3" />
              נפתח! +{achievement.xp} XP
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-400 font-hebrew">
              <Lock className="w-3 h-3" />
              +{achievement.xp} XP
            </span>
          )}
        </div>
      ) : (
        achievement.tiers && (
          <div className="flex flex-wrap gap-1">
            {TIER_ORDER.map((tier) => {
              const tierUnlocked = !!unlocked[`${achievement.id}_${tier}`];
              return <TierBadge key={tier} tier={tier as TierKey} unlocked={tierUnlocked} />;
            })}
          </div>
        )
      )}

      {/* Highest tier XP earned */}
      {!isOneTime && highestTier && achievement.tiers && (
        <p className="text-[10px] text-gray-400 font-hebrew">
          השגת: {TIER_LABELS_HE[highestTier]} +{achievement.tiers[highestTier].xp} XP
        </p>
      )}
    </div>
  );
}

function CategorySection({
  category,
  unlocked,
}: {
  category: string;
  unlocked: UnlockedAchievementsMap;
}) {
  const definitions = ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);
  const label = CATEGORY_LABELS_HE[category as keyof typeof CATEGORY_LABELS_HE] ?? category;

  const unlockedCount = definitions.filter((def) =>
    def.type === 'one_time'
      ? isOneTimeUnlocked(def.id, unlocked)
      : getHighestUnlockedTier(def.id, unlocked) !== undefined,
  ).length;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-700 font-hebrew">{label}</h3>
        <span className="text-xs text-gray-400 font-hebrew">
          {unlockedCount}/{definitions.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {definitions.map((def) => (
          <AchievementCard key={def.id} achievement={def} unlocked={unlocked} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sheet
// ─────────────────────────────────────────────────────────────────────────────

export function AchievementSheet({ isOpen, onClose, unlockedAchievements }: AchievementSheetProps) {
  const totalUnlocked = ACHIEVEMENT_DEFINITIONS.filter((def) =>
    def.type === 'one_time'
      ? isOneTimeUnlocked(def.id, unlockedAchievements)
      : getHighestUnlockedTier(def.id, unlockedAchievements) !== undefined,
  ).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[98]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            className="fixed bottom-0 inset-x-0 z-[99] bg-background-light rounded-t-3xl shadow-drawer max-h-[92dvh] flex flex-col"
            dir="rtl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900 font-hebrew">הישגים שלי</h2>
                <p className="text-xs text-gray-500 font-hebrew">
                  {totalUnlocked} מתוך {ACHIEVEMENT_DEFINITIONS.length} נפתחו
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                aria-label="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {CATEGORY_ORDER.map((category) => (
                <CategorySection
                  key={category}
                  category={category}
                  unlocked={unlockedAchievements}
                />
              ))}
              {/* Bottom spacing for safe area */}
              <div className="h-6" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
