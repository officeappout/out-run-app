/**
 * Achievement Service — Tiered achievement system.
 *
 * Responsibilities:
 *   1. Load achievement definitions from Firestore (with code fallback).
 *   2. Evaluate user stats against conditions (pure, no side effects).
 *   3. Persist newly-unlocked achievements to Firestore.
 *   4. Return unlock events so the caller can award XP + show toasts.
 *
 * XP awards are NOT handled here — callers use
 * `useProgressionStore.awardBonusXP()` which routes through the Guardian
 * Cloud Function (required by Firestore security rules).
 *
 * Firestore storage — users/{id}.progression.unlockedAchievements:
 *   one_time key:  achievementId
 *   tiered key:    achievementId_bronze | _silver | _gold
 */

import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_MAP } from '../config/achievement-definitions';
import {
  TIER_ORDER,
  type AchievementDefinition,
  type Condition,
  type ConditionType,
  type NewlyUnlockedItem,
  type TierKey,
  type UnlockedAchievementsMap,
  type UserAchievementStats,
} from '../types/achievement.types';

const ACHIEVEMENTS_COLLECTION = 'achievements';
const USERS_COLLECTION = 'users';

// ─────────────────────────────────────────────────────────────────────────────
// Definition loading (Firestore → code fallback)
// ─────────────────────────────────────────────────────────────────────────────

let _cachedDefinitions: AchievementDefinition[] | null = null;

/**
 * Load achievement definitions from Firestore.
 * Falls back to the hard-coded list if the collection is empty or unavailable.
 * Results are cached in memory for the lifetime of the page.
 */
export async function loadAchievementDefinitions(): Promise<AchievementDefinition[]> {
  if (_cachedDefinitions) return _cachedDefinitions;

  try {
    const snap = await getDocs(collection(db, ACHIEVEMENTS_COLLECTION));
    if (!snap.empty) {
      const fromFirestore = snap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      })) as AchievementDefinition[];
      _cachedDefinitions = fromFirestore;
      return fromFirestore;
    }
  } catch (e) {
    console.warn('[Achievement] Firestore load failed, using code definitions:', e);
  }

  _cachedDefinitions = ACHIEVEMENT_DEFINITIONS;
  return ACHIEVEMENT_DEFINITIONS;
}

/** Clear the definition cache (e.g. after seeding in dev). */
export function clearAchievementCache(): void {
  _cachedDefinitions = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition evaluation (pure)
// ─────────────────────────────────────────────────────────────────────────────

function evaluateCondition(
  condition: Condition,
  stats: UserAchievementStats,
): boolean {
  const t = condition.type as ConditionType;
  const v = condition.value;

  switch (t) {
    case 'total_running_km':       return stats.totalRunningKm >= v;
    case 'longest_run_km':         return stats.longestRunKm >= v;
    case 'runs_in_7_days':         return stats.runsInLast7Days >= v;
    case 'total_workouts':         return stats.totalWorkouts >= v;
    case 'total_strength_workouts':return stats.totalStrengthWorkouts >= v;
    case 'days_active':            return stats.daysActive >= v;
    case 'streak_days':            return stats.currentStreak >= v;
    case 'strength_in_7_days':     return stats.strengthWorkoutsInLastWeek >= v;
    case 'strength_in_30_days':    return stats.strengthWorkoutsInLastMonth >= v;
    case 'outdoor_workouts':       return stats.outdoorWorkouts >= v;
    case 'pullup_max_reps':        return stats.pullupMaxReps >= v;
    case 'pushup_max_reps':        return stats.pushupMaxReps >= v;
    case 'squat_max_reps':         return stats.squatMaxReps >= v;
    case 'plank_max_seconds':      return stats.plankMaxSeconds >= v;
    case 'followers_count':        return stats.followersCount >= v;
    case 'following_count':        return stats.followingCount >= v;
    case 'groups_joined':          return stats.groupsJoined >= v;
    case 'partner_workouts':       return stats.partnerWorkouts >= v;
    case 'unique_parks':           return stats.uniqueParks >= v;
    case 'park_sessions':          return stats.parkSessions >= v;
    case 'league_rank_lte':
      return stats.leagueRank !== null && stats.leagueRank <= v;
    case 'league_weekly_wins':     return stats.leagueWeeklyWins >= v;
    case 'bool_workout_before_7am':return stats.hasWorkoutBefore7am;
    case 'bool_workout_on_friday': return stats.hasWorkoutOnFriday;
    case 'bool_workout_in_rain':   return stats.hasWorkoutInRain;
    case 'bool_messages_sent':     return stats.messagesSent > 0;
    default:                       return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check helper keys
// ─────────────────────────────────────────────────────────────────────────────

function storageKey(achievementId: string, tier?: TierKey): string {
  return tier ? `${achievementId}_${tier}` : achievementId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core check function (pure — no Firestore writes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare user stats against all achievement definitions.
 * Returns only tiers/one-time achievements that are newly met
 * (not already present in `alreadyUnlocked`).
 *
 * Pure function — callers are responsible for persisting and awarding XP.
 */
export function computeNewlyUnlocked(
  definitions: AchievementDefinition[],
  stats: UserAchievementStats,
  alreadyUnlocked: UnlockedAchievementsMap,
): NewlyUnlockedItem[] {
  const results: NewlyUnlockedItem[] = [];

  for (const def of definitions) {
    if (def.type === 'one_time') {
      const key = storageKey(def.id);
      if (alreadyUnlocked[key]) continue; // already unlocked
      if (!def.condition) continue;
      if (evaluateCondition(def.condition, stats)) {
        results.push({ achievement: def, xpAwarded: def.xp ?? 0 });
      }
    } else if (def.type === 'tiered' && def.tiers) {
      for (const tier of TIER_ORDER) {
        const key = storageKey(def.id, tier);
        if (alreadyUnlocked[key]) continue; // this tier already unlocked
        const tierConfig = def.tiers[tier];
        if (evaluateCondition(tierConfig.condition, stats)) {
          results.push({ achievement: def, tier, xpAwarded: tierConfig.xp });
        }
        // Don't break — a user may jump multiple tiers in one check pass
        // (e.g. they were offline and are catching up).
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single newly-unlocked achievement/tier to Firestore.
 * Writes to `users/{userId}.progression.unlockedAchievements`.
 * Does NOT award XP — the caller must call `awardBonusXP`.
 */
export async function persistUnlockedAchievement(
  userId: string,
  achievementId: string,
  xpAwarded: number,
  tier?: TierKey,
): Promise<boolean> {
  try {
    const key = storageKey(achievementId, tier);
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      [`progression.unlockedAchievements.${key}`]: {
        unlockedAt: new Date().toISOString(),
        xpAwarded,
        ...(tier ? { tier } : {}),
      },
    });
    console.log(`[Achievement] Unlocked: ${key} (+${xpAwarded} XP)`);
    return true;
  } catch (e) {
    console.error('[Achievement] Failed to persist unlock:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite: check + persist (called by useAchievements hook)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full achievement evaluation pass:
 *   1. Loads definitions (cached after first call).
 *   2. Computes what's newly unlocked.
 *   3. Persists each newly-unlocked item to Firestore.
 *
 * Returns the list of newly-unlocked items so callers can award XP and
 * show toasts.  Firestore writes are best-effort — an item is included
 * in the return even if the write fails (the hook retries on next visit).
 */
export async function checkAndPersistAchievements(
  userId: string,
  stats: UserAchievementStats,
  alreadyUnlocked: UnlockedAchievementsMap,
): Promise<NewlyUnlockedItem[]> {
  const definitions = await loadAchievementDefinitions();
  const newItems = computeNewlyUnlocked(definitions, stats, alreadyUnlocked);

  if (newItems.length === 0) return [];

  await Promise.allSettled(
    newItems.map((item) =>
      persistUnlockedAchievement(
        userId,
        item.achievement.id,
        item.xpAwarded,
        item.tier,
      ),
    ),
  );

  return newItems;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read all unlocked achievements for a user (single Firestore fetch)
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserUnlockedAchievements(
  userId: string,
): Promise<UnlockedAchievementsMap> {
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!snap.exists()) return {};
    return (snap.data().progression?.unlockedAchievements ?? {}) as UnlockedAchievementsMap;
  } catch (e) {
    console.error('[Achievement] Failed to read unlocked achievements:', e);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the highest tier already unlocked for a tiered achievement,
 * or undefined if none is unlocked.
 */
export function getHighestUnlockedTier(
  achievementId: string,
  unlocked: UnlockedAchievementsMap,
): TierKey | undefined {
  for (const tier of [...TIER_ORDER].reverse() as TierKey[]) {
    if (unlocked[storageKey(achievementId, tier)]) return tier;
  }
  return undefined;
}

/**
 * Returns true if a one_time achievement is unlocked.
 */
export function isOneTimeUnlocked(
  achievementId: string,
  unlocked: UnlockedAchievementsMap,
): boolean {
  return !!unlocked[storageKey(achievementId)];
}

/**
 * Total XP earned from all achievements.
 */
export function totalAchievementXP(unlocked: UnlockedAchievementsMap): number {
  return Object.values(unlocked).reduce((sum, e) => sum + (e.xpAwarded ?? 0), 0);
}

/**
 * Count of distinct achievement entries (not tiers, but unique achievements).
 * A tiered achievement counts as one even if bronze+silver are both unlocked.
 */
export function countUnlockedAchievements(
  unlocked: UnlockedAchievementsMap,
  definitions: AchievementDefinition[],
): number {
  let count = 0;
  for (const def of definitions) {
    if (def.type === 'one_time') {
      if (unlocked[storageKey(def.id)]) count++;
    } else {
      const anyTier = TIER_ORDER.some((t) => !!unlocked[storageKey(def.id, t)]);
      if (anyTier) count++;
    }
  }
  return count;
}

// Re-export for convenience
export { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_MAP, getAchievementsByCategory } from '../config/achievement-definitions';
export type { AchievementDefinition, UnlockedAchievementsMap, NewlyUnlockedItem, TierKey };
