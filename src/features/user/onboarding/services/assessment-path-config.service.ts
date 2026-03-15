/**
 * Assessment Path Config Service
 *
 * Reads onboarding_program_path from sessionStorage and returns
 * path-specific config for slider ranges and categories.
 *
 * Path 1 (Health/Beginner): Levels 1-10, push/pull/legs/core
 * Path 2 (Body Focus/Intermediate): Levels 10-20, push/pull/legs/core
 * Path 3 (Skills): Skill-specific categories, dynamic max per skill
 */

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getProgramLevelSettingsByProgram } from '@/features/content/programs/core/programLevelSettings.service';

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

export type ProgramPathType = 'health' | 'body_focus' | 'skills' | null;

export interface AssessmentPathConfig {
  path: ProgramPathType;
  categories: string[];
  minLevel: number;
  maxLevel: number;
  /** For Path 3: max level per skill program ID */
  skillMaxLevels?: Record<string, number>;
  /** For Path 3: skip tier selection, go straight to sliders */
  skipTier: boolean;
  /** For Path 1, Path 2: clamp tier initial level to range */
  clampTierLevel: (tierLevel: number) => number;
}

export function getProgramPathFromStorage(): ProgramPathType {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('onboarding_program_path');
  if (!raw) return null;
  if (raw === 'health' || raw === 'beginner') return 'health';
  if (raw === 'body_focus' || raw === 'intermediate') return 'body_focus';
  if (raw === 'skills') return 'skills';
  return null;
}

export function getSkillFocusFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem('onboarding_skill_focus');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function getMuscleFocusFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem('onboarding_muscle_focus');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Muscle ID → assessment category (Path B) */
const MUSCLE_TO_CATEGORY: Record<string, string> = {
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  back: 'pull',
  biceps: 'pull',
  legs: 'legs',
  core: 'core',
};

/**
 * Derive activeProgramId from onboarding_muscle_focus (Path B).
 * Used by onboarding-sync and workout generation.
 * - Push only (chest, shoulders, triceps) → 'push'
 * - Pull only (back, biceps) → 'pull'
 * - Mix of Push + Pull → 'upper_body'
 * - Legs only → 'legs' (WorkoutGenerator pulls only from Legs domain)
 * - Core only → 'core'
 * - Legs + Core → 'lower_body'
 * - Mix of Upper (Push/Pull) + Lower (Legs/Core) → 'full_body'
 * - Full body / all 4 / empty → 'full_body'
 */
export function deriveActiveProgramFromMuscleFocus(muscleIds: string[]): string {
  const categories = musclesToCategories(muscleIds);
  const hasPush = categories.includes('push');
  const hasPull = categories.includes('pull');
  const hasLegs = categories.includes('legs');
  const hasCore = categories.includes('core');
  const hasUpper = hasPush || hasPull;
  const hasLower = hasLegs || hasCore;

  if (hasUpper && hasLower) return 'full_body';
  if (hasPush && !hasPull && !hasLegs && !hasCore) return 'push';
  if (hasPull && !hasPush && !hasLegs && !hasCore) return 'pull';
  if (hasPush && hasPull && !hasLegs && !hasCore) return 'upper_body';
  if (hasLegs && hasCore && !hasPush && !hasPull) return 'lower_body';
  if (hasLegs && !hasPush && !hasPull && !hasCore) return 'legs';
  if (hasCore && !hasPush && !hasPull && !hasLegs) return 'core';

  return 'full_body';
}

/**
 * Get focus domains (selected category IDs) for workout generation.
 * Returns only the categories the user selected — used as activeProgramFilters
 * so WorkoutGenerator pulls exercises only from those domains.
 */
export function getFocusDomainsForMuscleFocus(muscleIds: string[]): string[] {
  return musclesToCategories(muscleIds);
}

/**
 * Derive activeProgramId from onboarding_skill_focus (Path C).
 * - Specialist (1 skill): activeProgramId = skill ID (100% focused)
 * - Generalist (2+ skills): activeProgramId = 'calisthenics_upper' (hybrid engine)
 */
export function deriveActiveProgramFromSkillFocus(skillIds: string[]): string {
  if (skillIds.length === 0) return 'calisthenics_upper';
  if (skillIds.length === 1) return skillIds[0];
  return 'calisthenics_upper';
}

function musclesToCategories(muscleIds: string[]): string[] {
  if (muscleIds.some((m) => m.toLowerCase() === 'full_body')) {
    return [...PRIMARY_CATEGORIES];
  }
  const seen: Record<string, boolean> = {};
  const result: string[] = [];
  const PRIMARY = ['push', 'pull', 'legs', 'core'];
  for (const m of muscleIds) {
    const lower = m.toLowerCase();
    if (PRIMARY.includes(lower)) {
      if (!seen[lower]) {
        seen[lower] = true;
        result.push(lower);
      }
    } else {
      const cat = MUSCLE_TO_CATEGORY[lower];
      if (cat && !seen[cat]) {
        seen[cat] = true;
        result.push(cat);
      }
    }
  }
  return result.length > 0 ? result : [...PRIMARY_CATEGORIES];
}

/**
 * Get path config for Path 1 and Path 2 (no async needed).
 */
export function getPathConfigSync(): AssessmentPathConfig {
  const path = getProgramPathFromStorage();

  if (path === 'health') {
    return {
      path: 'health',
      categories: [...PRIMARY_CATEGORIES],
      minLevel: 1,
      maxLevel: 25,
      skipTier: true,
      clampTierLevel: (lvl) => Math.max(1, Math.min(25, lvl)),
    };
  }

  if (path === 'body_focus') {
    const muscleIds = getMuscleFocusFromStorage();
    const categories = musclesToCategories(muscleIds);
    return {
      path: 'body_focus',
      categories,
      minLevel: 1,
      maxLevel: 25,
      skipTier: true,
      clampTierLevel: (lvl) => Math.max(1, Math.min(25, lvl)),
    };
  }

  if (path === 'skills') {
    const skillIds = getSkillFocusFromStorage();
    return {
      path: 'skills',
      categories: skillIds.length > 0 ? skillIds : [...PRIMARY_CATEGORIES],
      minLevel: 1,
      maxLevel: 25,
      skipTier: true,
      clampTierLevel: (lvl) => lvl,
    };
  }

  // Legacy / no path: full assessment (all 4 categories)
  return {
    path: null,
    categories: [...PRIMARY_CATEGORIES],
    minLevel: 1,
    maxLevel: 25,
    skipTier: false,
    clampTierLevel: (lvl) => lvl,
  };
}

/**
 * Load full config — fetches maxLevels per category from the programs collection.
 * Works for all paths (skills, health, body_focus, legacy).
 */
export async function loadPathConfigAsync(): Promise<AssessmentPathConfig> {
  const baseConfig = getPathConfigSync();
  const programs = await getAllPrograms();

  // Build a movementPattern → maxLevels map from child programs
  const patternMaxMap: Record<string, number> = {};
  for (const p of programs) {
    if (!p.isMaster && p.movementPattern && p.maxLevels) {
      patternMaxMap[p.movementPattern] = p.maxLevels;
    }
    // Also map by program ID directly
    if (p.maxLevels) {
      patternMaxMap[p.id] = p.maxLevels;
    }
  }

  if (baseConfig.path === 'skills') {
    const skillIds = getSkillFocusFromStorage();
    const skillMaxLevels: Record<string, number> = {};

    for (const skillId of skillIds.length > 0 ? skillIds : [...PRIMARY_CATEGORIES]) {
      if (patternMaxMap[skillId] != null) {
        skillMaxLevels[skillId] = patternMaxMap[skillId];
      } else {
        const settings = await getProgramLevelSettingsByProgram(skillId).catch(
          () => [],
        );
        const maxFromSettings =
          settings.length > 0
            ? Math.max(...settings.map((s) => s.levelNumber))
            : 15;
        skillMaxLevels[skillId] = maxFromSettings;
      }
    }

    return {
      ...baseConfig,
      categories: skillIds.length > 0 ? skillIds : [...PRIMARY_CATEGORIES],
      skillMaxLevels,
    };
  }

  // For primary categories — resolve maxLevels per category from program data
  const skillMaxLevels: Record<string, number> = {};
  for (const cat of baseConfig.categories) {
    const fromPattern = patternMaxMap[cat];
    if (fromPattern != null) {
      skillMaxLevels[cat] = fromPattern;
    }
  }

  return {
    ...baseConfig,
    skillMaxLevels: Object.keys(skillMaxLevels).length > 0 ? skillMaxLevels : undefined,
  };
}

/**
 * Get max level for a specific category, respecting per-program maxLevels.
 */
export function getMaxLevelForCategory(
  config: AssessmentPathConfig,
  category: string
): number {
  if (config.skillMaxLevels && config.skillMaxLevels[category] != null) {
    return config.skillMaxLevels[category];
  }
  return config.maxLevel;
}
