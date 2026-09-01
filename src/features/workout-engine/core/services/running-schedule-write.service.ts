import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generatePlan } from './running-engine.service';
import { getPaceMapConfig, getRunWorkoutTemplates, getRunProgramTemplate } from './running-admin.service';
import { DEFAULT_PACE_MAP_CONFIG } from '../config/pace-map-config';
import { flattenPlanToSchedule } from './plan-generator.service';
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
 * `generatedProgramTemplate` on the user profile is a `Pick<...>` subset
 * (`running.types.ts`'s `RunningProfile.generatedProgramTemplate`) — it
 * does NOT carry `weekTemplates`/`phases`/`progressionRules`/`volumeCaps`,
 * which `generatePlan()` needs. The full `RunProgramTemplate` is re-fetched
 * by id via `getRunProgramTemplate` (`running-admin.service.ts`, public
 * read — confirmed in `firestore.rules:572-575`).
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
  | 'program-template-not-found'
  | 'no-workout-templates'
  | 'generation-threw';

export type FetchAndGenerateResult =
  | { ok: true; activeProgram: Omit<ActiveRunningProgram, 'startDate'> & { startDate: string } }
  | { ok: false; reason: FetchAndGenerateFailureReason; existingPlanBuildFailedAt?: string };

/**
 * Pure read + compute — does NOT write anything to Firestore. Fetches
 * whatever this user's profile already has (`paceProfile`,
 * `generatedProgramTemplate`), fetches a fresh full program template +
 * workout-template pool + pace-map config, and runs the exact same
 * `generatePlan()` + flatten pipeline the original running-onboarding
 * bridge uses (`onboarding-sync.service.ts:1740-1786`) — same output
 * shape, so a caller merging this into its own write is indistinguishable
 * from a normal onboarding-time build.
 *
 * Callers decide how to persist the result: `buildActiveRunningProgram`
 * below does its own standalone write (the retry-button case, A2).
 * Commit 3's writer (2b+2d round, not yet built) will call this directly
 * and merge the result into its own atomic write alongside
 * `scheduleDays`/`scheduleDaysSource`, instead of going through
 * `buildActiveRunningProgram`'s separate write.
 *
 * `activeProgram.startDate` is returned as an ISO string, not a `Date`
 * (contradicting `ActiveRunningProgram.startDate: Date`'s declared type —
 * a pre-existing mismatch, not introduced here: `onboarding-sync.service.ts`
 * has always written a string at this exact field, `useUserStore.ts`'s
 * `reviveDates`/`normalizeDateField` converts it back to a `Date` on client
 * hydration. Matching existing behavior, not fixing the type here.
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

    // Two independent network points, two independent failure reasons —
    // the second must never fold into the first (David, 01.09.2026 review):
    // getRunProgramTemplate's REJECTION is left uncaught, propagating to
    // the outer catch as 'generation-threw' — deliberately NOT mapped to
    // 'program-template-not-found', which is reserved for a clean,
    // successful resolve-to-null (the id genuinely doesn't reference a
    // live doc). Collapsing "couldn't check" into "checked, not there"
    // would reintroduce this exact fix's own bug class in a new place.
    // getRunWorkoutTemplates gets `.catch(() => [])`, matching
    // onboarding-sync.service.ts:1700's own defensive pattern exactly —
    // here, unlike the template lookup, a network failure IS meant to
    // read the same as "no workout templates," since that's the literal
    // original "deferred to first run" trigger this whole fix targets.
    // getPaceMapConfig gets the same `.catch()` fallback
    // onboarding-sync.service.ts:1699 uses, for the same reason (a
    // sensible default already exists — no need to fail the whole build
    // over a config-doc read blip).
    const [fullTemplate, workoutTemplates, paceMapConfig] = await Promise.all([
      getRunProgramTemplate(generatedProgramTemplate.id),
      getRunWorkoutTemplates().catch(() => []),
      getPaceMapConfig().catch(() => DEFAULT_PACE_MAP_CONFIG),
    ]);

    if (!fullTemplate) {
      return { ok: false, reason: 'program-template-not-found', existingPlanBuildFailedAt };
    }
    // The original "activeProgram deferred to first run" trigger
    // (onboarding-sync.service.ts:1828) — an empty pool, real or (via the
    // .catch(() => []) above) from a swallowed network failure during the
    // templates fetch, matching the original bug's exact detection shape.
    if (workoutTemplates.length === 0) {
      return { ok: false, reason: 'no-workout-templates', existingPlanBuildFailedAt };
    }

    const planResult = generatePlan(fullTemplate, paceProfile, paceMapConfig, workoutTemplates);
    const schedule = flattenPlanToSchedule(planResult, workoutTemplates);

    return {
      ok: true,
      activeProgram: {
        programId: fullTemplate.id,
        startDate: new Date().toISOString(),
        currentWeek: 1,
        schedule,
      },
    };
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
