/**
 * @deprecated  — SUPERSEDED BY THE LEAD PROGRAM MODEL
 *
 * This service previously managed a global `app_config/training_os` document
 * with per-level physiological settings.  The architecture has been replaced
 * by the **Lead Program** model:
 *
 *   • `weeklyVolumeTarget` and `maxIntenseWorkoutsPerWeek` now live in
 *     **ProgramLevelSettings** (per-program, per-level).
 *   • At runtime, `lead-program.service.ts` resolves the "lead" program
 *     (highest user level among same-pattern programs) and uses its
 *     settings as the shared budget.
 *
 * This file is kept for reference only and is no longer imported anywhere.
 *
 * @see lead-program.service.ts    — new resolution logic
 * @see ProgramLevelSettings        — data source
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Per-level physiological configuration.
 * Each level (1-25) has its own row of these values.
 */
export interface GlobalLevelConfig {
  /** Target weekly sets for push movements */
  weeklyTargetPush: number;
  /** Target weekly sets for pull movements */
  weeklyTargetPull: number;
  /** Target weekly sets for leg movements */
  weeklyTargetLegs: number;
  /** Target weekly sets for core movements */
  weeklyTargetCore: number;
  /** Max 3-bolt sessions allowed per week (0 = locked, 99 = unlimited) */
  maxIntenseWorkoutsPerWeek: number;
}

/**
 * Full document shape stored at `app_config/training_os`.
 */
export interface GlobalTrainingConfig {
  /** Map of level number → physiological config */
  levels: Record<number, GlobalLevelConfig>;
  /** Last save timestamp (set by server) */
  updatedAt?: any;
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Sensible defaults that mirror the previous ProgramLevelSettings logic.
 * Coaches can override any level via the Admin → Levels page.
 */
export function getDefaultGlobalLevelConfig(level: number): GlobalLevelConfig {
  return {
    weeklyTargetPush: level <= 5 ? 8 : level <= 12 ? 12 : 16,
    weeklyTargetPull: level <= 5 ? 8 : level <= 12 ? 12 : 16,
    weeklyTargetLegs: level <= 5 ? 6 : level <= 12 ? 10 : 14,
    weeklyTargetCore: level <= 5 ? 4 : level <= 12 ? 6 : 8,
    maxIntenseWorkoutsPerWeek: level <= 5 ? 0 : level <= 12 ? 2 : 99,
  };
}

/**
 * Build a complete default config for all 25 levels.
 */
export function getDefaultGlobalTrainingConfig(): GlobalTrainingConfig {
  const levels: Record<number, GlobalLevelConfig> = {};
  for (let i = 1; i <= 25; i++) {
    levels[i] = getDefaultGlobalLevelConfig(i);
  }
  return { levels };
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

const CONFIG_PATH = 'app_config';
const CONFIG_DOC = 'training_os';

/**
 * Load the global training config from Firestore.
 * Falls back to defaults for any missing levels.
 */
export async function loadGlobalTrainingConfig(): Promise<GlobalTrainingConfig> {
  try {
    const snap = await getDoc(doc(db, CONFIG_PATH, CONFIG_DOC));

    if (!snap.exists()) {
      return getDefaultGlobalTrainingConfig();
    }

    const data = snap.data() as Partial<GlobalTrainingConfig>;
    const storedLevels = (data.levels ?? {}) as Record<string, GlobalLevelConfig>;

    // Merge stored values over defaults (fill gaps for levels not yet saved)
    const merged: Record<number, GlobalLevelConfig> = {};
    for (let i = 1; i <= 25; i++) {
      const stored = storedLevels[String(i)];
      const defaults = getDefaultGlobalLevelConfig(i);
      merged[i] = stored
        ? {
            weeklyTargetPush: stored.weeklyTargetPush ?? defaults.weeklyTargetPush,
            weeklyTargetPull: stored.weeklyTargetPull ?? defaults.weeklyTargetPull,
            weeklyTargetLegs: stored.weeklyTargetLegs ?? defaults.weeklyTargetLegs,
            weeklyTargetCore: stored.weeklyTargetCore ?? defaults.weeklyTargetCore,
            maxIntenseWorkoutsPerWeek:
              stored.maxIntenseWorkoutsPerWeek ?? defaults.maxIntenseWorkoutsPerWeek,
          }
        : defaults;
    }

    return { levels: merged };
  } catch (e) {
    console.error('[GlobalTrainingConfig] Load failed, using defaults:', e);
    return getDefaultGlobalTrainingConfig();
  }
}

/**
 * Save the global training config to Firestore.
 * Uses `setDoc` with merge so partial writes are safe.
 */
export async function saveGlobalTrainingConfig(
  config: GlobalTrainingConfig,
): Promise<void> {
  // Firestore doesn't like numeric keys in maps — convert to string keys
  const levelsPayload: Record<string, GlobalLevelConfig> = {};
  for (const [k, v] of Object.entries(config.levels)) {
    levelsPayload[String(k)] = v;
  }

  await setDoc(
    doc(db, CONFIG_PATH, CONFIG_DOC),
    {
      levels: levelsPayload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Get the global config for a single level.
 * Convenience wrapper used by the workout generation pipeline.
 *
 * If the doc hasn't been saved yet, returns sensible defaults.
 */
export async function getGlobalConfigForLevel(level: number): Promise<GlobalLevelConfig> {
  const config = await loadGlobalTrainingConfig();
  return config.levels[level] ?? getDefaultGlobalLevelConfig(level);
}
