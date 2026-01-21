/**
 * Badge Display Component
 * Shows unlocked achievements/badges
 * Placeholder for future implementation
 */

'use client';

import React from 'react';
import { getUnlockedAchievements } from '../services/achievement.service';

interface BadgeDisplayProps {
  unlockedBadgeIds: string[];
  compact?: boolean;
}

export default function BadgeDisplay({ unlockedBadgeIds, compact = false }: BadgeDisplayProps) {
  const achievements = getUnlockedAchievements(unlockedBadgeIds);

  if (achievements.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {achievements.slice(0, 3).map((achievement) => (
          <span key={achievement.id} className="text-lg" title={achievement.name}>
            {achievement.icon}
          </span>
        ))}
        {achievements.length > 3 && (
          <span className="text-xs text-gray-500">+{achievements.length - 3}</span>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className="flex flex-col items-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700"
        >
          <span className="text-2xl mb-1">{achievement.icon}</span>
          <span className="text-xs font-bold text-center text-gray-700 dark:text-gray-300">
            {achievement.name}
          </span>
        </div>
      ))}
    </div>
  );
}
