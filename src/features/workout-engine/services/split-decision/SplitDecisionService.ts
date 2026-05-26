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

import { getBaseUserLevel } from '../level-resolution.utils';

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
): {
  priority1SkillIds: string[];
  priority2SkillIds: string[];
  priority3SkillIds?: string[];
  pendulumFocus?: 'push_focus' | 'pull_focus' | 'hybrid_blend';
} {
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

    // ── Pendulum Split: 3 training days + exactly 2 skills ──────────────────
    // The calendar-static Dominance Day path (below) produces "day 2 always
    // repeats skillFocusIds[1]" when scheduleDays.length === 3 and skillCount
    // === 2.  The Pendulum replaces that with an adaptive lastSessionFocus-
    // driven alternation so every third-day session is a hybrid blend:
    //
    //   lastSessionFocus undefined → hybrid_blend (50/50, bootstrap session)
    //   lastSessionFocus 'push'    → pull_focus   (pull-vector skill P1 65%)
    //   lastSessionFocus 'pull'    → push_focus   (push-vector skill P1 65%)
    //   lastSessionFocus 'hybrid'  → push_focus   (restart the cycle)
    if (scheduleDays.length === 3 && skillCount === 2) {
      // Classify each skill ID by biomechanical domain (push-vector vs pull-vector).
      const PUSH_PATTERNS = ['planche', 'handstand', 'hspu'];
      const PULL_PATTERNS = ['front_lever', 'muscle_up', 'back_lever', 'oap', 'pull'];

      const pushSkill =
        skillFocusIds.find(s => PUSH_PATTERNS.some(p => s.toLowerCase().includes(p)))
        ?? skillFocusIds[0];
      const pullSkill =
        skillFocusIds.find(s => PULL_PATTERNS.some(p => s.toLowerCase().includes(p)))
        ?? skillFocusIds[1];

      let pendulumFocus: 'push_focus' | 'pull_focus' | 'hybrid_blend';
      let p1: string[];
      let p2: string[];

      if (!lastSessionFocus || lastSessionFocus === 'hybrid') {
        pendulumFocus = 'hybrid_blend';
        p1 = [pushSkill];
        p2 = [pullSkill];
      } else if (lastSessionFocus === 'push' || lastSessionFocus === pushSkill) {
        pendulumFocus = 'pull_focus';
        p1 = [pullSkill];
        p2 = [pushSkill];
      } else {
        pendulumFocus = 'push_focus';
        p1 = [pushSkill];
        p2 = [pullSkill];
      }

      console.log(
        `[Pendulum] lastFocus=${lastSessionFocus ?? 'none'} → ${pendulumFocus} ` +
        `P1=[${p1.join(',')}] P2=[${p2.join(',')}]`,
      );

      return { priority1SkillIds: p1, priority2SkillIds: p2, pendulumFocus };
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

  // ── Gender-Aware Dominance Sort ────────────────────────────────────────
  // Before picking P1/P2 from Set insertion order, sort childPrograms so the
  // biologically-appropriate dominant domains always land first.
  //
  //   Male (or unspecified): upper-body compound tracks → P1/P2, legs/core → P3+
  //   Female:                lower-body tracks → P1, upper-body → P2+
  //
  // Tier values (lower = higher priority):
  //   Male:   push/pull/planche/oap/front_lever/handstand → 0
  //           legs/core                                    → 1
  //           everything else                              → 2
  //   Female: legs/glutes                                  → 0
  //           push/pull and skill tracks                   → 1
  //           everything else                              → 2
  const gender: 'male' | 'female' | undefined = (profile as any).gender;
  const isFemale = gender === 'female';

  const UPPER_SLUGS  = ['push', 'pull', 'planche', 'oap', 'front_lever', 'handstand', 'muscle_up'];
  const LOWER_SLUGS  = ['legs', 'lower_body', 'glutes', 'hinge', 'squat', 'lunge'];

  const dominanceTier = (id: string): number => {
    const lower = id.toLowerCase();
    if (isFemale) {
      if (LOWER_SLUGS.some(s => lower.includes(s))) return 0;
      if (UPPER_SLUGS.some(s => lower.includes(s))) return 1;
      return 2;
    }
    // Male / default: upper-body first
    if (UPPER_SLUGS.some(s => lower.includes(s))) return 0;
    if (LOWER_SLUGS.some(s => lower.includes(s))) return 1;
    return 2;
  };

  const sortedPrograms = [...childPrograms].sort((a, b) => dominanceTier(a) - dominanceTier(b));
  console.log(
    `[SplitDecision] P1/P2 sort (gender=${gender ?? 'default/male'}): ` +
    `[${sortedPrograms.join(', ')}]`,
  );

  // Default: first two child programs as P1 and P2
  const [p1, p2] = sortedPrograms;
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
  /**
   * When true (Custom Builder / manual override), the weekly deficit-redistribution
   * clamping is skipped entirely so manual sessions always receive a viable set
   * budget even when the weekly quota is exhausted.
   *
   * Without this bypass, Remaining Sets = 0 collapses dailySetBudget to the
   * min-2 floor → domain quotas → 0 → "DOMAIN QUOTA FAILED" for every skill.
   */
  isManualOverride?: boolean;
}

/**
 * Detect domain deficits and determine if session merging is needed.
 * Compares completed sets per domain against expected weekly budget.
 * Returns the most-underserved domain if deficit exceeds 40% of weekly target.
 */
function detectDomainDeficit(
  domainSetsCompletedThisWeek: Record<string, number>,
  aggregateBudgetInfo: AggregateBudgetInfo | undefined,
  remainingScheduleDays: number,
): { deficitDomain: string; deficitSets: number; deficitPercent: number } | undefined {
  if (!aggregateBudgetInfo || remainingScheduleDays <= 0) return undefined;

  const DEFICIT_THRESHOLD_PERCENT = 0.4;
  let worstDomain: string | undefined;
  let worstDeficitPercent = 0;
  let worstDeficitSets = 0;

  for (const db of aggregateBudgetInfo.domainBudgets) {
    const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
    const expected = db.weekly;
    if (expected <= 0) continue;

    const deficit = expected - completed;
    const deficitPercent = deficit / expected;

    if (deficitPercent > DEFICIT_THRESHOLD_PERCENT && deficitPercent > worstDeficitPercent) {
      worstDomain = db.domain;
      worstDeficitPercent = deficitPercent;
      worstDeficitSets = deficit;
    }
  }

  if (!worstDomain) return undefined;

  return {
    deficitDomain: worstDomain,
    deficitSets: worstDeficitSets,
    deficitPercent: worstDeficitPercent,
  };
}

/**
 * Apply smart merging: if a domain has a significant deficit, override the
 * session type to broaden coverage. For example, a 'pull' deficit when the
 * next session is 'push' → upgrade to 'upper_lower' to catch up on pull.
 */
function applySmartMerge(
  sessionType: SessionType,
  deficit: { deficitDomain: string; deficitSets: number; deficitPercent: number },
): { mergedSessionType: SessionType; mergeApplied: boolean } {
  const PUSH_DOMAINS = new Set(['push']);
  const PULL_DOMAINS = new Set(['pull']);
  const UPPER_DOMAINS = new Set(['push', 'pull']);
  const LOWER_DOMAINS = new Set(['legs', 'core']);

  const domain = deficit.deficitDomain;
  const isUpperSession = ['push_pull_mixed', 'push_pull_rotation', 'upper_lower'].includes(sessionType);
  const isFullBody = sessionType.startsWith('full_body');

  if (isFullBody) return { mergedSessionType: sessionType, mergeApplied: false };

  if (UPPER_DOMAINS.has(domain) && !isUpperSession) {
    console.log(
      `[Smart Merge] Domain "${domain}" deficit ${Math.round(deficit.deficitPercent * 100)}% → ` +
      `upgrading ${sessionType} to full_body_high for catch-up`,
    );
    return { mergedSessionType: 'full_body_high', mergeApplied: true };
  }

  if (LOWER_DOMAINS.has(domain) && isUpperSession) {
    console.log(
      `[Smart Merge] Domain "${domain}" deficit ${Math.round(deficit.deficitPercent * 100)}% → ` +
      `upgrading ${sessionType} to full_body_high for catch-up`,
    );
    return { mergedSessionType: 'full_body_high', mergeApplied: true };
  }

  if ((PUSH_DOMAINS.has(domain) || PULL_DOMAINS.has(domain)) && sessionType === 'push_pull_legs') {
    console.log(
      `[Smart Merge] Domain "${domain}" deficit ${Math.round(deficit.deficitPercent * 100)}% → ` +
      `shifting push_pull_legs priority to include ${domain}`,
    );
    return { mergedSessionType: 'upper_lower', mergeApplied: true };
  }

  return { mergedSessionType: sessionType, mergeApplied: false };
}

export function getWorkoutContext(input: GetWorkoutContextInput): SplitWorkoutContext {
  const { userProfile, weeklyBudget, selectedDate, aggregateBudgetInfo,
          domainSetsCompletedThisWeek, remainingScheduleDays, isManualOverride } = input;
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
  let sessionType: SessionType = SPLIT_MATRIX[freqIndex]?.[levelTier] ?? 'full_body_ab';

  // ── Smart Merging: volume-based recovery ──────────────────────────────
  let mergeApplied = false;
  if (domainSetsCompletedThisWeek && remainingScheduleDays != null && remainingScheduleDays > 0) {
    const deficit = detectDomainDeficit(
      domainSetsCompletedThisWeek,
      aggregateBudgetInfo,
      remainingScheduleDays,
    );
    if (deficit) {
      const merge = applySmartMerge(sessionType, deficit);
      if (merge.mergeApplied) {
        sessionType = merge.mergedSessionType;
        mergeApplied = true;
      }
    }
  }

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

    if (isManualOverride) {
      // ── Manual Override: Bypass Deficit Clamping ──────────────────────────
      // Custom Builder sessions must never be throttled by exhausted weekly
      // budgets.  A user explicitly picking Planche or Front Lever deserves a
      // full-strength session — the deficit counter belongs to the automated
      // scheduler, not to manual intent.
      //
      // Formula: use the full weekly budget spread across the total schedule days
      // (ignoring remaining days so we don't under-serve mid-week overrides),
      // then apply a MANUAL_BASELINE_SETS floor so even low-level users with a
      // small weekly budget still receive enough set slots for domain quotas.
      const MANUAL_BASELINE_SETS = 14;
      const rawDaily = Math.ceil(effectiveBudget / scheduleDaysForBudget);
      dailySetBudget = Math.max(MANUAL_BASELINE_SETS, rawDaily);

      console.group('[Budget Math Formulation] [Manual Override — Deficit Bypass]');
      console.log('Source: Custom Builder (isManualOverride=true) — deficit clamping skipped');
      console.log('Base User Level:', userLevel);
      console.log('Effective Weekly Budget:', effectiveBudget);
      console.log('Schedule Days:', scheduleDaysForBudget);
      console.log('Raw Daily (budget/days):', rawDaily);
      console.log('Final dailySetBudget (min', MANUAL_BASELINE_SETS, '):', dailySetBudget);
      console.groupEnd();
    } else {
      // ── Deficit-Aware Daily Budget (Phase 4 parity for single-track) ──────
      // Sum completed sets across all tracked domains this week.
      // For a pure single-track user (e.g. Pull) this equals sets done in Pull.
      // For multi-domain users the sum is a safe over-estimate that keeps volume
      // conservative — the same behaviour as the Full Body path.
      const totalCompletedThisWeek = domainSetsCompletedThisWeek
        ? Object.values(domainSetsCompletedThisWeek).reduce((s, n) => s + n, 0)
        : 0;
      // Use remaining training days when available, fall back to the full
      // schedule frequency so the formula degrades gracefully on first load.
      const effectiveDays = (remainingScheduleDays && remainingScheduleDays > 0)
        ? remainingScheduleDays
        : scheduleDaysForBudget;
      const remainingSets = Math.max(0, effectiveBudget - totalCompletedThisWeek);
      dailySetBudget = Math.max(2, Math.ceil(remainingSets / effectiveDays));

      const budgetSource = weeklyBudget != null
        ? 'Admin Panel (ProgramLevelSettings)'
        : 'Fallback Calculation (userLevel × 2)';
      const isDynamic = totalCompletedThisWeek > 0 || (remainingScheduleDays != null);

      console.group('[Budget Math Formulation]' + (isDynamic ? ' [Deficit-Aware]' : ' [Static]'));
      console.log('Base User Level:', userLevel);
      console.log('Schedule Days (total / remaining):', scheduleDaysForBudget, '/', effectiveDays);
      console.log('Source:', budgetSource);
      console.log('Effective Weekly Budget:', effectiveBudget);
      console.log('Completed This Week (all domains):', totalCompletedThisWeek);
      console.log('Remaining Sets:', remainingSets, `= ${effectiveBudget} − ${totalCompletedThisWeek}`);
      console.log('Daily Budget: ceil(' + remainingSets + ' / ' + effectiveDays + ') =', Math.ceil(remainingSets / effectiveDays));
      console.log('Final dailySetBudget (min 2):', dailySetBudget);
      console.groupEnd();
    }
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

  const { priority1SkillIds, priority2SkillIds, priority3SkillIds, pendulumFocus } = resolvePrioritySkillIds(
    userProfile,
    sessionType,
    lastSessionFocus,
    targetDate,
    scheduleDaysList
  );

  // When we have 3-way split (dynamic rotation), use 50/30/20 ratio.
  // When pendulumFocus === 'hybrid_blend', both skills carry equal 50/50 weight.
  // For push_focus / pull_focus the standard 65/35 dominance ratio applies.
  const effectiveSplitLogic =
    priority3SkillIds && priority3SkillIds.length > 0
      ? {
          ...splitLogic,
          dominanceRatio: { p1: 0.5, p2: 0.3, p3: 0.2 },
        }
      : pendulumFocus === 'hybrid_blend'
        ? {
            ...splitLogic,
            dominanceRatio: { p1: 0.5, p2: 0.5 },
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
    pendulumFocus,
  };
}
