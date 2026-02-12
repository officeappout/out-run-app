/**
 * XP Service — Level Goals System
 *
 * Handles XP calculation, level determination, and goal bonus logic.
 *
 * IMPORTANT: XP values are **internal only** — the user should NEVER see raw XP.
 * Always convert to percentage using getProgressToNextLevel() before displaying.
 *
 * Multipliers and bonus constants are stored in Firestore: app_config/xp_settings
 * and can be managed from Admin Panel → Lemur Levels → XP Engine Settings.
 */

import { Level } from '@/types/workout';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// XP Settings — loaded from Firestore with hardcoded fallbacks
// ============================================================================

interface XPSettings {
  strengthMultiplier: number;
  cardioMultiplier: number;
  hybridMultiplier: number;
  goalBonusBase: number;
  goalBonusIncrement: number;
  goalBonusCap: number;
  minWorkoutDuration: number;
}

const DEFAULT_XP_SETTINGS: XPSettings = {
  strengthMultiplier: 1.2,
  cardioMultiplier: 1.0,
  hybridMultiplier: 1.3,
  goalBonusBase: 50,
  goalBonusIncrement: 10,
  goalBonusCap: 150,
  minWorkoutDuration: 30,
};

// In-memory cache to avoid repeated Firestore reads per session
let _cachedSettings: XPSettings | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load XP settings from Firestore (with in-memory cache).
 * Falls back to DEFAULT_XP_SETTINGS if Firestore read fails.
 */
export async function getXPSettings(): Promise<XPSettings> {
  const now = Date.now();
  if (_cachedSettings && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return _cachedSettings;
  }

  try {
    const snap = await getDoc(doc(db, 'app_config', 'xp_settings'));
    if (snap.exists()) {
      _cachedSettings = { ...DEFAULT_XP_SETTINGS, ...snap.data() } as XPSettings;
    } else {
      _cachedSettings = DEFAULT_XP_SETTINGS;
    }
  } catch (e) {
    console.warn('[XPService] Failed to load settings, using defaults:', e);
    _cachedSettings = DEFAULT_XP_SETTINGS;
  }

  _cacheTimestamp = now;
  return _cachedSettings;
}

// ============================================================================
// Level Calculation
// ============================================================================

/**
 * Calculate globalLevel from total XP using admin-defined level thresholds.
 * Returns the highest level whose minXP the user has reached.
 */
export function calculateLevelFromXP(
  totalXP: number,
  levels: Level[]
): number {
  if (!levels.length) return 1;

  const sorted = [...levels].sort((a, b) => (a.minXP || 0) - (b.minXP || 0));

  for (let i = sorted.length - 1; i >= 0; i--) {
    if (totalXP >= (sorted[i].minXP || 0)) {
      return sorted[i].order;
    }
  }

  return 1; // default
}

/**
 * Get the XP threshold required to reach the next level.
 * Returns null if user is at the max level.
 */
export function getXPForNextLevel(
  currentLevel: number,
  levels: Level[]
): number | null {
  const nextLevel = levels.find(l => l.order === currentLevel + 1);
  return nextLevel ? (nextLevel.minXP || 0) : null;
}

/**
 * Calculate the % progress toward the next level.
 * This is the ONLY value that should be shown to users.
 */
export function getProgressToNextLevel(
  totalXP: number,
  currentLevel: number,
  levels: Level[]
): number {
  const current = levels.find(l => l.order === currentLevel);
  const next = levels.find(l => l.order === currentLevel + 1);

  if (!current || !next) return 0;

  const currentMinXP = current.minXP || 0;
  const nextMinXP = next.minXP || 0;
  const range = nextMinXP - currentMinXP;

  if (range <= 0) return 100;

  const xpInCurrentLevel = totalXP - currentMinXP;
  return Math.min(100, Math.max(0, (xpInCurrentLevel / range) * 100));
}

// ============================================================================
// XP Calculation — Base Workout XP
// ============================================================================

/**
 * Award base XP after a workout.
 * Formula: duration (minutes) × difficulty × type multiplier
 *
 * Multipliers are loaded from Firestore (app_config/xp_settings).
 * Use the async version `calculateBaseWorkoutXPAsync` for Firestore-backed values.
 * The sync version uses cached or default values.
 */
export function calculateBaseWorkoutXP(
  durationMinutes: number,
  difficulty: number, // 1-3
  workoutType: 'strength' | 'cardio' | 'hybrid',
  settings?: XPSettings
): number {
  const s = settings || _cachedSettings || DEFAULT_XP_SETTINGS;
  const typeMultiplier: Record<string, number> = {
    strength: s.strengthMultiplier,
    cardio: s.cardioMultiplier,
    hybrid: s.hybridMultiplier,
  };

  const effectiveDuration = Math.max(durationMinutes, s.minWorkoutDuration);
  const baseXP = effectiveDuration * difficulty * (typeMultiplier[workoutType] || 1.0);
  return Math.round(Math.max(1, baseXP)); // minimum 1 XP per workout
}

/**
 * Async version that ensures settings are loaded from Firestore first.
 */
export async function calculateBaseWorkoutXPAsync(
  durationMinutes: number,
  difficulty: number,
  workoutType: 'strength' | 'cardio' | 'hybrid'
): Promise<number> {
  const settings = await getXPSettings();
  return calculateBaseWorkoutXP(durationMinutes, difficulty, workoutType, settings);
}

// ============================================================================
// XP Calculation — Goal Bonus
// ============================================================================

/**
 * Calculate bonus XP for achieving or exceeding a level goal.
 *
 * - Meeting the goal exactly: goalBonusBase XP (default 50)
 * - Every 10% excess: +goalBonusIncrement XP (default 10)
 * - Cap: goalBonusCap XP (default 150)
 * - Below target: 0 XP (encouragement only)
 *
 * Values are loaded from Firestore (app_config/xp_settings).
 */
export function calculateGoalBonusXP(
  targetValue: number,
  actualPerformance: number,
  _unit: 'reps' | 'seconds', // reserved for future unit-specific logic
  settings?: XPSettings
): number {
  if (actualPerformance < targetValue) return 0;

  const s = settings || _cachedSettings || DEFAULT_XP_SETTINGS;
  const excessPercent = ((actualPerformance - targetValue) / targetValue) * 100;

  const bonusXP = s.goalBonusBase + Math.floor(excessPercent / 10) * s.goalBonusIncrement;
  return Math.min(bonusXP, s.goalBonusCap);
}

/**
 * Calculate the completion percentage for a goal attempt.
 * Capped at 100%.
 */
export function calculateGoalCompletionPercent(
  targetValue: number,
  actualPerformance: number
): number {
  if (targetValue <= 0) return 0;
  return Math.min(100, Math.round((actualPerformance / targetValue) * 100));
}
