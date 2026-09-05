/**
 * weaveWeek's missing consumer — reads a user's SAVED profile and builds
 * weaveWeek's input from it. Documented as a gap in
 * schedule-drawer-screen-spec.md; this file closes it.
 *
 * Pure function. No Firestore, no network, no internal `new Date()` —
 * `asOfDate` is always supplied by the caller (matches `buildRunningPlan`'s
 * own `asOfDate` parameter elsewhere in this codebase, same reasoning:
 * deterministic, testable, no hidden clock read).
 *
 * Deliberately does NOT import the real `UserFullProfile` type
 * (`@/features/user/core/types/user.types.ts`) — same reverse-layer-
 * dependency rule `scheduleSeed.service.ts` already follows (`schedule`
 * must not import from `user`). `WeaverInputProfile` below is a narrower,
 * structurally-typed subset, wide enough for what this file actually reads.
 */

import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { RunningDayRole, RunningWeekDay } from './runningRules';
import type { ScheduleDay } from '../types/smartSchedule.types';
import type { WeaveWeekInput } from './scheduleWeaver';
import { strengthRuleFamily, runningRuleFamily } from './ruleFamily';
import { buildDefaultTemplate } from './scheduleRules';
import {
  resolveScheduleSeed,
  type ScheduleSeedProfileInput,
} from '../services/scheduleSeed.service';
import { isSkillId, isProgramId, DAY_LETTERS } from '../types/smartSchedule.types';
import { hasStrengthTrack, hasRunningTrack } from '@/lib/track-ownership';

/**
 * Same formula as `workout-completion.service.ts`'s `calculateCurrentWeek`
 * — not imported from there, since that file imports `firebase/firestore`
 * and `@/lib/firebase` at the top level (for its OTHER exports, which do
 * live writes); importing anything from it here would pull the Firebase
 * client SDK into this module's import graph, the exact purity violation
 * `crossDomainRules.ts` already avoids for `WHO_STRENGTH_TARGET_DAYS`
 * (same reasoning, different file). Six-line formula, not worth a shared
 * module split for this alone.
 */
function calculateCurrentWeek(startDate: Date | string | number, asOfDate: Date): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date(asOfDate);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * R7's floor (WHO 2020: 2 strength days/week). Hardcoded here, not imported
 * from `weekly-load.service.ts`'s `WHO_STRENGTH_TARGET_DAYS` — that file
 * does live Firestore reads (`getDocs`) at import time, and this module
 * must stay pure. Same reasoning, same value, as `crossDomainRules.ts`'s
 * own `CrossDomainValidateContext.minStrengthDaysPerWeek` doc comment.
 */
const R7_FLOOR = 2;

export interface WeaverInputProfile {
  progression?: ScheduleSeedProfileInput['progression'] & {
    domains?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
    tracks?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
  };
  running?: {
    isUnlocked?: unknown;
    scheduleDays?: string[];
    activeProgram?: {
      startDate: Date | string | number;
      schedule: Array<{
        week: number;
        day: number;
        category?: WorkoutCategory;
        isQualityWorkout?: boolean;
        slotType?: RunningDayRole;
      }>;
    };
    /** Only `targetDistance` is read here, to derive RUN-05's `targetDistanceKm` — see buildRunningSide's doc. */
    generatedProgramTemplate?: { targetDistance?: string };
  };
  lifestyle?: {
    recurringTemplate?: Partial<Record<string, string[]>>;
    scheduleDays?: string[];
  };
}

function allRestStrengthWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i as ScheduleDay['dayOfWeek'],
    sessions: [],
    isRestDay: true,
    warnings: [],
  }));
}

function allRestRunningWeek(): RunningWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
}

/**
 * Counts strength-owned days in `lifestyle.recurringTemplate` — NOT
 * `lifestyle.scheduleDays.length`. `scheduleDays` is a known-contaminated
 * merged array (running days get folded in too, per
 * `.claude/knowledge/parking-lot.md`'s "lifestyle.scheduleDays מצטבר" entry)
 * — using its raw length here would overcount strength for any dual-track
 * user. `recurringTemplate[day]` can hold both domains' ids in the same
 * array (gap-map finding #9, `mergeDayItems.ts`); a day counts as a
 * strength day here only if at least one of its ids is strength-owned
 * (`isSkillId`/`isProgramId` — the same closed-set check `mergeDayItems.ts`
 * uses, not re-exported from there since it's a one-line composition).
 */
function countStrengthDaysFromRecurringTemplate(
  recurringTemplate: Partial<Record<string, string[]>> | undefined,
): number | null {
  if (!recurringTemplate) return null;
  let count = 0;
  for (const ids of Object.values(recurringTemplate)) {
    if (ids?.some((id) => isSkillId(id) || isProgramId(id))) count++;
  }
  return count;
}

/**
 * Builds the strength side of WeaveWeekInput.
 *
 * `existingWeek`'s CONTENT doesn't independently matter for what strength
 * ultimately produces — `strengthRuleFamily.placeOn`/`reduceTo` both
 * rebuild fresh via `buildDefaultTemplate(programs, skills, count)`
 * regardless of the `week` argument (confirmed by reading `ruleFamily.ts`'s
 * `strengthPlaceOn` — it never reads its `week` parameter at all). So
 * `existingWeek` here is just `buildDefaultTemplate` run once, for the
 * count already established — not a separate reconstruction path.
 *
 * `buildDefaultTemplate(programs, skills, 0)` does NOT return an empty week
 * — `scheduleRules.ts`'s internal `preferredDays(0)` falls through its
 * `daysPerWeek <= 1 → [0]` branch and returns a 1-day week, treating 0 the
 * same as 1. A genuinely-unowned or zero-day strength side must bypass
 * `buildDefaultTemplate` entirely and use an explicit all-rest week
 * instead, or every "no strength" case would silently render as "one
 * strength day."
 */
function buildStrengthSide(
  profile: WeaverInputProfile,
  owns: boolean,
): { existingWeek: ScheduleDay[]; requestedCount: number; programs: ReturnType<typeof resolveScheduleSeed>['seedPrograms']; skills: ReturnType<typeof resolveScheduleSeed>['seedSkills'] } {
  if (!owns) {
    return { existingWeek: allRestStrengthWeek(), requestedCount: 0, programs: [], skills: [] };
  }
  const { seedPrograms, seedSkills } = resolveScheduleSeed(profile);
  const requestedCount =
    countStrengthDaysFromRecurringTemplate(profile.lifestyle?.recurringTemplate) ??
    profile.lifestyle?.scheduleDays?.length ??
    0;
  const existingWeek = requestedCount === 0
    ? allRestStrengthWeek()
    : buildDefaultTemplate(seedPrograms, seedSkills, requestedCount);
  return { existingWeek, requestedCount, programs: seedPrograms, skills: seedSkills };
}

/**
 * `RunProgramTemplate.targetDistance` ('2k'|'3k'|'5k'|'10k'|'maintenance')
 * → RUN-05's `targetDistanceKm`. 'maintenance' and anything unrecognized
 * fall to 10 — a mid-range default, not a real derivation; there is no
 * "maintenance pace = X km" mapping anywhere in the codebase to call
 * instead.
 */
function parseTargetDistanceKm(targetDistance: string | undefined): number {
  const match = targetDistance?.match(/^(\d+)k$/);
  return match ? Number(match[1]) : 10;
}

/**
 * Builds the running side of WeaveWeekInput.
 *
 * `ActiveRunningProgram.schedule[].day` is a 1-indexed SLOT within the
 * week, not a calendar day-of-week — the same mapping
 * `src/lib/running-day-resolution.ts:127-128` (`resolveRunningDayState`)
 * already uses to answer "today's entry": sort `scheduleDays` (Hebrew
 * letters) into `trainingDayIndices` (0-6, ascending), then
 * `trainingDayIndices[entry.day - 1]` gives the real day-of-week. Not
 * imported from there directly — that function answers "what's today,"
 * this needs "give me the whole week" — same two-line formula, not
 * duplicated logic beyond the formula itself.
 *
 * `slotType`/`isQualityWorkout`/`category` are carried through as-is, raw
 * — no precedence resolution happens here. `isQualityDay`/`isLongRunDay`
 * (runningRules.ts) already implement the slotType → isQualityWorkout →
 * category fallback chain; this function's job is only to get the three
 * raw fields onto the right `RunningWeekDay`, not to interpret them.
 */
function buildRunningSide(
  profile: WeaverInputProfile,
  owns: boolean,
  asOfDate: Date,
): { existingWeek: RunningWeekDay[]; requestedCount: number } {
  const scheduleDays = profile.running?.scheduleDays;
  const activeProgram = profile.running?.activeProgram;
  if (!owns || !scheduleDays?.length || !activeProgram?.schedule?.length) {
    return { existingWeek: allRestRunningWeek(), requestedCount: 0 };
  }

  const trainingDayIndices = scheduleDays
    .map((letter) => DAY_LETTERS.indexOf(letter as (typeof DAY_LETTERS)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  const currentWeek = calculateCurrentWeek(activeProgram.startDate, asOfDate);
  const weekEntries = activeProgram.schedule.filter((e) => e.week === currentWeek);

  const existingWeek = allRestRunningWeek();
  for (const entry of weekEntries) {
    const dayOfWeek = trainingDayIndices[entry.day - 1];
    if (dayOfWeek === undefined) continue;
    existingWeek[dayOfWeek] = {
      dayOfWeek,
      category: entry.category ?? null,
      isQualityWorkout: entry.isQualityWorkout,
      slotType: entry.slotType,
    };
  }

  const requestedCount = existingWeek.filter((d) => d.category !== null).length;
  return { existingWeek, requestedCount };
}

/**
 * The bridge itself. Returns null only when there is genuinely nothing to
 * build from — neither track owned at all (see `hasStrengthTrack`'s own
 * documented gap: it fires from a single one-off assessment, not
 * necessarily an active program — inherited here, not fixed). A user
 * owning only one track still gets a full WeaveWeekInput, with the
 * unowned side at `requestedCount: 0` — never a partial/undefined field.
 */
export function buildWeaverInput(
  profile: WeaverInputProfile | null | undefined,
  focus: number,
  availableDayCount: number,
  asOfDate: Date,
): WeaveWeekInput | null {
  if (!profile) return null;

  const ownsStrength = hasStrengthTrack(profile);
  const ownsRunning = hasRunningTrack(profile);
  if (!ownsStrength && !ownsRunning) return null;

  const strength = buildStrengthSide(profile, ownsStrength);
  const running = buildRunningSide(profile, ownsRunning, asOfDate);

  return {
    focus,
    availableDayCount,
    crossDomainContext: { minStrengthDaysPerWeek: R7_FLOOR },
    strength: {
      family: strengthRuleFamily,
      requestedCount: strength.requestedCount,
      existingWeek: strength.existingWeek,
      validateContext: {},
      reduceContext: { programs: strength.programs, skills: strength.skills },
    },
    running: {
      family: runningRuleFamily,
      requestedCount: running.requestedCount,
      existingWeek: running.existingWeek,
      // ⚠️ KNOWN GAP: hardcoded 'intermediate'. There is no existing
      // mapping from RunnerProfileType (1-4, running.paceProfile) to
      // RunningExperienceLevel anywhere in the codebase — confirmed by
      // search, not assumed. Building one is a real design decision (which
      // profile types count as beginner/advanced) that hasn't been made;
      // not invented here. Only affects RUN-04's max-consecutive-days cap.
      validateContext: { level: 'intermediate' },
      reduceContext: { targetDistanceKm: parseTargetDistanceKm(profile.running?.generatedProgramTemplate?.targetDistance) },
    },
  };
}
