'use client';

/**
 * AchievementUnlockToast — bottom-anchored slide-up card shown when a
 * new achievement or tier is unlocked during a session.
 *
 * Auto-dismisses after 4 seconds. The parent dequeues the next item
 * via the `onDismiss` callback.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TIER_LABELS_HE, TIER_EMOJI } from '../types/achievement.types';
import type { NewlyUnlockedItem } from '../types/achievement.types';

interface AchievementUnlockToastProps {
  item: NewlyUnlockedItem | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

export function AchievementUnlockToast({ item, onDismiss }: AchievementUnlockToastProps) {
  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key={`${item.achievement.id}_${item.tier ?? 'ot'}`}
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          className="fixed bottom-24 inset-x-4 z-[95] pointer-events-none"
          dir="rtl"
        >
          <button
            type="button"
            onClick={onDismiss}
            className="pointer-events-auto w-full bg-white rounded-2xl shadow-premium border border-yellow-300 px-4 py-3 flex items-center gap-3"
          >
            {/* Left — emoji icon */}
            <span className="text-3xl leading-none shrink-0">{item.achievement.emoji}</span>

            {/* Center — text */}
            <div className="flex-1 text-start">
              <p className="text-xs font-semibold text-yellow-600 font-hebrew mb-0.5">
                🏆 הישג חדש נפתח!
              </p>
              <p className="text-sm font-bold text-gray-900 font-hebrew leading-snug">
                {item.achievement.name_he}
                {item.tier && (
                  <span className="ms-1.5 text-xs font-normal text-gray-500">
                    {TIER_EMOJI[item.tier]} {TIER_LABELS_HE[item.tier]}
                  </span>
                )}
              </p>
            </div>

            {/* Right — XP badge */}
            <div className="shrink-0 bg-yellow-400 text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-xl">
              +{item.xpAwarded} XP
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
