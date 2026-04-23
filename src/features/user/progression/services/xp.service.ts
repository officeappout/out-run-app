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
import {
  DIFFICULTY_MULTIPLIER,
  XP_PER_SET,
  XP_PER_REP,
  XP_PER_MINUTE_RUNNING,
  XP_PER_KM_BONUS,
  STREAK_MULTIPLIER_INCREMENT,
  STREAK_MULTIPLIER_MAX_DAYS,
  GLOBAL_LEVEL_THRESHOLDS,
} from '../config/xp-rules';

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
 *
 * When `levels` is empty (e.g. called from the store without a Firestore fetch),
 * falls back to GLOBAL_LEVEL_THRESHOLDS from xp-rules.ts.
 */
export function calculateLevelFromXP(
  totalXP: number,
  levels: Level[]
): number {
  const effective: Pick<Level, 'order' | 'minXP'>[] = levels.length > 0
    ? levels
    : GLOBAL_LEVEL_THRESHOLDS.map(t => ({ order: t.level, minXP: t.minXP }));

  const sorted = [...effective].sort((a, b) => (a.minXP || 0) - (b.minXP || 0));

  for (let i = sorted.length - 1; i >= 0; i--) {
    if (totalXP >= (sorted[i].minXP || 0)) {
      return sorted[i].order;
    }
  }

  return 1;
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

// ============================================================================
// XP Calculation — Strength Workout (New Formula)
// ============================================================================

export interface StrengthWorkoutXPParams {
  durationMinutes: number;
  difficultyBolts: 1 | 2 | 3;
  totalSets: number;
  totalReps: number;
  streak: number;
  goalBonus?: number;
}

/**
 * Calculate XP for a strength workout using the overhauled formula.
 *
 * FinalXP = round((BaseXP + VolumeXP) × StreakMultiplier) + goalBonus
 *
 * - BaseXP     = durationMinutes × DIFFICULTY_MULTIPLIER[bolts]
 * - VolumeXP   = (totalSets × XP_PER_SET) + (totalReps × XP_PER_REP)
 * - StreakMult  = 1 + min(streak, 30) × 0.01   → caps at 1.30×
 * - goalBonus  = flat additive (pre-calculated by calculateGoalBonusXP)
 *
 * All constants sourced from config/xp-rules.ts.
 */
// ============================================================================
// XP Calculation — Running / Walking Workout
// ============================================================================

export interface RunningWorkoutXPParams {
  /** Total activity duration in whole minutes */
  durationMinutes: number;
  /** Distance covered in kilometres */
  distanceKm: number;
  /** Current daily streak (days) — same multiplier logic as strength */
  streak: number;
  /** Activity sub-type (walking earns the same rate as running) */
  activityType?: 'running' | 'walking';
}

/**
 * Calculate XP for a running or walking workout.
 *
 * FinalXP = round((Minutes × XP_PER_MINUTE_RUNNING + Km × XP_PER_KM_BONUS) × StreakMultiplier)
 *
 * - Base rate:  3 XP per minute (rewards time on feet)
 * - Distance:  +10 XP per km (rewards intensity)
 * - StreakMult: 1 + min(streak, 30) × 0.01  (caps at 1.30×)
 *
 * Walking uses the same formula — deliberate choice to reward all movement.
 * All constants sourced from config/xp-rules.ts.
 */
export function calculateRunningWorkoutXP(params: RunningWorkoutXPParams): number {
  const { durationMinutes, distanceKm, streak } = params;

  const baseXP = Math.max(durationMinutes, 1) * XP_PER_MINUTE_RUNNING;
  const distanceBonus = Math.max(0, distanceKm) * XP_PER_KM_BONUS;
  const streakMultiplier = 1 + Math.min(streak, STREAK_MULTIPLIER_MAX_DAYS) * STREAK_MULTIPLIER_INCREMENT;

  const finalXP = Math.round((baseXP + distanceBonus) * streakMultiplier);
  return Math.max(1, finalXP);
}

export function calculateStrengthWorkoutXP(params: StrengthWorkoutXPParams): number {
  const {
    durationMinutes,
    difficultyBolts,
    totalSets,
    totalReps,
    streak,
    goalBonus = 0,
  } = params;

  const baseXP = Math.max(durationMinutes, 1) * DIFFICULTY_MULTIPLIER[difficultyBolts];
  const volumeXP = (totalSets * XP_PER_SET) + (totalReps * XP_PER_REP);
  const streakMultiplier = 1 + Math.min(streak, STREAK_MULTIPLIER_MAX_DAYS) * STREAK_MULTIPLIER_INCREMENT;

  const finalXP = Math.round((baseXP + volumeXP) * streakMultiplier) + goalBonus;
  return Math.max(1, finalXP);
}
