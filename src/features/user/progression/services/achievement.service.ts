/**
 * Achievement Service
 * Handles badge unlocking and achievement tracking
 */

import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

/**
 * Achievement/Badge Definitions
 * Placeholder for future badge system
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (profile: any) => boolean;
}

/**
 * Predefined achievements
 */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_workout',
    name: 'אימון ראשון',
    description: 'השלמת את האימון הראשון שלך',
    icon: '🎯',
    condition: (profile) => profile.progression?.totalCaloriesBurned > 0,
  },
  {
    id: 'week_warrior',
    name: 'לוחם שבוע',
    description: 'אימנת 7 ימים ברצף',
    icon: '⚔️',
    condition: (profile) => profile.progression?.daysActive >= 7,
  },
  {
    id: 'coin_collector',
    name: 'אספן מטבעות',
    description: 'צברת 1000 מטבעות',
    icon: '💰',
    condition: (profile) => profile.progression?.coins >= 1000,
  },
  {
    id: 'calorie_crusher',
    name: 'מפוצץ קלוריות',
    description: 'שרפת 10,000 קלוריות',
    icon: '🔥',
    condition: (profile) => profile.progression?.totalCaloriesBurned >= 10000,
  },
  {
    id: 'king_lemur',
    name: 'מלך הלמורים',
    description: 'הגעת לשלב 10',
    icon: '👑',
    condition: (profile) => profile.progression?.lemurStage >= 10,
  },
];

/**
 * Check and unlock new achievements
 */
export async function checkAndUnlockAchievements(
  userId: string,
  profile: any
): Promise<string[]> {
  try {
    const unlockedBadges = profile.progression?.unlockedBadges || [];
    const newlyUnlocked: string[] = [];

    for (const achievement of ACHIEVEMENTS) {
      // Skip if already unlocked
      if (unlockedBadges.includes(achievement.id)) {
        continue;
      }

      // Check if condition is met
      if (achievement.condition(profile)) {
        await unlockBadge(userId, achievement.id);
        newlyUnlocked.push(achievement.id);
      }
    }

    return newlyUnlocked;
  } catch (error) {
    console.error('[Achievement] Error checking achievements:', error);
    return [];
  }
}

/**
 * Unlock a specific badge
 */
export async function unlockBadge(
  userId: string,
  badgeId: string
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);

    await updateDoc(userDocRef, {
      'progression.unlockedBadges': arrayUnion(badgeId),
    });

    console.log(`🏆 [Achievement] Unlocked badge ${badgeId} for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[Achievement] Error unlocking badge:', error);
    return false;
  }
}

/**
 * Get achievement by ID
 */
export function getAchievement(badgeId: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === badgeId);
}

/**
 * Get all unlocked achievements for display
 */
export function getUnlockedAchievements(
  unlockedBadgeIds: string[]
): Achievement[] {
  return ACHIEVEMENTS.filter((a) => unlockedBadgeIds.includes(a.id));
}
