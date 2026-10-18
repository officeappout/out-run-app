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
import { DAY_LETTERS, type ScheduleItemId, type ProgramId, type PrioritizedSkill, isSkillId, MIN_REST_HOURS, MOVEMENT_OF } from '../types/smartSchedule.types';
import { hasStrengthTrack, hasRunningTrack } from '@/lib/track-ownership';
import {
  classifyStrengthId,
  countStrengthTemplateDays,
  type ResolveSlug,
} from './strengthVocabulary';
import type { RunningExperienceLevel } from './runningRules';
import { resolveWeekForDate } from '@/lib/running-current-week';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';

export interface WeaverInputProfile {
  progression?: ScheduleSeedProfileInput['progression'] & {
    domains?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
    tracks?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
  };
  running?: {
    isUnlocked?: unknown;
    scheduleDays?: string[];
    /** RunnerProfileType 1-4 — read by resolveRunningLevel (bug #10). */
    paceProfile?: { profileType?: number } | null;
    onboardingData?: { currentAbility?: { abilityTier?: string } | null } | null;
    activeProgram?: {
      startDate: Date | string | number;
      schedule: Array<{
        week: number;
        day: number;
        category?: WorkoutCategory;
        isQualityWorkout?: boolean;
        slotType?: RunningDayRole;
        /** Read by the advisor only (done / missed, the run entry ref). */
        status?: string;
        workoutName?: string;
        workoutId?: string;
      }>;
      programId?: string;
    };
    lastWorkoutDate?: string;
    /** Only `targetDistance` is read here, to derive RUN-05's `targetDistanceKm` — see buildRunningSide's doc. */
    generatedProgramTemplate?: { targetDistance?: string; canonicalWeeks?: number };
  };
  lifestyle?: {
    recurringTemplate?: Partial<Record<string, string[]>>;
    scheduleDays?: string[];
    primaryTrack?: string | null;
    /** The builder drawer's own saved controls (written only behind SCHEDULE_BUILDER_SAVE_V1). */
    scheduleAdvisorPrefs?: { availableDayCount?: number; focus?: number } | null;
  };
}

/** Options shared by every weaver-input entry point. */
export interface WeaverInputOptions {
  /** Raw Firestore program id → slug (client resolveToSlug / server program index). */
  resolveSlug?: ResolveSlug;
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
 * The strength side's real content, from `lifestyle.recurringTemplate` — NOT
 * `lifestyle.scheduleDays.length` (a known-contaminated strength∪running union, per
 * `.claude/knowledge/parking-lot.md`'s "lifestyle.scheduleDays מצטבר" entry).
 *
 * Bug #3 (schedule advisor phase A): this used to count only the schedule taxonomy's own
 * ids (isSkillId / isProgramId), so a user whose template holds the generator's program
 * slugs (push / pull / legs …) or raw Firestore program ids counted ZERO strength days.
 * Every id now goes through the one strength vocabulary (strengthVocabulary.ts); a day
 * counts once however many strength ids it holds; running ids (anything not strength)
 * are skipped. The day's sessions are the classified schedule ids, deduped, in order.
 */
function strengthWeekFromTemplate(
  recurringTemplate: Partial<Record<string, string[]>> | undefined,
  resolveSlug?: ResolveSlug,
): ScheduleDay[] | null {
  if (!recurringTemplate) return null;
  const week = allRestStrengthWeek();
  let any = false;
  DAY_LETTERS.forEach((letter, dow) => {
    const ids = recurringTemplate[letter];
    if (!Array.isArray(ids)) return;
    const scheduleIds: ScheduleItemId[] = [];
    for (const id of ids) {
      const c = classifyStrengthId(id, resolveSlug).scheduleId;
      if (c && !scheduleIds.includes(c)) scheduleIds.push(c);
    }
    if (scheduleIds.length === 0) return;
    any = true;
    week[dow] = {
      dayOfWeek: dow as ScheduleDay['dayOfWeek'],
      sessions: scheduleIds.map((skillId, orderInDay) => ({
        skillId,
        volumePercent: skillId === 'HANDSTAND' ? 60 : 100,
        sessionType: skillId === 'HANDSTAND' ? 'ACCESSORY' : 'FULL',
        orderInDay,
      })),
      isRestDay: false,
      warnings: [],
    };
  });
  return any ? week : null;
}

/** Seed programs / skills from schedule ids (template content when activePrograms don't resolve). */
function seedFromScheduleIds(ids: ScheduleItemId[]): { programs: ProgramId[]; skills: PrioritizedSkill[] } {
  const programs: ProgramId[] = [];
  const skills: PrioritizedSkill[] = [];
  for (const id of ids) {
    if (isSkillId(id)) {
      if (skills.some((s) => s.id === id)) continue;
      skills.push({
        id,
        priority: skills.length + 1,
        movementType: (MOVEMENT_OF[id] === 'MIXED' ? 'DYNAMIC' : MOVEMENT_OF[id]) as PrioritizedSkill['movementType'],
        isFreeSlot: id === 'HANDSTAND',
        minRestHours: MIN_REST_HOURS[id] ?? 24,
        countsTowardCap: id !== 'HANDSTAND',
      });
    } else if (!programs.includes(id)) {
      programs.push(id);
    }
  }
  return { programs, skills };
}

/**
 * Builds the strength side of WeaveWeekInput.
 *
 * `existingWeek` is the user's REAL strength week when the template has one (placeOn /
 * reduceTo relabel and resize that content — a legs day stays a legs day); otherwise
 * `buildDefaultTemplate` for the count, as before. `buildDefaultTemplate(programs,
 * skills, 0)` is bypassed for zero (an explicit all-rest week).
 */
function buildStrengthSide(
  profile: WeaverInputProfile,
  owns: boolean,
  opts: WeaverInputOptions,
): { existingWeek: ScheduleDay[]; requestedCount: number; programs: ProgramId[]; skills: PrioritizedSkill[] } {
  if (!owns) {
    return { existingWeek: allRestStrengthWeek(), requestedCount: 0, programs: [], skills: [] };
  }
  const templateWeek = strengthWeekFromTemplate(profile.lifestyle?.recurringTemplate, opts.resolveSlug);
  const seed = resolveScheduleSeed(profile, { vocabulary: { resolveSlug: opts.resolveSlug } });
  let programs = seed.seedPrograms;
  let skills = seed.seedSkills;
  if (programs.length === 0 && skills.length === 0) {
    const fromTemplate = templateWeek ? templateWeek.flatMap((d) => d.sessions.map((x) => x.skillId)) : [];
    const fromDomains = Object.entries(profile.progression?.domains ?? {})
      .filter(([, v]) => (v?.currentLevel ?? v?.level ?? 0) > 0)
      .map(([k]) => classifyStrengthId(k, opts.resolveSlug).scheduleId)
      .filter((x): x is ScheduleItemId => !!x);
    const derived = seedFromScheduleIds(fromTemplate.length ? fromTemplate : fromDomains);
    programs = derived.programs;
    skills = derived.skills;
    // Owns strength, but nothing about the program could be decoded (raw ids, no
    // resolver): a generic upper-body day is the user's own domain, not an invented one.
    if (programs.length === 0 && skills.length === 0) programs = ['UPPER_BODY'];
  }
  const requestedCount =
    countStrengthTemplateDays(profile.lifestyle?.recurringTemplate, opts.resolveSlug) ??
    profile.lifestyle?.scheduleDays?.length ??
    0;
  const existingWeek =
    requestedCount === 0
      ? allRestStrengthWeek()
      : templateWeek ?? buildDefaultTemplate(programs, skills, requestedCount);
  return { existingWeek, requestedCount, programs, skills };
}

/** The strength days a profile asks for (0 when strength isn't owned). Same count the weaver uses. */
export function requestedStrengthDays(profile: WeaverInputProfile | null | undefined, opts: WeaverInputOptions = {}): number {
  if (!profile || !hasStrengthTrack(profile)) return 0;
  return (
    countStrengthTemplateDays(profile.lifestyle?.recurringTemplate, opts.resolveSlug) ??
    profile.lifestyle?.scheduleDays?.length ??
    0
  );
}

/**
 * Bug #10: the running level used to be hardcoded 'intermediate' (RUN-04's consecutive-
 * days cap). Mapping, from running.types.ts's own RunnerProfileType doc:
 *   3 (beginner / returning, couch_to_5k)            → 'beginner'
 *   1 (fast improver, basePace under 6:00/km)        → 'advanced'
 *   2 (slow improver) / 4 (maintenance)              → 'intermediate'
 * No paceProfile: the onboarding ability tier ('none' / '5_15' → beginner); otherwise
 * 'intermediate' — exactly today's value, so an unknown runner sees no change.
 */
export function resolveRunningLevel(running: WeaverInputProfile['running']): RunningExperienceLevel {
  const t = running?.paceProfile?.profileType;
  if (t === 3) return 'beginner';
  if (t === 1) return 'advanced';
  if (t === 2 || t === 4) return 'intermediate';
  const tier = running?.onboardingData?.currentAbility?.abilityTier;
  if (tier === 'none' || tier === '5_15') return 'beginner';
  return 'intermediate';
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
 *
 * Week resolution goes through `resolveWeekForDate`
 * (`src/lib/running-current-week.ts`), not `calculateCurrentWeek` directly
 * — `asOfDate` here is caller-supplied and arbitrary, not "today," so it
 * can legitimately precede `activeProgram.startDate` (previewing a date
 * before the running program existed). `resolveWeekForDate` returns `null`
 * in that case instead of clamping to a false week 1 — treated the same as
 * "no active week data," not "week 1."  A local reimplementation of
 * `calculateCurrentWeek`'s raw formula previously lived here and silently
 * reproduced exactly the phantom-week-1 bug fixed in `2647b7f0`, because it
 * copied the formula without the `isDateWithinRunningPlan` guard that
 * formula depends on when given an arbitrary date.
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

  const currentWeek = resolveWeekForDate(activeProgram.startDate, asOfDate);
  if (currentWeek === null) {
    return { existingWeek: allRestRunningWeek(), requestedCount: 0 };
  }

  const trainingDayIndices = scheduleDays
    .map((letter) => DAY_LETTERS.indexOf(letter as (typeof DAY_LETTERS)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

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

/** Which domain(s) the drawer's tab has selected. Input to the engine, not a display filter — see buildWeaverInput's own doc. */
export type WeaveMode = 'strength' | 'running' | 'mixed';

/**
 * The bridge itself. Returns null only when there is genuinely nothing to
 * build from — neither track owned at all (see `hasStrengthTrack`'s own
 * documented gap: it fires from a single one-off assessment, not
 * necessarily an active program — inherited here, not fixed). A user
 * owning only one track still gets a full WeaveWeekInput, with the
 * unowned side at `requestedCount: 0` — never a partial/undefined field.
 *
 * `mode` is a domain SELECTION, not a display filter (schedule-drawer-
 * screen-spec.md's tab redesign): "strength" means "build me a strength
 * week," not "hide the running rows." A domain excluded by mode is forced
 * to `requestedCount: 0` AND `existingWeek` reset to the all-rest week —
 * requestedCount alone isn't enough, because both `strengthPlaceOn` and
 * `runningPlaceOn` (ruleFamily.ts) refuse to relabel a base week that
 * still holds real trainings onto a shorter day-set (confirmed before
 * writing this: `runningPlaceOn` rejects whenever `trainingEntries.length
 * !== requested.length`, and `strengthPlaceOn` rebuilds via
 * `buildDefaultTemplate(programs, skills, requested.length)` regardless of
 * the base it's handed — neither cares what `existingWeek` already
 * contains, only whether the COUNT matches what's requested).
 *
 * R7's floor (`minStrengthDaysPerWeek`) exists to protect strength from
 * losing a competition against running when the week is tight — see
 * crossDomainRules.ts's own doc and `.claude/knowledge/schedule-weaver-
 * spec.md`'s R7 scope note. With a single domain selected there is no
 * competition, so mode='running' passes 0 instead. Checked before writing
 * this, not assumed: there is no symmetric running-side floor to zero in
 * the mirror case — scheduleWeaver.ts's own file header states outright
 * "running has no equivalent floor." mode='strength' leaves the floor at
 * its normal value; strength is the selected domain in that mode, and the
 * floor's role there (never cut a real strength request below the
 * WHO minimum even when days are scarce) still applies on its own terms,
 * independent of any competition with running.
 */
export function buildWeaverInput(
  profile: WeaverInputProfile | null | undefined,
  mode: WeaveMode,
  focus: number,
  availableDayCount: number,
  asOfDate: Date,
  opts: WeaverInputOptions = {},
): WeaveWeekInput | null {
  if (!profile) return null;

  const ownsStrength = hasStrengthTrack(profile);
  const ownsRunning = hasRunningTrack(profile);
  if (!ownsStrength && !ownsRunning) return null;

  const strength = buildStrengthSide(profile, ownsStrength, opts);
  const running = buildRunningSide(profile, ownsRunning, asOfDate);

  const strengthExcluded = mode === 'running';
  const runningExcluded = mode === 'strength';

  const strengthRequested = strengthExcluded ? 0 : strength.requestedCount;
  // Bug #1: R7's floor protects a REAL strength request from losing to running. It used
  // to apply unconditionally, so a runner-only user (or a strength request of 0-1 days)
  // could never pass R7 → total-failure fallback → buildDefaultTemplate([], [], 2) → two
  // invented UPPER_BODY days and zero runs. Now: only when strength is owned, selected,
  // and the request itself reaches the floor.
  const floorApplies = ownsStrength && !strengthExcluded && strengthRequested >= WHO_STRENGTH_TARGET_DAYS;

  return {
    focus,
    availableDayCount,
    crossDomainContext: { minStrengthDaysPerWeek: floorApplies ? WHO_STRENGTH_TARGET_DAYS : 0 },
    strength: {
      family: strengthRuleFamily,
      requestedCount: strengthRequested,
      existingWeek: strengthExcluded ? allRestStrengthWeek() : strength.existingWeek,
      validateContext: {},
      reduceContext: { programs: strength.programs, skills: strength.skills },
    },
    running: {
      family: runningRuleFamily,
      requestedCount: runningExcluded ? 0 : running.requestedCount,
      existingWeek: runningExcluded ? allRestRunningWeek() : running.existingWeek,
      // Bug #10: the real running level (resolveRunningLevel), not a hardcoded
      // 'intermediate'. Only affects RUN-04's max-consecutive-days cap.
      validateContext: { level: resolveRunningLevel(profile.running) },
      reduceContext: { targetDistanceKm: parseTargetDistanceKm(profile.running?.generatedProgramTemplate?.targetDistance) },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Drawer defaults (bug #2) — never hardcoded 3 days / focus 50
// ──────────────────────────────────────────────────────────────────────────

export interface WeaveControls {
  mode: WeaveMode;
  focus: number;
  availableDayCount: number;
}

/** Default tab from ownership: strength-only → 'strength', running-only → 'running', both → 'mixed'. */
export function defaultWeaveMode(profile: WeaverInputProfile | null | undefined): WeaveMode {
  const s = hasStrengthTrack(profile);
  const r = hasRunningTrack(profile);
  if (s && !r) return 'strength';
  if (r && !s) return 'running';
  return 'mixed';
}

/**
 * focus from lifestyle.primaryTrack (focus < 50 = strength dominant, scheduleWeaver.ts):
 * strength → 35, run → 65, anything else (hybrid / health / none) → 50 (running dominant
 * on a tie — exactly the old hardcoded value, so those users see no change).
 */
export function defaultFocus(profile: WeaverInputProfile | null | undefined): number {
  const saved = profile?.lifestyle?.scheduleAdvisorPrefs?.focus;
  if (typeof saved === 'number' && saved >= 0 && saved <= 100) return Math.round(saved);
  const track = profile?.lifestyle?.primaryTrack;
  if (track === 'strength') return 35;
  if (track === 'run') return 65;
  return 50;
}

/**
 * Starting availability = what the questionnaires already asked (spec: "מיקומו ההתחלתי
 * הוא הסכום שסומן בשאלונים"): strength days + running days, capped at 7; the drawer's own
 * saved value wins when there is one. Never a hardcoded 3.
 */
export function defaultAvailableDayCount(
  profile: WeaverInputProfile | null | undefined,
  opts: WeaverInputOptions = {},
): number {
  const saved = profile?.lifestyle?.scheduleAdvisorPrefs?.availableDayCount;
  if (typeof saved === 'number' && saved >= 1 && saved <= 7) return Math.round(saved);
  const strengthDays = requestedStrengthDays(profile, opts);
  const runningDays = hasRunningTrack(profile) ? (profile?.running?.scheduleDays?.length ?? 0) : 0;
  const sum = strengthDays + runningDays;
  return Math.max(1, Math.min(7, sum || WHO_STRENGTH_TARGET_DAYS));
}

export function defaultWeaveControls(
  profile: WeaverInputProfile | null | undefined,
  opts: WeaverInputOptions = {},
): WeaveControls {
  return { mode: defaultWeaveMode(profile), focus: defaultFocus(profile), availableDayCount: defaultAvailableDayCount(profile, opts) };
}
