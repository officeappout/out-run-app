/**
 * Lead Program Resolution Service
 *
 * Implements the "Lead Program" model for shared pattern budgets:
 *
 *   1. Volume lives in **ProgramLevelSettings** (per-program, per-level).
 *   2. At workout-generation time, we find all active programs the user
 *      is enrolled in that share the same `movementPattern`.
 *   3. The program where the user has the **highest level** is the
 *      "Lead Program" — its `weeklyVolumeTarget` becomes the shared
 *      budget for every exercise under that pattern.
 *   4. Every completed set in ANY program of that pattern consumes
 *      the shared limit.
 *
 * Benefits:
 *   - The athlete's most advanced program dictates physiological capacity.
 *   - No redundant global config table.
 *   - Coaches configure per-program / per-level normally.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 *
 * @see ProgramLevelSettings  — data source
 * @see MovementPattern        — pattern taxonomy
 * @see TRAINING_LOGIC.md      — full rule reference
 */

import type { Program, MovementPattern, ProgramLevelSettings } from '@/features/content/programs/core/program.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';

// ============================================================================
// TYPES
// ============================================================================

/** Resolved budget for a specific movement pattern. */
export interface LeadProgramBudget {
  /** The program that "leads" this pattern (highest user level). */
  leadProgramId: string;
  /** That program's ID-friendly name (for logging). */
  leadProgramName: string;
  /** Movement pattern being resolved. */
  pattern: MovementPattern;
  /** The user's level in the lead program. */
  level: number;
  /** Weekly set budget for all exercises under this pattern. */
  weeklyVolumeTarget: number;
  /** Max 3-bolt sessions per week (from lead program). */
  maxIntenseWorkoutsPerWeek: number;
  /** Max sets per session (Safety Brake / Hard Cap). Prevents junk volume. */
  maxSets?: number;
}

// ============================================================================
// DEFAULTS
// ============================================================================

/** Default weekly volume target when no ProgramLevelSettings exist. */
export function getDefaultVolumeTarget(level: number): number {
  if (level <= 5) return 8;
  if (level <= 12) return 12;
  return 16;
}

/** Default max intense (3-bolt) sessions per week. */
export function getDefaultMaxIntense(level: number): number {
  if (level <= 5) return 0;
  if (level <= 12) return 2;
  return 99; // unlimited for advanced
}

/** Default max sets per session (Safety Brake) when no ProgramLevelSettings exist. */
export function getDefaultMaxSets(level: number): number {
  if (level <= 5) return 20;
  if (level <= 12) return 24;
  return 28;
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolve the Lead Program budget for a given movement pattern.
 *
 * @param pattern       The movement pattern to resolve (push, pull, legs, core).
 * @param userProfile   The full user profile (provides active programs + tracks).
 * @param allPrograms   Optional pre-fetched program list. If omitted, fetched from Firestore.
 * @returns             The resolved budget, or `null` if no matching programs found.
 */
export async function resolveLeadProgramBudget(
  pattern: MovementPattern,
  userProfile: UserFullProfile,
  allPrograms?: Program[],
): Promise<LeadProgramBudget | null> {
  const programs = allPrograms ?? await getAllPrograms();
  const tracks = userProfile.progression?.tracks ?? {};
  const activeIds = new Set(
    (userProfile.progression?.activePrograms ?? []).map(ap => ap.templateId),
  );

  // ── 1. Find programs matching the pattern that the user is actively enrolled in
  const candidates = programs.filter(
    p => p.movementPattern === pattern && !p.isMaster && activeIds.has(p.id),
  );

  if (candidates.length === 0) return null;

  // ── 2. Find the candidate where the user has the highest level
  let leadProgram: Program = candidates[0];
  let highestLevel = tracks[candidates[0].id]?.currentLevel ?? 1;

  for (let i = 1; i < candidates.length; i++) {
    const prog = candidates[i];
    const userLevel = tracks[prog.id]?.currentLevel ?? 1;
    if (userLevel > highestLevel) {
      highestLevel = userLevel;
      leadProgram = prog;
    }
  }

  // ── 3. Fetch ProgramLevelSettings for the lead program at that level
  let settings: ProgramLevelSettings | null = null;
  try {
    settings = await getProgramLevelSetting(leadProgram.id, highestLevel);
  } catch {
    console.warn(
      `[LeadProgram] Could not fetch settings for ${leadProgram.id} L${highestLevel}`,
    );
  }

  return {
    leadProgramId: leadProgram.id,
    leadProgramName: leadProgram.name,
    pattern,
    level: highestLevel,
    weeklyVolumeTarget:
      settings?.weeklyVolumeTarget ?? getDefaultVolumeTarget(highestLevel),
    maxIntenseWorkoutsPerWeek:
      settings?.maxIntenseWorkoutsPerWeek ?? getDefaultMaxIntense(highestLevel),
    maxSets: settings?.maxSets ?? getDefaultMaxSets(highestLevel),
  };
}

/**
 * Resolve the overall intensity gating limit across ALL patterns.
 *
 * `maxIntenseWorkoutsPerWeek` is a cross-cutting physiological limit —
 * not pattern-specific.  We take the **maximum** value across all active
 * lead programs so the most advanced level dictates total capacity.
 *
 * Falls back to a level-based default if no programs are resolved.
 */
export async function resolveGlobalMaxIntense(
  userProfile: UserFullProfile,
  allPrograms?: Program[],
): Promise<number> {
  const programs = allPrograms ?? await getAllPrograms();
  const patterns: MovementPattern[] = ['push', 'pull', 'legs', 'core'];

  let maxFound = -1;
  let resolved = false;

  for (const pat of patterns) {
    const budget = await resolveLeadProgramBudget(pat, userProfile, programs);
    if (budget) {
      maxFound = Math.max(maxFound, budget.maxIntenseWorkoutsPerWeek);
      resolved = true;
    }
  }

  if (!resolved) {
    // No active programs with a pattern — use base user level defaults
    const level = userProfile.progression?.domains?.overall?.currentLevel ?? 1;
    return getDefaultMaxIntense(level);
  }

  return maxFound;
}

/**
 * Resolve the Lead Program budget for the *active* program in a user profile.
 *
 * Convenience wrapper: identifies the active child program's pattern, then
 * delegates to `resolveLeadProgramBudget`.
 *
 * @param userProfile   The full user profile.
 * @param allPrograms   Optional pre-fetched program list.
 * @returns             Budget for the active pattern, or `null`.
 */
export async function resolveActiveProgramBudget(
  userProfile: UserFullProfile,
  allPrograms?: Program[],
): Promise<LeadProgramBudget | null> {
  const programs = allPrograms ?? await getAllPrograms();

  // Identify the active child program
  const activeTemplateId =
    userProfile.progression?.activePrograms?.[0]?.templateId;
  if (!activeTemplateId) return null;

  const activeProgram = programs.find(p => p.id === activeTemplateId);
  if (!activeProgram?.movementPattern) return null;

  return resolveLeadProgramBudget(
    activeProgram.movementPattern,
    userProfile,
    programs,
  );
}

/** Per-domain budget for aggregate full_body workouts */
export interface DomainBudgetEntry {
  domain: string;
  level: number;
  weekly: number;
  daily: number;
}

/**
 * Resolve AGGREGATE budget for Master Programs (full_body).
 * Uses userProgramLevels (from home-workout) for EXACT per-domain levels.
 * Fetches weeklyVolumeTarget from ProgramLevelSettings for each domain at that level.
 * Daily per domain = Math.ceil(domainWeekly / scheduleDays).
 * Total daily = SUM of daily domain budgets.
 */
export async function resolveAggregateFullBodyBudget(
  scheduleDays: number,
  userProgramLevels: Map<string, number>,
  allPrograms?: Program[],
): Promise<{ domainBudgets: DomainBudgetEntry[]; totalDailyBudget: number }> {
  const programs = allPrograms ?? await getAllPrograms();
  const patterns: MovementPattern[] = ['push', 'pull', 'legs', 'core'];
  const scheduleDaysForBudget = Math.max(1, scheduleDays);
  const domainBudgets: DomainBudgetEntry[] = [];

  for (const pattern of patterns) {
    const candidates = programs.filter(
      (p) => p.movementPattern === pattern && !p.isMaster
    );
    const program = candidates[0]; // Use first matching program for settings lookup
    const level =
      program
        ? userProgramLevels.get(program.id) ?? userProgramLevels.get(pattern) ?? 1
        : 1;

    let weekly = getDefaultVolumeTarget(level);
    if (program) {
      try {
        const settings = await getProgramLevelSetting(program.id, level);
        if (settings?.weeklyVolumeTarget != null) {
          weekly = settings.weeklyVolumeTarget;
        }
      } catch {
        console.warn(`[LeadProgram] Could not fetch settings for ${program.id} L${level}`);
      }
    }

    const daily = Math.ceil(weekly / scheduleDaysForBudget);
    domainBudgets.push({ domain: pattern, level, weekly, daily });
  }

  const totalDailyBudget = domainBudgets.reduce((sum, d) => sum + d.daily, 0);
  return { domainBudgets, totalDailyBudget };
}
