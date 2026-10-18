/**
 * useHybridRun — the live runtime store for a hybrid session (Phase 3c ③).
 *
 * Thin React/Zustand wrapper over the pure hybrid-session-controller. It reads
 * live distance/duration from useSessionStore, pauses the run clock during a
 * station (so the controller's leg baselines stay exact), mounts the station
 * plan, and — on finish — writes the SINGLE hybrid doc (saveHybridWorkout) then
 * tears down the runner (finishWorkout is suppressed by hybridMode → no 2nd doc).
 *
 * `active` is false unless a hybrid session is running, so every consumer
 * (FreeRunLayer / HybridStationLayer) is inert in a normal run.
 */

import { create } from 'zustand';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import type { HybridPlan } from './compose-hybrid-session.service';
import type { HybridControllerHandle } from './hybrid-session-controller';
import type { HybridPhase, HybridRunState, HybridFinalizeResult } from './hybrid-orchestrator';
import { createHybridSessionController } from './hybrid-session-controller';
import { reverseHybridSegments } from './reverse-plan';
import { strengthBlockToWorkoutPlan } from './strength-block-to-plan';
import { HYBRID_SUMMARY_ENABLED } from '@/config/feature-flags';
import { isNegligibleHybridSession } from './hybrid-finish-policy';
import type { SegmentExerciseDetail } from '../core/services/storage.service';
import type { StrengthBlockResult } from '../core/pipeline/strength-block.service';
import { createDemoSeenStore, type DemoSeenStore } from '../players/strength/logic/demo-gate';
import {
  computeStationContext, countStationExercises, stationMinutes, swapExerciseInStationContent,
  locateStationContentIndex,
  type StationContext,
} from './station-flow';

// Non-reactive handles (a controller closure can't live in reactive state).
let controllerRef: HybridControllerHandle | null = null;
let planCalories = 0;
// Real per-category calorie split from the plan segments (no proportion) — used
// to feed dailyActivity cardio vs strength buckets at finish.
let planAerobicCalories = 0;
let planStrengthCalories = 0;
let planAerobicKind: 'running' | 'walking' = 'running';
// Full-park gate: budget-split leaves these at their defaults → current plan path.
let planFullPark = false;
let planWarmupActive = true;
let saving = false;
// G2.4 station flow: park names for the end-of-station screen (parkId → name, from the
// composed stations list), the LIVE block content of the station being run (an in-station
// swap rewrites it), and when the station started (minutes on the completion screen).
let stationNames: Record<string, string> = {};
let activeStationContent: StrengthBlockResult | null = null;
let stationStartedAtMs: number | null = null;
// PR-B2: exercises whose demo was watched in THIS hybrid session (the guided demo gate skips
// them). Session-scoped: cleared on startHybrid / reset, shared by every station's player.
const demoSeen = createDemoSeenStore();
/** The session's demo seen-store, handed to StrengthRunner (guided mode only). */
export const hybridDemoSeen: DemoSeenStore = { has: (id) => demoSeen.has(id), add: (id) => demoSeen.add(id) };
// PR-B3: machine exercises already "found" (מצאתי ✓) this session — keyed per station LOCATION by
// the caller (scopedFoundStore + StationContext.locationKey); the demo gate stays once per session.
const equipmentFound = createDemoSeenStore();
/** The session's find-the-equipment store, handed to StrengthRunner (guided mode only). */
export const hybridEquipmentFound: DemoSeenStore = { has: (id) => equipmentFound.has(id), add: (id) => equipmentFound.add(id) };

/** Block content → the WorkoutPlan StrengthRunner plays. Shared by arrive() and an in-station
 *  swap so both produce the identical shape (incl. the full-park warmup strip). */
function buildStationPlan(content: StrengthBlockResult): WorkoutPlan {
  const stationPlan = strengthBlockToWorkoutPlan(content, {
    name: 'תחנת כוח', location: 'park', fullPark: planFullPark, isWarmupActive: planWarmupActive,
  });
  // Full-park + user skipped the warmup → strip the warmup segment BEFORE StrengthRunner
  // (same predicate as app/workouts/[id]/active/page.tsx). Budget-split (planFullPark=false)
  // never enters this branch, so its plan stays byte-identical.
  if (planFullPark && !planWarmupActive) {
    return {
      ...stationPlan,
      segments: stationPlan.segments.filter(
        (seg) =>
          seg.id !== 'warmup-segment' &&
          seg.id !== 'joints-segment' &&
          !seg.title?.includes('חימום') &&
          !seg.title?.includes('מפרקים'),
      ),
    };
  }
  return stationPlan;
}

/** End-of-station summary held while the completion screen is up (run clock still paused). */
export interface PendingStationComplete {
  exerciseLog: SegmentExerciseDetail[];
  completedAtMs: number;
  exercises: number;
  minutes: number;
}

/** True on an aerobic leg with NO station still ahead (the final leg → finish). */
function isFinalLeg(s: HybridRunState): boolean {
  if (s.phase !== 'aerobic') return false;
  return !s.plan.slice(s.cursor + 1).some((seg) => seg.kind === 'strength');
}

/**
 * Station-approach moment (David, 25.09.2026): the upcoming station's real
 * coordinates + the CURRENT leg's activity type (walking/running — picks
 * which APPROACH_THRESHOLD_METERS constant applies), or null when there's
 * no station immediately ahead (mid-final-leg, or already at/past a
 * station). Computed once per phase transition, same pattern as
 * isFinalLeg above — NOT a continuous subscription (tick() isn't wired
 * into this store; that's a separate item, not bundled here). The
 * component combines this with the live position from useRunningPlayer to
 * derive the actual approach state at render time.
 */
function computeUpcomingStation(s: HybridRunState): UpcomingStationInfo | null {
  if (s.phase !== 'aerobic') return null;
  const next = s.plan[s.cursor + 1];
  if (!next || next.kind !== 'strength' || next.lat == null || next.lng == null) return null;
  const leg = s.plan[s.cursor];
  return {
    lat: next.lat,
    lng: next.lng,
    aerobicType: leg?.aerobicType === 'walking' ? 'walking' : 'running',
    // Map-pin blink (25.09.2026): join key against AppMap's hybridStations
    // markers, which come from a SEPARATE compose pipeline
    // (start-hybrid-session.ts's ComposedHybridSession, attached to the
    // route object as .stationMarkers) — not the same array as this
    // HybridPlan.segments. parkId is the one field both sides already
    // populate for the same real stop.
    parkId: next.parkId,
  };
}

/**
 * G3.1 (walk-to-first-stop): 1-based number of the station the CURRENT aerobic leg leads to, or
 * null when no station is next. Independent of coordinates (a full-park station has none), so
 * the walking card can still say "תחנה ראשונה" / "התחנה הבאה".
 */
function computeNextStationNumber(s: HybridRunState): number | null {
  if (s.phase !== 'aerobic') return null;
  const next = s.plan[s.cursor + 1];
  if (!next || next.kind !== 'strength') return null;
  return s.plan.slice(0, s.cursor + 2).filter((seg) => seg.kind === 'strength').length;
}

/** See computeUpcomingStation. */
export interface UpcomingStationInfo {
  lat: number;
  lng: number;
  aerobicType: 'walking' | 'running';
  parkId?: string;
}

export interface HybridRunStore {
  active: boolean;
  phase: HybridPhase;
  stationPlan: WorkoutPlan | null;
  isFinalLeg: boolean;
  /** See computeUpcomingStation. */
  upcomingStation: UpcomingStationInfo | null;
  /** See computeNextStationNumber (G3.1). */
  nextStationNumber: number | null;
  /**
   * Stage 3 (HYBRID_SUMMARY_ENABLED): the just-finished hybrid's finalize result
   * + calories, stashed for HybridSummary to read at render time. Set in
   * finishHybrid, cleared on reset() and on the next startHybrid.
   */
  finishedHybrid: boolean;
  lastResult: HybridFinalizeResult | null;
  lastCalories: number;
  /** G2.4: context of the station being run (is it the last one? what's next?) — set on arrive. */
  stationContext: StationContext | null;
  /** G2.4: set when a NON-final station's block is done → the completion screen is showing. */
  pendingStationComplete: PendingStationComplete | null;
  startHybrid: (
    plan: HybridPlan,
    aerobicKind: 'running' | 'walking',
    /** Full-park gate. Omitted (budget-split) → current single-segment plan path. */
    fullPark?: boolean,
    /** Full-park only: false = the user skipped the warmup in the overview. */
    warmupActive?: boolean,
    /** parkId → display name, for the end-of-station screen's "next station". */
    names?: Record<string, string>,
  ) => void;
  /** "הגעתי לתחנה" / distance threshold — close the leg, open the station. */
  arrive: () => void;
  /** Close the station, resume the next leg. `completedAtMs` (G2.4) = when the block actually
   *  ended, so time on the completion screen doesn't inflate the station's measured duration. */
  completeStation: (exerciseLog?: SegmentExerciseDetail[], completedAtMs?: number) => void;
  /**
   * G2.4 — StrengthRunner.onComplete. Final station → completeStation immediately (existing
   * finish/summary path, unchanged). Otherwise hold the result for the completion screen; the
   * run clock stays paused until continueAfterStation().
   */
  finishStationWork: (exerciseLog?: SegmentExerciseDetail[]) => void;
  /** G2.4 — "המשך במסלול": close the held station and resume walking (run clock starts NOW). */
  continueAfterStation: () => void;
  /** G2.4 — in-station swap: write the replacement into the live station plan. False = unmapped. */
  swapStationExercise: (segIdx: number, exIdx: number, newExercise: unknown, method: unknown, toLevel?: number) => boolean;
  /** G2.4 — the content exercise (full Exercise doc) + level behind a plan position, for the swap modal. */
  getStationSwapCandidate: (segIdx: number, exIdx: number) => { exercise: unknown; level: number } | null;
  /**
   * "דלג על התחנה" — close the station unrecorded, resume the next leg.
   * Also callable from the aerobic phase, during the approach window
   * (25.09.2026) — see the implementation comment for how that's composed.
   */
  skipStation: () => void;
  /** "סיים אימון משולב" — finalize, write the single doc, tear down the run. */
  finishHybrid: () => Promise<void>;
  reset: () => void;
  /**
   * G3.2 (flag enable_route_direction_adapt): walk the LOOP the other way round. Only on the
   * first leg (cursor 0, aerobic, nothing done yet): rebuilds the controller from the reversed
   * already-composed segments (reverse-plan.ts — no re-compose), same start time. false = refused.
   */
  reverseRoute: () => boolean;
}

export const useHybridRun = create<HybridRunStore>((set, get) => ({
  active: false,
  phase: 'idle',
  stationPlan: null,
  isFinalLeg: false,
  upcomingStation: null,
  nextStationNumber: null,
  finishedHybrid: false,
  lastResult: null,
  lastCalories: 0,
  stationContext: null,
  pendingStationComplete: null,

  startHybrid: (plan, aerobicKind, fullPark = false, warmupActive = true, names = {}) => {
    stationNames = names;
    demoSeen.clear();
    equipmentFound.clear();
    activeStationContent = null;
    stationStartedAtMs = null;
    controllerRef = createHybridSessionController(plan.segments);
    planCalories = plan.totals?.estCalories ?? 0;
    planAerobicCalories = plan.segments
      .filter((s) => s.kind === 'aerobic')
      .reduce((sum, s) => sum + (s.estCalories ?? 0), 0);
    planStrengthCalories = plan.segments
      .filter((s) => s.kind === 'strength')
      .reduce((sum, s) => sum + (s.estCalories ?? 0), 0);
    planAerobicKind = aerobicKind;
    planFullPark = fullPark;
    planWarmupActive = warmupActive;
    saving = false;
    controllerRef.start(Date.now());
    set({
      active: true,
      phase: controllerRef.getPhase(),
      stationPlan: null,
      isFinalLeg: isFinalLeg(controllerRef.getState()),
      upcomingStation: computeUpcomingStation(controllerRef.getState()),
      nextStationNumber: computeNextStationNumber(controllerRef.getState()),
      // Clear any stale HybridSummary stash from a prior session.
      finishedHybrid: false,
      lastResult: null,
      lastCalories: 0,
      stationContext: null,
      pendingStationComplete: null,
    });
  },

  arrive: () => {
    if (!controllerRef) return;
    const s = useSessionStore.getState();
    controllerRef.arrive(s.totalDistance || 0, s.totalDuration || 0, Date.now());
    useSessionStore.getState().pauseSession(); // freeze the run clock during the station
    const station = controllerRef.getActiveStation();
    activeStationContent = station?.content ?? null;
    stationStartedAtMs = Date.now();
    const stationPlan = activeStationContent ? buildStationPlan(activeStationContent) : null;
    const runState = controllerRef.getState();
    const stationContext = computeStationContext(runState.plan, runState.cursor, stationNames);
    // [TEMP DIAG — remove after debugging] media fields that reach StrengthRunner on the hybrid path
    if (stationPlan) {
      const rows = stationPlan.segments.flatMap((seg: any) =>
        (seg.exercises ?? []).map((ex: any) => ({
          name: ex.name, videoUrl: ex.videoUrl, bunnyVideoId: ex.bunnyVideoId, imageUrl: ex.imageUrl,
        })),
      );
      console.log('[hybrid-media-diag] plan → StrengthRunner:', JSON.stringify(rows, null, 2));
    }
    set({ phase: controllerRef.getPhase(), stationPlan, isFinalLeg: false, upcomingStation: null, nextStationNumber: null, stationContext, pendingStationComplete: null });
  },

  completeStation: (exerciseLog, completedAtMs) => {
    if (!controllerRef) return;
    const station = controllerRef.getActiveStation();
    // F1 (19.08.2026): `sets` here is still the PLANNED total, not derived
    // from exerciseLog — a known pre-existing gap (see hybrid-orchestrator's
    // STATION_DONE handling), deliberately left untouched by this change.
    // exerciseLog is carried alongside it purely for summary-screen display;
    // it must not be used to correct `sets`/volume-tracking here — that's a
    // separate, unrelated fix (flagged, not in scope for the detail-capture
    // work this diff is doing).
    const sets = station?.content?.totalPlannedSets ?? 0;
    // Bug fix (23.08.2026): this used to be treated as the REAL station
    // duration and stored as such — it's actually the station's pre-planned
    // estimate (fixed at plan-composition time), the same class of gap the
    // comment above already flags for `sets`. hybrid-orchestrator.ts's
    // STATION_DONE now derives the real duration from atMs/currentStartMs
    // (same approach the aerobic legs already used) and only falls back to
    // this value if a timestamp is ever missing — kept as that fallback,
    // renamed to make the "planned, not measured" nature explicit.
    const plannedDurationSecFallback = station?.content?.estimatedDurationSec ?? 0;
    controllerRef.completeStation(sets, plannedDurationSecFallback, completedAtMs ?? Date.now(), exerciseLog);
    useSessionStore.getState().resumeSession(); // resume the run clock for the next leg
    activeStationContent = null;
    stationStartedAtMs = null;
    set({
      phase: controllerRef.getPhase(),
      stationPlan: null,
      isFinalLeg: isFinalLeg(controllerRef.getState()),
      upcomingStation: computeUpcomingStation(controllerRef.getState()),
      nextStationNumber: computeNextStationNumber(controllerRef.getState()),
      stationContext: null,
      pendingStationComplete: null,
    });
  },

  finishStationWork: (exerciseLog) => {
    if (!controllerRef || controllerRef.getPhase() !== 'station') return;
    const ctx = get().stationContext;
    if (!ctx || ctx.isFinalStation) {
      // Final station (or unknown context): the existing path, byte-identical.
      get().completeStation(exerciseLog);
      return;
    }
    const completedAtMs = Date.now();
    const log = exerciseLog ?? [];
    set({
      pendingStationComplete: {
        exerciseLog: log,
        completedAtMs,
        exercises: countStationExercises(log),
        minutes: stationMinutes(stationStartedAtMs, completedAtMs),
      },
    });
  },

  continueAfterStation: () => {
    const pending = get().pendingStationComplete;
    if (!pending) return;
    get().completeStation(pending.exerciseLog, pending.completedAtMs);
  },

  swapStationExercise: (segIdx, exIdx, newExercise, method, toLevel) => {
    const plan = get().stationPlan;
    if (!activeStationContent || !plan) return false;
    const next = swapExerciseInStationContent(activeStationContent, plan, segIdx, exIdx, newExercise, method, toLevel);
    if (!next) return false;
    activeStationContent = next;
    set({ stationPlan: buildStationPlan(next) });
    return true;
  },

  getStationSwapCandidate: (segIdx, exIdx) => {
    const plan = get().stationPlan;
    if (!activeStationContent || !plan) return null;
    const idx = locateStationContentIndex(activeStationContent, plan, segIdx, exIdx);
    if (idx === -1) return null;
    const we = activeStationContent.exercises[idx];
    // Same level fallback the overview swap uses (DiscoverLayer's hybrid swap).
    const level = we.programLevel ?? (we.exercise as { level?: number })?.level ?? 1;
    return { exercise: we.exercise, level };
  },

  skipStation: () => {
    if (!controllerRef) return;
    // Station-approach moment (David, 25.09.2026): the corner "X" is now
    // visible DURING approach too, not only once at the station — so this
    // can fire while phase is still 'aerobic' (never arrived). Composed
    // from the two existing, already-correct primitives rather than a new
    // reducer path: controllerRef.arrive() closes out the CURRENT leg's
    // actual distance/duration as of right now (exactly what "stopped
    // here, didn't reach the station" should record — the run clock is
    // genuinely still running up to this moment), then skipStation() marks
    // the just-entered station skipped with ~0 duration, identical to a
    // skip tapped at the station itself. A literal loosening of the
    // reducer's `phase !== 'station'` guard instead would need to
    // re-derive "how far into the run has the skipped station's leg
    // progressed" without tick() (unwired — separate item, not bundled
    // here per instruction), risking double-counting; this composition
    // sidesteps that using events that already exist and are already
    // tested. Byte-identical to before when already at the station
    // (phase === 'station' — the `if` below is simply skipped).
    if (controllerRef.getPhase() === 'aerobic') {
      const s = useSessionStore.getState();
      controllerRef.arrive(s.totalDistance || 0, s.totalDuration || 0, Date.now());
      useSessionStore.getState().pauseSession();
    }
    controllerRef.skipStation(Date.now());
    useSessionStore.getState().resumeSession(); // resume the run clock for the next leg
    activeStationContent = null;
    stationStartedAtMs = null;
    set({
      phase: controllerRef.getPhase(),
      stationPlan: null,
      isFinalLeg: isFinalLeg(controllerRef.getState()),
      upcomingStation: computeUpcomingStation(controllerRef.getState()),
      nextStationNumber: computeNextStationNumber(controllerRef.getState()),
      stationContext: null,
      pendingStationComplete: null,
    });
  },

  finishHybrid: async () => {
    if (!controllerRef || saving) return;
    saving = true;
    const s = useSessionStore.getState();
    controllerRef.finish(s.totalDistance || 0, s.totalDuration || 0, Date.now());
    const result = controllerRef.finalize();

    // Minimum-activity guard (follow-up, 11.10.2026 — David caught this
    // before merging G7.1) — see isNegligibleHybridSession's own doc comment
    // in hybrid-finish-policy.ts for the full rationale.
    const totalDurationSec = result.segments.reduce(
      (acc, seg) => acc + (seg.actual?.durationSec ?? 0), 0,
    );
    const isNegligibleSession = isNegligibleHybridSession(
      totalDurationSec,
      result.summary.totalActualDistanceKm,
      result.summary.totalStrengthSets,
    );

    if (isNegligibleSession) {
      console.log('[useHybridRun] negligible session (< 60s, < 0.1km, 0 sets) — skipping save, same guard the solo-run path already applies');
    } else {
    // Stage 3: stash the finalize result for HybridSummary BEFORE the awaits
    // below — endSession() inside finishWorkout (further down) raises the summary
    // via MapShell, so stash first to avoid a mount-before-stash race. Gated →
    // store byte-identical while HYBRID_SUMMARY_ENABLED is false. No 2nd save:
    // this reuses the value finalize() already produced.
    if (HYBRID_SUMMARY_ENABLED) {
      set({ finishedHybrid: true, lastResult: result, lastCalories: planCalories });
    }

    // ── The SINGLE hybrid doc ────────────────────────────────────────────────
    try {
      const { auth } = await import('@/lib/firebase');
      const uid = auth.currentUser?.uid;
      if (uid) {
        const { saveHybridWorkout } = await import('./hybrid-save.service');
        await saveHybridWorkout(result, {
          userId: uid,
          aerobicKind: planAerobicKind,
          totalCalories: planCalories,
        });

        // ── dailyActivity / streak / daily-goal — SPLIT cardio vs strength ────
        // saveHybridWorkout writes only the `workouts` history doc; the rings,
        // streak, daily-goal checkmark, weekly volume and HealthKit write-back
        // all live behind syncWorkoutCompletion (which the suppressed runner
        // teardown below never reaches). This is the single sync point.
        // totalDurationSec computed above (minimum-activity guard) — reused here.
        const aerobicSec = result.summary.totalActualAerobicSec;
        const strengthSec = Math.max(0, totalDurationSec - aerobicSec);

        const { syncWorkoutCompletion } = await import(
          '@/features/workout-engine/services/completion-sync.service'
        );
        await syncWorkoutCompletion({
          workoutType: 'hybrid',
          // Bug fix (23.08.2026, David caught on-device): this was never
          // sent, so home's completionData.workoutTitle was always
          // undefined for a hybrid completion — the card silently fell back
          // to its generic category label, which for hybrid (styled as
          // 'strength' for display, see home/page.tsx) reads "אימון כוח"
          // even though a hybrid session was completed. No per-session name
          // exists for a hybrid workout (HybridPlan carries no name/title
          // field, confirmed before this fix) — HybridSummary.tsx's own
          // header hardcodes the identical literal for the same reason;
          // matching it here keeps the card and the summary screen in sync.
          workoutTitle: 'אימון משולב',
          durationMinutes: Math.max(Math.round(totalDurationSec / 60), 1),
          calories: planCalories,
          activityCategory: 'cardio', // aggregate fallback (unused — categorySplits wins)
          displayIcon: 'activity',
          distanceKm: result.summary.totalActualDistanceKm,
          categorySplits: [
            { category: 'cardio', durationMinutes: Math.round(aerobicSec / 60), calories: planAerobicCalories },
            { category: 'strength', durationMinutes: Math.round(strengthSec / 60), calories: planStrengthCalories },
          ],
        });

        // ── Weekly volume — aerobic distance + strength sets (mirrors solo) ───
        // Kept in the caller (like the strength-solo path) because the set /
        // difficulty data lives on the finalize result, not the sync payload.
        try {
          const { useWeeklyVolumeStore } = await import(
            '@/features/workout-engine/core/store/useWeeklyVolumeStore'
          );
          const wv = useWeeklyVolumeStore.getState();
          if (result.summary.totalActualDistanceKm > 0) {
            wv.recordRunningSession(result.summary.totalActualDistanceKm, Math.round(aerobicSec / 60));
          }
          if (result.summary.totalStrengthSets > 0) {
            wv.recordStrengthSession(
              result.summary.totalStrengthSets, // completed
              result.summary.totalStrengthSets, // planned (MVP: no per-set plan on finalize)
              2,     // difficulty — neutral default (no bolt data on the finalize result)
              false, // isRecovery
              undefined,
              Math.round(strengthSec / 60),
            );
          }
        } catch (volErr) {
          console.error('[useHybridRun] weekly volume record failed', volErr);
        }
      }
    } catch (e) {
      console.error('[useHybridRun] hybrid save failed', e);
    }
    }

    // ── Tear down the runner (finishWorkout suppressed → no second doc) ───────
    // calledFromHybridTeardown:true (G7.1 fix) — the one flag that tells
    // finishWorkout this IS the legitimate internal teardown call, so it
    // proceeds with its own hybrid-suppression branch instead of redirecting
    // back here (which would otherwise recurse).
    try {
      const { useRunningPlayer } = await import(
        '@/features/workout-engine/players/running/store/useRunningPlayer'
      );
      await useRunningPlayer.getState().finishWorkout({ calledFromHybridTeardown: true });
    } catch (e) {
      console.error('[useHybridRun] runner teardown failed', e);
    }

    controllerRef = null;
    set({ active: false, phase: 'done', stationPlan: null, isFinalLeg: false, upcomingStation: null, nextStationNumber: null });
  },

  reverseRoute: () => {
    if (!controllerRef) return false;
    const st = controllerRef.getState();
    if (st.phase !== 'aerobic' || st.cursor !== 0) return false;
    const startMs = st.currentStartMs ?? Date.now();
    controllerRef = createHybridSessionController(reverseHybridSegments(st.plan));
    controllerRef.start(startMs);
    const next = controllerRef.getState();
    set({
      phase: controllerRef.getPhase(),
      stationPlan: null,
      isFinalLeg: isFinalLeg(next),
      upcomingStation: computeUpcomingStation(next),
      nextStationNumber: computeNextStationNumber(next),
      stationContext: null,
      pendingStationComplete: null,
    });
    return true;
  },

  reset: () => {
    controllerRef = null;
    saving = false;
    stationNames = {};
    demoSeen.clear();
    equipmentFound.clear();
    activeStationContent = null;
    stationStartedAtMs = null;
    set({
      active: false,
      phase: 'idle',
      stationPlan: null,
      isFinalLeg: false,
      upcomingStation: null,
      nextStationNumber: null,
      finishedHybrid: false,
      lastResult: null,
      lastCalories: 0,
      stationContext: null,
      pendingStationComplete: null,
    });
  },
}));
