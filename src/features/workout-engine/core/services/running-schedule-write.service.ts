import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPaceMapConfig, getRunWorkoutTemplates } from './running-admin.service';
import { DEFAULT_PACE_MAP_CONFIG } from '../config/pace-map-config';
import { buildRunningPlan } from './plan-generator.service';
import { resolveRunningScheduleChange, mergePreservedHistory } from './running-schedule-change.service';
import { resolveRunningScheduleSource } from '@/lib/running-schedule-source';
import { clampRunningFrequency } from '@/lib/running-frequency-bounds';
import type { ActiveRunningProgram, PaceProfile } from '../types/running.types';

/**
 * A1 of the "spinner: false promise, no recovery" fix
 * (idempotent-booping-sunrise.md, 01.09.2026 second round) — NOT part of
 * commit 3 (2d) of the 2b+2d round. Flagging the ownership explicitly: the
 * plan originally sketched this exact build logic as living inside
 * commit 3's own writer; David corrected that before either was built —
 * this file is the one, shared definition, and commit 3's future writer
 * (`completeRunningScheduleFirstChoice`) is a CONSUMER of
 * `fetchAndGenerateActiveRunningProgram` below, not a second definer of
 * the same logic. Silently building two copies is exactly the duplication
 * pattern this project has been repeatedly burned by (see this same plan
 * file's own commit-2 JSDoc, `hasStrengthTrack`'s history, etc.).
 *
 * ── Why "rebuild from existing profile data" is safe (verified, not assumed) ──
 * `running.paceProfile` and `running.generatedProgramTemplate` are written
 * together, in the same object literal, by their single writer in the whole
 * codebase (`onboarding-sync.service.ts:1666-1692`, confirmed via a
 * repo-wide grep for both fields — no other writer exists). That write
 * happens BEFORE the templates fetch that can fail
 * (`onboarding-sync.service.ts:1697-1701,1740`) — so whenever a user is
 * sitting in the "isUnlocked + generatedProgramTemplate present,
 * activeProgram missing" deferred state (the exact state
 * `NextRunWorkoutCard.tsx`'s "your plan is being prepared" spinner keys
 * off), `paceProfile` is guaranteed to already be there too. This is what
 * makes a local rebuild (read what's already on the profile, fetch fresh
 * templates, regenerate) a valid fix, instead of needing to re-run the
 * entire running-onboarding bridge from scratch.
 *
 * ⚠️ CORRECTED (01.09.2026, before commit-3 planning) — a real bug in this
 * file's first version, found while verifying frequency→template selection
 * for commit 3. `generatedProgramTemplate` on the user profile is a
 * `Pick<...>` subset (`running.types.ts`'s
 * `RunningProfile.generatedProgramTemplate`) — it does NOT carry
 * `weekTemplates`/`phases`/`progressionRules`/`volumeCaps`, which
 * `generatePlan()` needs. The first draft "fixed" this by re-fetching the
 * full `RunProgramTemplate` by id via `getRunProgramTemplate`
 * (`running-admin.service.ts`) — **wrong**: the live onboarding path never
 * selects a template from that Firestore collection at all.
 * `bridgeRunningOnboarding` calls `generateProgramTemplate()`
 * (`plan-generator.service.ts:473`) — a PURE, in-memory function that
 * builds a brand-new `RunProgramTemplate` on every call, with an id
 * (`gen_${targetDistance}_${totalWeeks}w_${frequency}x_${Date.now()}`)
 * that is NEVER written to Firestore. `runProgramTemplates` (what
 * `getRunProgramTemplate` reads) is populated only by admin-authored
 * templates (`createRunProgramTemplate`, called only from
 * `/admin/running/programs/new` and `/admin/running/import/*` — grep
 * confirmed, no other writer exists). So `getRunProgramTemplate(id)`
 * returned `null` for essentially every real user, and this function
 * always failed with `program-template-not-found` — the retry mechanism
 * never actually worked. Fixed: this file now calls `buildRunningPlan`
 * (`plan-generator.service.ts`), which regenerates an equivalent template
 * from inputs already on the profile — see that function's own JSDoc.
 * `program-template-not-found` no longer exists as a failure reason —
 * nothing left in this file can produce it.
 *
 * ── Detection is DERIVED, not stored (corrected 01.09.2026, before merge) ──
 * An earlier draft of this file gated the retry UI on
 * `running.planBuildFailedAt`'s presence, written only inside
 * `buildActiveRunningProgram` — which only a marker-gated button would
 * call. Circular: the exact user this exists to help (failed during
 * signup, never retried) has no marker, so no button, so nothing ever
 * writes the marker. David caught this before merge.
 *
 * Fixed: `isRunningPlanBuildStuck` below derives the stuck state directly
 * from data — `running.isUnlocked === true && no running.activeProgram`.
 * `isUnlocked` is written exactly once, at the end of running onboarding
 * (`onboarding-sync.service.ts:1676`), in the SAME object literal as
 * `paceProfile`/`generatedProgramTemplate` and (conditionally, on success)
 * `activeProgram` — and this whole file has exactly ONE Firestore write
 * call in it (`setDoc` at `:1940`, confirmed via a full-file grep for
 * `setDoc(`/`updateDoc(` — no other match). So there is no transitional
 * window where `isUnlocked` is visible as `true` while `activeProgram` is
 * still pending: either the entire write lands (with or without
 * `activeProgram`, depending on whether that same call's templates fetch
 * succeeded) or none of it does. The stuck state is therefore a pure
 * function of already-persisted data, computable by any reader — no write
 * at signup required, and it correctly catches every failure path
 * including ones from before this mechanism existed.
 *
 * `planBuildFailedAt` is NOT eliminated by this — see its own JSDoc in
 * `running.types.ts` for its corrected role (diagnostic "stuck since"
 * bookkeeping, not what drives UI visibility).
 */

export type FetchAndGenerateFailureReason =
  | 'missing-profile-data'
  | 'no-workout-templates'
  | 'generation-threw';

export type FetchAndGenerateResult =
  | { ok: true; activeProgram: Omit<ActiveRunningProgram, 'startDate'> & { startDate: string } }
  | { ok: false; reason: FetchAndGenerateFailureReason; existingPlanBuildFailedAt?: string };

/**
 * Pure read + compute — does NOT write anything to Firestore. Reads
 * whatever this user's profile already has (`paceProfile`,
 * `generatedProgramTemplate`, `currentGoal`, `onboardingData`), fetches a
 * fresh workout-template pool + pace-map config, and calls
 * `buildRunningPlan` (`plan-generator.service.ts`) to regenerate an
 * equivalent `RunProgramTemplate` + schedule — NOT a Firestore lookup by
 * id (see this file's module doc for the bug that used to do that and why
 * it never worked). First-time build only here: `preservedWeek`/
 * `existingStartDate` are both omitted, since there is by definition no
 * existing `activeProgram` for this function to be called at all
 * (`isRunningPlanBuildStuck` — no `activeProgram` is the trigger).
 *
 * Callers decide how to persist the result: `buildActiveRunningProgram`
 * below does its own standalone write (the retry-button case, A2).
 * Commit 3's writer (2b+2d round, not yet built) will call `buildRunningPlan`
 * directly instead (with a real `preservedWeek`/`existingStartDate`, since
 * that IS a rebuild of an existing program), not this function — this one
 * is specifically the first-time-build path.
 *
 * `existingPlanBuildFailedAt` is surfaced on every failure branch (where a
 * user-doc read succeeded) so `buildActiveRunningProgram` can decide
 * whether to write a fresh failure timestamp or preserve the existing one,
 * without a second Firestore read.
 */
export async function fetchAndGenerateActiveRunningProgram(
  uid: string,
): Promise<FetchAndGenerateResult> {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const running = snap.exists() ? (snap.data() as Record<string, any>)?.running : undefined;
    const paceProfile: PaceProfile | undefined = running?.paceProfile;
    const generatedProgramTemplate = running?.generatedProgramTemplate;
    const existingPlanBuildFailedAt: string | undefined = running?.planBuildFailedAt;

    // Structural gap, not a retry-eligible failure — see running.types.ts's
    // planBuildFailedAt JSDoc. Not reachable via NextRunWorkoutCard's retry
    // button today (that button only renders when generatedProgramTemplate
    // is present, and it's never written without paceProfile — see above),
    // kept as a defensive branch for data this couldn't statically rule out
    // (legacy/pre-this-code-shape records, manual edits).
    if (!paceProfile || !generatedProgramTemplate?.id) {
      return { ok: false, reason: 'missing-profile-data', existingPlanBuildFailedAt };
    }

    // getRunWorkoutTemplates gets `.catch(() => [])`, matching
    // onboarding-sync.service.ts:1700's own defensive pattern exactly — a
    // network failure IS meant to read the same as "no workout templates,"
    // since that's the literal original "deferred to first run" trigger
    // this whole fix targets. getPaceMapConfig gets the same `.catch()`
    // fallback onboarding-sync.service.ts:1699 uses, for the same reason
    // (a sensible default already exists — no need to fail the whole
    // build over a config-doc read blip).
    const [workoutTemplates, paceMapConfig] = await Promise.all([
      getRunWorkoutTemplates().catch(() => []),
      getPaceMapConfig().catch(() => DEFAULT_PACE_MAP_CONFIG),
    ]);

    // The original "activeProgram deferred to first run" trigger
    // (onboarding-sync.service.ts:1828) — an empty pool, real or (via the
    // .catch(() => []) above) from a swallowed network failure during the
    // templates fetch, matching the original bug's exact detection shape.
    if (workoutTemplates.length === 0) {
      return { ok: false, reason: 'no-workout-templates', existingPlanBuildFailedAt };
    }

    const result = buildRunningPlan({
      goal: running.currentGoal,
      basePace: paceProfile.basePace,
      targetDistance: generatedProgramTemplate.targetDistance,
      frequency: generatedProgramTemplate.canonicalFrequency,
      totalWeeks: generatedProgramTemplate.canonicalWeeks,
      runningHistoryMonths: running?.onboardingData?.runningHistoryMonths,
      hasInjuries: running?.onboardingData?.hasInjuries,
      workoutTemplates,
      paceMapConfig,
    });

    return { ok: true, activeProgram: result.activeProgram };
  } catch (err) {
    console.error('[RunningScheduleWrite] fetchAndGenerateActiveRunningProgram failed:', err);
    // existingPlanBuildFailedAt unavailable here — the read itself may be
    // what failed. buildActiveRunningProgram treats a missing value the
    // same as "none known," writing a fresh timestamp.
    return { ok: false, reason: 'generation-threw' };
  }
}

/**
 * Derived detection — the source of truth for "does this user need the
 * rebuild UI," NOT `running.planBuildFailedAt`'s presence. See this file's
 * module doc for why a stored marker was circular and how atomicity
 * (single `setDoc`, `onboarding-sync.service.ts:1940`) makes this safe.
 */
export function isRunningPlanBuildStuck(
  profile: { running?: { isUnlocked?: unknown; activeProgram?: unknown } } | null | undefined,
): boolean {
  return !!profile?.running?.isUnlocked && !profile?.running?.activeProgram;
}

/**
 * Whether a stuck user (`isRunningPlanBuildStuck` above) actually has what
 * `fetchAndGenerateActiveRunningProgram` needs to rebuild —
 * `paceProfile` + `generatedProgramTemplate.id`. In practice every user
 * `isRunningPlanBuildStuck` catches also satisfies this (both are written
 * together with `isUnlocked` — see module doc), EXCEPT the residual,
 * non-provable-by-static-analysis case documented on
 * `fetchAndGenerateActiveRunningProgram`'s `'missing-profile-data'` branch
 * (legacy data predating this code shape, manual edits).
 *
 * ⚠️ REQUIRED in A2 (David, 01.09.2026 review — not optional, not a future
 * nice-to-have): a caller MUST check this before deciding what to render.
 * `false` needs a structurally different message than the retry flow — the
 * profile is incomplete, a rebuild can't succeed no matter how many times
 * it's retried, so "try again" would be the exact false-promise pattern
 * this whole fix exists to remove, just relocated.
 */
export function hasRunningRebuildInputs(
  profile:
    | { running?: { paceProfile?: unknown; generatedProgramTemplate?: { id?: unknown } } }
    | null
    | undefined,
): boolean {
  return !!profile?.running?.paceProfile && !!profile?.running?.generatedProgramTemplate?.id;
}

/** `planBuildFailedAt` is only ever written for a retry-eligible failure — see `buildActiveRunningProgram` below. */
export type RetryEligibleFailureReason = Exclude<FetchAndGenerateFailureReason, 'missing-profile-data'>;

export type BuildActiveRunningProgramResult =
  | { ok: true }
  | { ok: false; reason: FetchAndGenerateFailureReason };

/**
 * Standalone retry-button entry point (A2, `NextRunWorkoutCard.tsx`) — the
 * one-call "build it now" wrapper around `fetchAndGenerateActiveRunningProgram`.
 * Not used by commit 3's future writer (see module doc) — that writer needs
 * the compute-only function above so it can merge the result into one
 * atomic write of its own; this wrapper's separate `updateDoc` calls are
 * specific to the retry-button's standalone use case.
 *
 * On success: writes `running.activeProgram` and clears both
 * `running.planBuildFailedAt` and `running.planBuildFailReason`
 * (`deleteField()` — neither applies anymore, not just a falsy placeholder).
 *
 * On failure: writes `running.planBuildFailedAt` + `running.planBuildFailReason`
 * ONLY if (a) the failure is retry-eligible (`reason !== 'missing-profile-data'`
 * — see `hasRunningRebuildInputs` above and `running.types.ts`'s JSDoc) and
 * (b) no timestamp already exists — a REPEATED failure preserves the
 * original "stuck since" moment AND the original reason, rather than
 * refreshing either to the retry's own outcome (David, 01.09.2026 — both
 * fields are frozen together at first failure, not independently updated;
 * a later retry failing for a *different* reason than the first is not
 * recorded — deliberate, matches "stuck since X" outranking "last
 * attempted at Y" for the timestamp, applied consistently to the reason).
 *
 * `planBuildFailReason` exists specifically because `no-workout-templates`
 * is deliberately overloaded (`fetchAndGenerateActiveRunningProgram`'s
 * `.catch(() => [])` on `getRunWorkoutTemplates()`, matching
 * `onboarding-sync.service.ts:1700`) — it means EITHER "the pool is
 * genuinely empty" OR "the fetch itself failed," and without recording
 * which `reason` actually came back, a real production incident (the
 * shared `runWorkoutTemplates` collection breaking) would look identical
 * to normal per-user network flakiness: every new runner silently retries
 * and gives up, with no aggregate signal anywhere that something systemic
 * is wrong (David, 01.09.2026 review).
 *
 * ⚠️ These writes are bookkeeping, not detection (corrected 01.09.2026 —
 * see module doc's "Detection is DERIVED" section). Whether A2 renders the
 * rebuild UI at all is decided by `isRunningPlanBuildStuck`, computed from
 * `isUnlocked`/`activeProgram` presence — NOT by whether this function has
 * ever run or whether `planBuildFailedAt`/`planBuildFailReason` exist. A
 * user who never clicks retry, or fails before this function is ever
 * called even once, is still correctly caught by `isRunningPlanBuildStuck`
 * and shown the UI; these fields only start accumulating "since when / why
 * / how long" information from the first time this function actually
 * runs, which may be later than the user's real failure moment.
 */
export async function buildActiveRunningProgram(
  uid: string,
): Promise<BuildActiveRunningProgramResult> {
  const result = await fetchAndGenerateActiveRunningProgram(uid);
  const userRef = doc(db, 'users', uid);

  if (result.ok) {
    try {
      await updateDoc(userRef, {
        'running.activeProgram': result.activeProgram,
        'running.planBuildFailedAt': deleteField(),
        'running.planBuildFailReason': deleteField(),
      });
      return { ok: true };
    } catch (err) {
      console.error('[RunningScheduleWrite] buildActiveRunningProgram write failed:', err);
      return { ok: false, reason: 'generation-threw' };
    }
  }

  if (result.reason !== 'missing-profile-data' && !result.existingPlanBuildFailedAt) {
    try {
      await updateDoc(userRef, {
        'running.planBuildFailedAt': new Date().toISOString(),
        'running.planBuildFailReason': result.reason satisfies RetryEligibleFailureReason,
      });
    } catch (err) {
      console.error('[RunningScheduleWrite] failed to write planBuildFailedAt:', err);
    }
  }

  return { ok: false, reason: result.reason };
}

export interface CompleteRunningScheduleChoiceInput {
  uid: string;
  /** Day letters, e.g. ['א','ג','ה'] — the user's new running-day selection. */
  scheduleDays: string[];
  /**
   * The raw UI selection. `RunningScheduleStep`'s picker is bounded to
   * `MIN_RUNNING_FREQUENCY`..`MAX_RUNNING_FREQUENCY` (2-4) as of 01.09.2026
   * — before that fix it allowed 1, silently producing a plan built for 2
   * runs/week with only 1 weekday to hang the second run on (found during
   * this writer's own review; see `src/lib/running-frequency-bounds.ts`'s
   * module doc for the full mechanism and why the minimum is a
   * training-design decision, not a numeric floor). Still clamped here via
   * `clampRunningFrequency` regardless — kept as defense-in-depth for any
   * caller other than today's picker (a stale stored value, a future 3f/
   * general-remap caller), not because the picker itself can produce an
   * out-of-range value anymore. `scheduleDays` itself is stored as
   * whatever the user actually picked — only the generated program's
   * structure is clamped, matching signup's existing precedent.
   */
  frequency: number;
  /** HH:MM. */
  time: string;
}

export type CompleteRunningScheduleChoiceResult =
  | { ok: true; requiresExplanation: boolean }
  | { ok: false; requiresExplanation: boolean; buildFailReason: RetryEligibleFailureReason }
  | { ok: false; requiresExplanation: false; reason: 'missing-profile-data' };

/**
 * Commit 3 (2d) of the 2b+2d round, idempotent-booping-sunrise.md — the
 * wizard schedule-step's writer for a running-track user. Handles BOTH a
 * true first-time day choice AND a repeat JIT change through the wizard —
 * `resolveRunningScheduleChange` (1b) classifies which one this is, this
 * function doesn't need to know in advance.
 *
 * Pipeline, exactly as specified (David, 01.09.2026):
 * `resolveRunningScheduleChange` (1b) → `preservedWeek` →
 * `buildRunningPlan` (new frequency, `preservedWeek`, the existing
 * `startDate`) → `mergePreservedHistory` → one atomic write.
 *
 * Deliberately does NOT reuse `fetchAndGenerateActiveRunningProgram`
 * above — that function is scoped to first-time-only (no
 * `preservedWeek`/`existingStartDate`), while this one is a rebuild by
 * construction. The small "read paceProfile/generatedProgramTemplate off
 * the profile" shape is duplicated between the two rather than extracted
 * into a shared helper — a deliberate choice, not an oversight: that
 * function is already merged and device-verified (01.09.2026); refactoring
 * it to share code with a brand-new, not-yet-reviewed writer risks
 * regressing something that was hard-won (the previous "looks right,
 * passes tests, doesn't work on a device" lesson from A1). Flagged here as
 * a real, small duplication a future pass could clean up — not silently
 * left unmentioned.
 *
 * ⚠️ `lifestyle.scheduleDays` merge is a PLAIN UNION with the new running
 * days, never a subtraction of the old ones (David, 01.09.2026 review of
 * a related file: "המערכת מתאימה עצמה למשתמש" — but this specific choice
 * is a judgment call, not something David has reviewed yet). A day the
 * user REMOVES from their running schedule stays in `lifestyle.scheduleDays`
 * indefinitely unless it's cleaned up some other way — matches the exact
 * behavior `RunningScheduleStep.tsx`'s original signup-time merge already
 * has (`:154-166`), not a new gap. The alternative (subtract the user's
 * OLD running days before unioning in the new ones) was considered and
 * rejected: `lifestyle.scheduleDays` is a flat array with no per-day
 * ownership tracking, so a day that's BOTH a strength day and an old
 * running day would be wrongly stripped the moment running drops it —
 * exactly the same class of bug already documented and deferred to the
 * future drawer's id-ownership merge (gap-map finding #9, §5 of this same
 * plan file). Staying with the existing, safer (if imprecise) precedent
 * rather than introducing a new data-loss risk to close a smaller,
 * cosmetic staleness gap.
 *
 * `lifestyle.reminders.runningTime` is written via a DOTTED PATH, not a
 * nested-object replace (David, 01.09.2026 review, explicit requirement)
 * — `lifestyle.reminders` also declares a sibling `strengthTime` field
 * (`user.types.ts:377-380`; not currently written by any live code,
 * confirmed by grep, but declared as real future intent) that a
 * `{lifestyle:{reminders:{runningTime}}}`-shaped write would silently
 * wipe the moment it exists. The dotted key touches only this one leaf.
 *
 * On a build failure: `scheduleDays`/`scheduleDaysSource`/the time are
 * STILL written — "the user's choice is always saved" (David, 01.09.2026)
 * — only `activeProgram` is skipped, alongside the SAME
 * `planBuildFailedAt`/`planBuildFailReason` freeze-on-repeat-failure
 * semantics A1 already established (never overwrite an existing failure
 * timestamp/reason with a later one).
 *
 * ⛔ MUST NEVER touch `lifestyle.primaryTrack` or `lifestyle.dashboardMode`
 * — directly, via a helper, or via any other service (David, 01.09.2026,
 * explicit hard requirement). This writer runs for a user who is by
 * definition ALREADY in the wizard's running branch (`hasRunningTrack`
 * gate, `LifestyleWizard.tsx`) — it is a day/time edit, not a track
 * assignment, and has no business deciding which track is "primary" for
 * a dual-track user. (Contrast with `onboarding-sync.service.ts:1848-1853`,
 * which DOES force `primaryTrack`/`dashboardMode` unconditionally — that's
 * the exact behavior flagged as a separate, unfixed bug in this same plan
 * file's "`/onboarding-new/dynamic` כופה החלפת-מסלול" queue item. Do not
 * import anything from that code path here, and do not replicate its
 * unconditional-override pattern in this file either.)
 */
export async function completeRunningScheduleFirstChoice(
  input: CompleteRunningScheduleChoiceInput,
): Promise<CompleteRunningScheduleChoiceResult> {
  const { uid, scheduleDays, frequency: rawFrequency, time } = input;
  // Shared clamp — src/lib/running-frequency-bounds.ts. Same bound the
  // picker itself now enforces (01.09.2026) and running-onboarding-bridge
  // .service.ts's two clamp sites use; kept here too as defense-in-depth
  // for any caller other than today's picker.
  const frequency = clampRunningFrequency(rawFrequency);
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const docData = snap.exists() ? (snap.data() as Record<string, any>) : undefined;
  const running = docData?.running;
  const lifestyle = docData?.lifestyle;

  const paceProfile: PaceProfile | undefined = running?.paceProfile;
  const generatedProgramTemplate = running?.generatedProgramTemplate;
  if (!paceProfile || !generatedProgramTemplate?.id) {
    return { ok: false, requiresExplanation: false, reason: 'missing-profile-data' };
  }

  const oldScheduleDays: string[] = Array.isArray(running?.scheduleDays) ? running.scheduleDays : [];
  const oldSource = resolveRunningScheduleSource(docData);
  const activeProgram = running?.activeProgram;
  const currentWeek = typeof activeProgram?.currentWeek === 'number' ? activeProgram.currentWeek : 1;

  const change = resolveRunningScheduleChange({
    oldSource,
    oldScheduleDays,
    newScheduleDays: scheduleDays,
    currentWeek,
  });

  const currentLifestyleScheduleDays: string[] = Array.isArray(lifestyle?.scheduleDays) ? lifestyle.scheduleDays : [];
  const mergedLifestyleScheduleDays = Array.from(new Set([...currentLifestyleScheduleDays, ...scheduleDays]));

  let buildFailReason: RetryEligibleFailureReason | null = null;
  let builtActiveProgram: (Omit<ActiveRunningProgram, 'startDate'> & { startDate: string }) | null = null;

  try {
    const [workoutTemplates, paceMapConfig] = await Promise.all([
      getRunWorkoutTemplates().catch(() => []),
      getPaceMapConfig().catch(() => DEFAULT_PACE_MAP_CONFIG),
    ]);
    if (workoutTemplates.length === 0) {
      buildFailReason = 'no-workout-templates';
    } else {
      const built = buildRunningPlan({
        goal: running.currentGoal,
        basePace: paceProfile.basePace,
        targetDistance: generatedProgramTemplate.targetDistance,
        frequency,
        totalWeeks: generatedProgramTemplate.canonicalWeeks,
        runningHistoryMonths: running?.onboardingData?.runningHistoryMonths,
        hasInjuries: running?.onboardingData?.hasInjuries,
        workoutTemplates,
        paceMapConfig,
        preservedWeek: change.preservedWeek,
        existingStartDate: activeProgram?.startDate,
      });
      const oldSchedule = Array.isArray(activeProgram?.schedule) ? activeProgram.schedule : [];
      builtActiveProgram = {
        ...built.activeProgram,
        schedule: mergePreservedHistory(oldSchedule, built.activeProgram.schedule, change.preservedWeek),
      };
    }
  } catch (err) {
    console.error('[RunningScheduleWrite] completeRunningScheduleFirstChoice build failed:', err);
    buildFailReason = 'generation-threw';
  }

  const baseFields: Record<string, unknown> = {
    'running.scheduleDays': scheduleDays,
    'running.scheduleDaysSource': 'user-chosen',
    'lifestyle.reminders.runningTime': time,
    'lifestyle.scheduleDays': mergedLifestyleScheduleDays,
  };

  if (builtActiveProgram) {
    try {
      await updateDoc(userRef, {
        ...baseFields,
        'running.activeProgram': builtActiveProgram,
        'running.planBuildFailedAt': deleteField(),
        'running.planBuildFailReason': deleteField(),
      });
      return { ok: true, requiresExplanation: change.requiresExplanation };
    } catch (err) {
      console.error('[RunningScheduleWrite] completeRunningScheduleFirstChoice write failed:', err);
      buildFailReason = 'generation-threw';
    }
  }

  // Build (or the success write itself) failed — the user's day/time
  // choice is still saved (David, 01.09.2026: "הבחירה של המשתמש נשמרת
  // תמיד"), only activeProgram is skipped. Same freeze-on-repeat-failure
  // semantics as buildActiveRunningProgram above.
  const existingPlanBuildFailedAt: string | undefined = running?.planBuildFailedAt;
  const failFields: Record<string, unknown> = { ...baseFields };
  if (!existingPlanBuildFailedAt) {
    failFields['running.planBuildFailedAt'] = new Date().toISOString();
    failFields['running.planBuildFailReason'] = buildFailReason ?? 'generation-threw';
  }
  try {
    await updateDoc(userRef, failFields);
  } catch (err) {
    console.error('[RunningScheduleWrite] completeRunningScheduleFirstChoice failure-path write failed:', err);
  }
  return {
    ok: false,
    requiresExplanation: change.requiresExplanation,
    buildFailReason: buildFailReason ?? 'generation-threw',
  };
}
