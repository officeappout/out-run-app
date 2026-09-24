/**
 * Assessment Path Config Service
 *
 * Reads the selected program-path card(s) from sessionStorage and returns a
 * union-resolved config for slider categories and ranges.
 *
 * Cards: Health (fixed push/pull/legs/core), Body Focus (muscle chips →
 * categories), Skills (calisthenics elements, each with its own ladder).
 * Cards are co-selectable (Phase 1, multi-select program path) — priority is
 * tap order, persisted as an ordered array. `getPathConfigSync`/
 * `loadPathConfigAsync` union every selected card's assessment set, then
 * apply the D3 collision rule: a push/pull-deriving skill (planche/
 * handstand/hspu → push; front_lever/muscle_up/one_arm_pullup → pull)
 * suppresses the direct push/pull category slider for a same-domain
 * muscle/Health selection — the muscle/Health pick is still recorded as
 * focus, just without a redundant coarse slider. D2: any skill selection
 * also gets a `core` category slider (auto-added), so skill users are no
 * longer permanently unassessed on core.
 */

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getProgramLevelSettingsByProgram } from '@/features/content/programs/core/programLevelSettings.service';
import { SKILL_TO_FOUNDATION_DOMAIN } from '../constants/skill-foundation-domain.constants';
import type { ExerciseWishlistEntry } from '@/features/user/core/types/user.types';

// Mirrors mini-domain-assessment.ts's MINI_ASSESSMENT_ACTIVE_KEY. Not imported
// from that module directly — this is a lean, dependency-free utility file,
// and this repo's own convention for sessionStorage key names (see
// 'onboarding_program_path' below, duplicated rather than shared) is a plain
// literal on both the reader and writer side.
const MINI_ASSESSMENT_ACTIVE_KEY = 'mini_assessment_active';

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

export type ProgramPathType = 'health' | 'body_focus' | 'skills' | null;

export interface AssessmentPathConfig {
  /** Primary (highest-priority / first-selected) card — back-compat for
   *  single-value consumers (ProgramResult.tsx, ScheduleStep.tsx,
   *  scheduleSeed.service.ts, and every `pathConfig?.path === '...'` check
   *  elsewhere in this flow that predates multi-select). */
  path: ProgramPathType;
  /** Full ordered card selection, priority = array order. Empty for the
   *  legacy/no-selection fallback. */
  cardOrder: ProgramPathType[];
  /** Union-resolved, deduped, D3-collision-suppressed assessment set —
   *  skill program IDs (each with its own ladder) first, then literal
   *  categories (push/pull/legs/core), 'core' auto-added last for any
   *  skill selection (D2). */
  categories: string[];
  /** The selected skill program IDs (empty unless the Skills card is part
   *  of the selection) — the authoritative signal for "does this
   *  assessment include skill ladders," since `categories` alone can no
   *  longer be assumed to be all-skill-IDs once other cards are unioned in. */
  skillIds: string[];
  minLevel: number;
  maxLevel: number;
  /** Max level per skill program ID (and per literal category, where CMS
   *  data resolves one). */
  skillMaxLevels?: Record<string, number>;
  /** Skip tier selection, go straight to sliders. */
  skipTier: boolean;
  /** Clamp a tier-derived initial level to range. */
  clampTierLevel: (tierLevel: number) => number;
}

function normalizeProgramPathValue(v: unknown): Exclude<ProgramPathType, null> | null {
  if (v === 'health' || v === 'beginner') return 'health';
  if (v === 'body_focus' || v === 'intermediate') return 'body_focus';
  if (v === 'skills') return 'skills';
  return null;
}

/**
 * Reads the ordered card-priority list from storage.
 *
 * New shape (Phase 1, multi-select program path): a JSON array of card IDs
 * in priority order, e.g. `'["skills","body_focus"]'`.
 *
 * Back-compat guard: a legacy bare string (`'skills'`, `'body_focus'`,
 * `'health'`, or the older `'beginner'`/`'intermediate'` aliases) is treated
 * as a one-item priority list. This is not just old-data hygiene — it's the
 * live shape `mini-domain-assessment.ts`'s `startMiniDomainAssessment` still
 * writes today (a single-domain top-up entry point, separate from the
 * program-path screen), so this guard must keep resolving it correctly.
 */
export function getProgramPathListFromStorage(): Exclude<ProgramPathType, null>[] {
  if (typeof window === 'undefined') return [];
  const raw = sessionStorage.getItem('onboarding_program_path');
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((v) => normalizeProgramPathValue(v))
        .filter((v): v is Exclude<ProgramPathType, null> => v !== null);
      return normalized;
    }
  } catch {
    // Not JSON — fall through to legacy bare-string handling below.
  }

  const normalized = normalizeProgramPathValue(raw);
  return normalized ? [normalized] : [];
}

/** Back-compat: the primary (first-priority) selected card, or null if none.
 *  Unchanged return type/contract — existing read-only consumers
 *  (ProgramResult.tsx, ScheduleStep.tsx, scheduleSeed.service.ts,
 *  onboarding-sync.service.ts) keep working exactly as before. */
export function getProgramPathFromStorage(): ProgramPathType {
  return getProgramPathListFromStorage()[0] ?? null;
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

const WISHLIST_PACKAGE_KEYS = new Set(['push', 'pull', 'legs', 'core']);

/** Mirrors getMuscleFocusFromStorage()'s shape — Slice 2b exercise wishlist. */
export function getExerciseWishlistFromStorage(): ExerciseWishlistEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem('onboarding_exercise_wishlist');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown): e is ExerciseWishlistEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as ExerciseWishlistEntry).exerciseId === 'string' &&
        WISHLIST_PACKAGE_KEYS.has((e as ExerciseWishlistEntry).packageKey) &&
        typeof (e as ExerciseWishlistEntry).addedAt === 'string' &&
        (e as ExerciseWishlistEntry).source === 'onboarding'
    );
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
  glutes: 'legs',
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
 * D3: a push/pull-deriving skill (SKILL_TO_FOUNDATION_DOMAIN) suppresses the
 * direct push/pull category slider for a same-domain selection — applies
 * uniformly whether that category came from a muscle chip or from Health's
 * fixed 4-category set, since by this point both have already been
 * flattened into the same `categories` list (the union doesn't track
 * source). The muscle/Health selection itself is untouched elsewhere
 * (still recorded as focus) — only the redundant slider is removed here.
 */
export function applySkillCollisionSuppression(
  categories: string[],
  skillIds: string[],
): string[] {
  const derivedDomains = new Set(
    skillIds
      .map((id) => SKILL_TO_FOUNDATION_DOMAIN[id])
      .filter((d): d is 'push' | 'pull' => d != null),
  );
  if (derivedDomains.size === 0) return categories;
  return categories.filter((cat) => !derivedDomains.has(cat as 'push' | 'pull'));
}

/** True while a single-domain "mini top-up" assessment is in progress
 *  (mini-domain-assessment.ts). D2's auto-core addition is intentionally
 *  skipped in this mode — that flow's contract is a single-domain
 *  assessment (one skill, one category), and unconditionally adding a
 *  second 'core' step would silently turn an already-onboarded user's
 *  one-tap top-up (from ProgramsSection/StatsOverview/WorkoutBuilderSheet)
 *  into a 2-step flow. D2 is scoped to the full onboarding entry point. */
function isMiniAssessmentActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MINI_ASSESSMENT_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function resolveUnionCategories(
  cardOrder: Exclude<ProgramPathType, null>[],
  skillIds: string[],
  muscleIds: string[],
  addAutoCore: boolean,
): string[] {
  let literalCategories: string[] = [];
  if (cardOrder.includes('health')) {
    literalCategories.push(...PRIMARY_CATEGORIES);
  }
  if (muscleIds.length > 0) {
    literalCategories.push(...musclesToCategories(muscleIds));
  }
  literalCategories = Array.from(new Set(literalCategories));
  literalCategories = applySkillCollisionSuppression(literalCategories, skillIds);

  const unioned = [
    ...skillIds,
    ...literalCategories,
    ...(skillIds.length > 0 && addAutoCore ? ['core'] : []),
  ];
  const deduped = Array.from(new Set(unioned));
  return deduped.length > 0 ? deduped : [...PRIMARY_CATEGORIES];
}

/**
 * Get path config synchronously (no CMS fetch needed for categories/minLevel).
 */
export function getPathConfigSync(): AssessmentPathConfig {
  const cardOrder = getProgramPathListFromStorage();
  const path = cardOrder[0] ?? null;

  if (cardOrder.length === 0) {
    // Legacy / no path: full assessment (all 4 categories)
    return {
      path: null,
      cardOrder: [],
      categories: [...PRIMARY_CATEGORIES],
      skillIds: [],
      minLevel: 1,
      maxLevel: 25,
      skipTier: false,
      clampTierLevel: (lvl) => lvl,
    };
  }

  const skillIds = cardOrder.includes('skills') ? getSkillFocusFromStorage() : [];
  const muscleIds = cardOrder.includes('body_focus') ? getMuscleFocusFromStorage() : [];
  const categories = resolveUnionCategories(cardOrder, skillIds, muscleIds, !isMiniAssessmentActive());

  return {
    path,
    cardOrder,
    categories,
    skillIds,
    minLevel: 1,
    maxLevel: 25,
    skipTier: true,
    clampTierLevel: skillIds.length > 0 ? (lvl) => lvl : (lvl) => Math.max(1, Math.min(25, lvl)),
  };
}

/**
 * Load full config — fetches maxLevels per category/skill from the programs
 * collection. Works for any card combination (skills, health, body_focus,
 * unioned, or the legacy/no-selection fallback).
 */
export async function loadPathConfigAsync(): Promise<AssessmentPathConfig> {
  const baseConfig = getPathConfigSync();
  const programs = await getAllPrograms();

  // Build a movementPattern/programId → maxLevels map from child programs.
  // This already covers BOTH literal category names (via movementPattern,
  // e.g. 'push') AND skill program IDs (via p.id, e.g. 'planche') uniformly.
  const patternMaxMap: Record<string, number> = {};
  for (const p of programs) {
    if (!p.isMaster && p.movementPattern && p.maxLevels) {
      patternMaxMap[p.movementPattern] = p.maxLevels;
    }
    if (p.maxLevels) {
      patternMaxMap[p.id] = p.maxLevels;
    }
  }

  const skillIdSet = new Set(baseConfig.skillIds);
  const skillMaxLevels: Record<string, number> = {};

  for (const cat of baseConfig.categories) {
    if (patternMaxMap[cat] != null) {
      skillMaxLevels[cat] = patternMaxMap[cat];
      continue;
    }
    // Skill IDs not covered by patternMaxMap fall back to the program's own
    // level-settings docs (mirrors the old skills-only branch's fallback).
    if (skillIdSet.has(cat)) {
      const settings = await getProgramLevelSettingsByProgram(cat).catch(() => []);
      const maxFromSettings =
        settings.length > 0 ? Math.max(...settings.map((s) => s.levelNumber)) : 15;
      skillMaxLevels[cat] = maxFromSettings;
    }
    // Literal categories with no CMS data are left out — getMaxLevelForCategory
    // falls back to config.maxLevel (25) for them.
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
