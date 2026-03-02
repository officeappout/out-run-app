/**
 * Split Decision Service — Dynamic Training Frequency & Split Engine
 *
 * Resolves sessionType, splitLogic, excludedMuscleGroups, and daily budget
 * based on user level, schedule frequency, and last session muscle usage.
 *
 * Universal Skill Distribution (Path C, 2+ skills):
 * - Dominance Day (scheduleDays >= skillCount): each skill gets its own day (65% / 35% maintenance)
 * - Dynamic Rotation (scheduleDays < skillCount): P1+P2 fixed, P3+ rotates into third slot
 *
 * @see split-decision.types.ts
 * @see FREQUENCY_SPLIT_RESEARCH.md
 */

import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import {
  SPLIT_MATRIX,
  getLevelTier,
  getFrequencyIndex,
  resolveSplitLogic,
  type SplitWorkoutContext,
  type SessionType,
} from './split-decision.types';
import { calculateWeeklyBudget } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';

const HABIT_BUILDER_SESSION_TYPES: SessionType[] = ['habit_builder', 'habit_builder_ultra'];
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/** Hebrew day letter for a date (Sun=א … Sat=ש). */
function getHebrewDayForDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return HEBREW_DAYS[d.getDay()];
}

/** Index of selectedDate within scheduleDays (0-based). -1 if not a training day. */
function getScheduleDayIndex(selectedDate: string, scheduleDays: string[]): number {
  const letter = getHebrewDayForDate(selectedDate);
  return scheduleDays.indexOf(letter);
}

/**
 * Get the base user level from progression (highest domain level).
 */
function getBaseUserLevel(profile: UserFullProfile): number {
  const domains = profile.progression?.domains ?? {};
  const tracks = profile.progression?.tracks ?? {};
  let maxLevel = 1;

  for (const [domainId, domainData] of Object.entries(domains)) {
    const trackLevel = tracks[domainId]?.currentLevel;
    const domainLevel = domainData?.currentLevel;
    const level = trackLevel ?? domainLevel ?? 1;
    if (level > maxLevel) maxLevel = level;
  }

  for (const [trackId, trackData] of Object.entries(tracks)) {
    if (!domains[trackId] && trackData?.currentLevel && trackData.currentLevel > maxLevel) {
      maxLevel = trackData.currentLevel;
    }
  }

  return maxLevel;
}

/**
 * Check if lastSessionDate is within 48 hours of selectedDate.
 */
function isWithin48Hours(lastSessionDate: string, selectedDate: string): boolean {
  const last = new Date(lastSessionDate);
  const sel = new Date(selectedDate);
  const diffMs = sel.getTime() - last.getTime();
  return diffMs >= 0 && diffMs < FORTY_EIGHT_HOURS_MS;
}

/**
 * Derive priority1, priority2, (and optionally priority3) skill IDs for dominance ratio.
 * - Path C multi-skill (calisthenics_upper + skillFocusIds): Dominance Day or Dynamic Rotation
 * - Push/Pull rotation: alternates based on lastSessionFocus
 * - Default: first two child programs as P1 and P2
 */
function resolvePrioritySkillIds(
  profile: UserFullProfile,
  sessionType: SessionType,
  lastSessionFocus: string | undefined,
  selectedDate: string,
  scheduleDays: string[]
): { priority1SkillIds: string[]; priority2SkillIds: string[]; priority3SkillIds?: string[] } {
  const skillFocusIds = profile.progression?.skillFocusIds;
  const activePrograms = profile.progression?.activePrograms ?? [];
  const hasCalisthenicsUpper = activePrograms.some((ap) => ap.id === 'calisthenics_upper' || ap.templateId === 'calisthenics_upper');

  // ── Path C: Universal Skill Distribution (2+ skills, calisthenics_upper) ──
  if (hasCalisthenicsUpper && skillFocusIds && skillFocusIds.length >= 2) {
    const skillCount = skillFocusIds.length;
    const dayIndex = getScheduleDayIndex(selectedDate, scheduleDays);

    if (dayIndex < 0) {
      return { priority1SkillIds: [], priority2SkillIds: [] };
    }

    // Dominance Day: scheduleDays >= skillCount — each skill gets its own day (65% / 35% maintenance)
    if (scheduleDays.length >= skillCount) {
      const dominantSkill = skillFocusIds[Math.min(dayIndex, skillCount - 1)];
      const maintenanceSkills = skillFocusIds.filter((s) => s !== dominantSkill);
      return {
        priority1SkillIds: [dominantSkill],
        priority2SkillIds: maintenanceSkills,
      };
    }

    // Dynamic Rotation: scheduleDays < skillCount — P1+P2 fixed, P3+ rotates into third slot
    const p1 = skillFocusIds[0];
    const p2 = skillFocusIds[1];
    const rotatingPool = skillFocusIds.slice(2);
    if (rotatingPool.length === 0) {
      return { priority1SkillIds: [p1], priority2SkillIds: [p2] };
    }
    const rotateIndex = dayIndex % rotatingPool.length;
    const p3 = rotatingPool[rotateIndex];
    return {
      priority1SkillIds: [p1],
      priority2SkillIds: [p2],
      priority3SkillIds: [p3],
    };
  }

  // ── Fallback: derive from activePrograms + tracks ──
  const tracks = profile.progression?.tracks ?? {};
  const allProgramIds = new Set<string>();
  for (const ap of activePrograms) {
    if (ap.templateId) allProgramIds.add(ap.templateId);
  }
  for (const tid of Object.keys(tracks)) {
    allProgramIds.add(tid);
  }

  const childPrograms = Array.from(allProgramIds).filter(
    (id) =>
      !['full_body', 'upper_body', 'lower_body'].includes(id) &&
      ['push', 'pull', 'legs', 'core', 'planche', 'oap', 'front_lever', 'handstand'].some(
        (slug) => id.toLowerCase().includes(slug) || id === slug
      )
  );

  if (childPrograms.length === 0) {
    return { priority1SkillIds: [], priority2SkillIds: [] };
  }

  // PPL 3-Way Rotation: push → pull → legs → push …
  const needsRotation =
    sessionType === 'push_pull_rotation' || sessionType === 'skill_dominance';

  if (needsRotation && childPrograms.length >= 2) {
    const pushLike = childPrograms.filter((p) =>
      ['push', 'planche', 'handstand'].some((s) => p.toLowerCase().includes(s))
    );
    const pullLike = childPrograms.filter((p) =>
      ['pull', 'oap', 'front_lever'].some((s) => p.toLowerCase().includes(s))
    );
    const legsLike = childPrograms.filter((p) =>
      ['legs', 'lower_body'].some((s) => p.toLowerCase().includes(s))
    );

    const PPL_ORDER: Array<'push' | 'pull' | 'legs'> = ['push', 'pull', 'legs'];
    const buckets: Record<string, string[]> = { push: pushLike, pull: pullLike, legs: legsLike };

    if (lastSessionFocus && PPL_ORDER.includes(lastSessionFocus as 'push' | 'pull' | 'legs')) {
      const curIdx = PPL_ORDER.indexOf(lastSessionFocus as 'push' | 'pull' | 'legs');
      const nextFocus = PPL_ORDER[(curIdx + 1) % 3];
      const afterFocus = PPL_ORDER[(curIdx + 2) % 3];
      const p1 = buckets[nextFocus];
      const p2 = buckets[afterFocus];

      if (p1.length > 0) {
        console.log(`[PPL Rotation] ${lastSessionFocus} → ${nextFocus} (P1), ${afterFocus} (P2)`);
        return {
          priority1SkillIds: p1,
          priority2SkillIds: p2.length > 0 ? p2 : buckets[lastSessionFocus] ?? [],
        };
      }
    }

    // First session or no match: default to push as P1
    if (pushLike.length > 0) {
      return {
        priority1SkillIds: pushLike,
        priority2SkillIds: pullLike.length > 0 ? pullLike : legsLike,
      };
    }
  }

  // Default: first two child programs as P1 and P2
  const [p1, p2] = childPrograms;
  return {
    priority1SkillIds: p1 ? [p1] : [],
    priority2SkillIds: p2 ? [p2] : [],
  };
}

export interface AggregateBudgetInfo {
  domainBudgets: { domain: string; level: number; weekly: number; daily: number }[];
  totalDailyBudget: number;
}

export interface GetWorkoutContextInput {
  userProfile: UserFullProfile;
  weeklyBudget?: number;
  selectedDate?: string;
  /** For Master Programs (full_body): per-domain aggregate from ProgramLevelSettings */
  aggregateBudgetInfo?: AggregateBudgetInfo;
  /** Phase 4: Per-domain completed sets this week (for deficit redistribution). */
  domainSetsCompletedThisWeek?: Record<string, number>;
  /** Phase 4: Training days remaining in the week (including today). */
  remainingScheduleDays?: number;
}

/**
 * Get the full split workout context for workout generation.
 *
 * @param input.userProfile - Full user profile
 * @param input.weeklyBudget - Weekly set budget (from Lead Program or calculateWeeklyBudget)
 * @param input.selectedDate - ISO date 'YYYY-MM-DD' for generation
 * @returns SplitWorkoutContext with splitType, excludedMuscleGroups, dailySetBudget, etc.
 */
export function getWorkoutContext(input: GetWorkoutContextInput): SplitWorkoutContext {
  const { userProfile, weeklyBudget, selectedDate, aggregateBudgetInfo } = input;
  const scheduleDays = (userProfile.lifestyle?.scheduleDays?.length ?? 0) || 3;
  const userLevel = getBaseUserLevel(userProfile);

  // ── DEBUG: Log input data for level troubleshooting ──
  const activeProgramId = userProfile.progression?.activePrograms?.[0]?.id ??
    userProfile.progression?.activePrograms?.[0]?.templateId;
  const progression = userProfile.progression;
  console.group('[SplitDecision] getWorkoutContext — Input Data');
  console.log('activeProgramId:', activeProgramId);
  console.log('progression.tracks:', progression?.tracks ?? '(none)');
  console.log('progression.domains:', progression?.domains ?? '(none)');
  console.log('progression.activePrograms:', progression?.activePrograms ?? '(none)');
  console.log('progression.skillFocusIds:', progression?.skillFocusIds ?? '(none)');
  console.log('progression.masterProgramSubLevels:', progression?.masterProgramSubLevels ?? '(none)');
  console.log('Derived userLevel (base):', userLevel);
  console.log('scheduleDays count:', scheduleDays);
  console.groupEnd();

  const freqIndex = getFrequencyIndex(scheduleDays);
  const levelTier = getLevelTier(userLevel);
  const sessionType = SPLIT_MATRIX[freqIndex]?.[levelTier] ?? 'full_body_ab';
  const splitLogic = resolveSplitLogic(sessionType);

  const scheduleDaysForBudget = Math.max(1, scheduleDays);
  let dailySetBudget: number;

  if (aggregateBudgetInfo) {
    // Master Program (full_body): use SUM of per-domain daily budgets
    dailySetBudget = Math.max(2, aggregateBudgetInfo.totalDailyBudget);
    console.group('[Budget Math Formulation] Aggregate (Master Program)');
    console.log('Source: Admin Panel (ProgramLevelSettings) per domain');
    console.log('Schedule Days:', scheduleDaysForBudget);
    for (const d of aggregateBudgetInfo.domainBudgets) {
      console.log(`  ${d.domain} (L${d.level}): ${d.weekly}/${scheduleDaysForBudget}=${d.daily}`);
    }
    console.log('Total Daily Budget =', dailySetBudget, 'sets');
    console.groupEnd();
  } else {
    const effectiveBudget =
      weeklyBudget ?? calculateWeeklyBudget(userLevel, scheduleDaysForBudget);
    dailySetBudget = Math.max(2, Math.floor(effectiveBudget / scheduleDaysForBudget));
    const budgetSource = weeklyBudget != null
      ? 'Admin Panel (ProgramLevelSettings)'
      : 'Fallback Calculation (userLevel × 2)';
    console.group('[Budget Math Formulation]');
    console.log('Base User Level:', userLevel);
    console.log('Schedule Days:', scheduleDaysForBudget);
    console.log('Source:', budgetSource);
    console.log('Effective Weekly Budget:', effectiveBudget);
    console.log('Daily Budget: Math.floor(Weekly / Days) = Math.floor(' + effectiveBudget + ' / ' + scheduleDaysForBudget + ') =', Math.floor(effectiveBudget / scheduleDaysForBudget));
    console.log('Final dailySetBudget (min 2):', dailySetBudget);
    console.groupEnd();
  }

  let excludedMuscleGroups: MuscleGroup[] = [];
  const lastSessionMuscleGroups = userProfile.progression?.lastSessionMuscleGroups;
  const lastSessionDate = userProfile.progression?.lastSessionDate;
  const lastSessionFocus = userProfile.progression?.lastSessionFocus;

  const isHabitBuilder = HABIT_BUILDER_SESSION_TYPES.includes(sessionType);
  const targetDate = selectedDate ?? new Date().toISOString().split('T')[0];

  if (
    isHabitBuilder &&
    lastSessionMuscleGroups &&
    lastSessionMuscleGroups.length > 0 &&
    lastSessionDate
  ) {
    if (isWithin48Hours(lastSessionDate, targetDate)) {
      excludedMuscleGroups = [...lastSessionMuscleGroups];
    }
  }

  const scheduleDaysList = userProfile.lifestyle?.scheduleDays ?? [];

  const { priority1SkillIds, priority2SkillIds, priority3SkillIds } = resolvePrioritySkillIds(
    userProfile,
    sessionType,
    lastSessionFocus,
    targetDate,
    scheduleDaysList
  );

  // When we have 3-way split (dynamic rotation), use 50/30/20 ratio
  const effectiveSplitLogic =
    priority3SkillIds && priority3SkillIds.length > 0
      ? {
          ...splitLogic,
          dominanceRatio: { p1: 0.5, p2: 0.3, p3: 0.2 },
        }
      : splitLogic;

  return {
    splitType: sessionType,
    splitLogic: effectiveSplitLogic,
    excludedMuscleGroups,
    dailySetBudget,
    lastSessionFocus,
    priority1SkillIds: priority1SkillIds.length > 0 ? priority1SkillIds : undefined,
    priority2SkillIds: priority2SkillIds.length > 0 ? priority2SkillIds : undefined,
    priority3SkillIds: priority3SkillIds?.length ? priority3SkillIds : undefined,
  };
}
