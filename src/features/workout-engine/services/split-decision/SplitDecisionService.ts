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
import { resolveChildDomainsForParent } from '../program-hierarchy.utils';
/**
 * Progression v2 Phase 3 — deliberate cross-domain reuse of progression-map's
 * gating logic (explicit instruction: "reuse Phase 1's getProgramState"),
 * same reasoning as Phase 2's own cross-import of Phase 1's gating service —
 * see target-program-fanout.service.ts's header comment. This is a NEW,
 * further boundary crossing (workout-engine -> progression-map; Phase 2's
 * was user/progression -> progression-map), so it gets its own note rather
 * than inheriting Phase 2's as cover.
 */
import { getProgramState } from '@/features/progression-map/services/program-gating.service';

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
 * Progression v2 Phase 3 — general priority source: activePrograms' own
 * array order (index 0 = highest priority; UserActiveProgram has no
 * separate priority field, per Phase 0/3's recon — array order IS the
 * priority signal). Each eligible entry is expanded via
 * resolveChildDomainsForParent, which ALREADY returns [templateId] itself
 * for a non-master and the assessed children for a master — so a master in
 * the active set keeps combining its children exactly as it does
 * everywhere else this function is used (e.g. exercise-eligibility
 * filtering), no new master-handling logic here.
 *
 * Gating: only a program that resolves to 'active' via Phase 1's
 * getProgramState feeds the generator — tracked/available/locked programs
 * are progression-only, never workout drivers (explicit product decision).
 * In practice, getProgramState's 'active' branch is a simple
 * activeProgramIds.has(programId) check that short-circuits before ever
 * touching its gate/tier parameters — so `tracks`/`tier`/`gate` below are
 * structurally-inert placeholders for this call pattern, not real values;
 * this still genuinely calls Phase 1's canonical function rather than
 * duplicating its 'active' check locally, and defends against a malformed
 * activePrograms entry (missing templateId) the same way everywhere else
 * that reads this array should.
 *
 * Returns one string[] per priority tier (index 0 = P1, 1 = P2, 2 = P3) —
 * only the top 3 eligible entries feed the dominance engine; a 4th+ active
 * program is not force-fitted into a tier (documented scope limit — its
 * exercises still reach the session via the ordinary/accessory exercise
 * pool, just without a guaranteed budget share).
 */
export function resolveActiveSetPriorityTiers(profile: UserFullProfile): string[][] {
  const activePrograms = profile.progression?.activePrograms ?? [];
  const activeProgramIds = new Set(
    activePrograms.map((ap) => ap.templateId).filter((id): id is string => !!id),
  );

  const tiers: string[][] = [];
  for (const ap of activePrograms) {
    if (!ap.templateId) continue;
    const state = getProgramState(
      { tracks: {}, tier: 1, activeProgramIds },
      ap.templateId,
      { status: 'available' },
    );
    if (state !== 'active') continue;

    const expanded = resolveChildDomainsForParent(ap.templateId, profile);
    tiers.push(expanded.length > 0 ? expanded : [ap.templateId]);
  }
  return tiers;
}

/**
 * Derive priority1, priority2, (and optionally priority3) skill IDs for dominance ratio.
 * - Path C multi-skill (calisthenics_upper + skillFocusIds): Dominance Day or Dynamic Rotation
 * - General active set (Progression v2 Phase 3): activePrograms array order, top 3 tiers
 */
export function resolvePrioritySkillIds(
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

  // ── General active-set fallback (Progression v2 Phase 3) ──────────────
  // Replaces the old tracks-derived, hardcoded-whitelist, gender/PPL-
  // heuristic reordering: activePrograms' own array order now IS the
  // priority signal (see resolveActiveSetPriorityTiers above). A single
  // active program yields P1-only, P2 empty — which keeps
  // selectExercisesWithDominance's own caller-side gate closed exactly as
  // it is today (that gate requires priority2SkillIds or
  // priority3SkillIds to be non-empty), so single-active-program
  // generation takes the SAME code path it does today, unchanged.
  const activeSetTiers = resolveActiveSetPriorityTiers(profile);
  if (activeSetTiers.length === 0) {
    return { priority1SkillIds: [], priority2SkillIds: [] };
  }
  return {
    priority1SkillIds: activeSetTiers[0] ?? [],
    priority2SkillIds: activeSetTiers[1] ?? [],
    priority3SkillIds: activeSetTiers[2],
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
  // ③: empty schedule → default 2 training days (was 3) → a denser first-workout budget
  // (ceil(weekly/2) instead of ceil(weekly/3)) for a stronger first impression.
  const scheduleDays = (userProfile.lifestyle?.scheduleDays?.length ?? 0) || 2;
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
