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
import { strengthBlockToWorkoutPlan } from './strength-block-to-plan';
import { HYBRID_SUMMARY_ENABLED } from '@/config/feature-flags';
import type { SegmentExerciseDetail } from '../core/services/storage.service';

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

/** True on an aerobic leg with NO station still ahead (the final leg → finish). */
function isFinalLeg(s: HybridRunState): boolean {
  if (s.phase !== 'aerobic') return false;
  return !s.plan.slice(s.cursor + 1).some((seg) => seg.kind === 'strength');
}

export interface HybridRunStore {
  active: boolean;
  phase: HybridPhase;
  stationPlan: WorkoutPlan | null;
  isFinalLeg: boolean;
  /**
   * Stage 3 (HYBRID_SUMMARY_ENABLED): the just-finished hybrid's finalize result
   * + calories, stashed for HybridSummary to read at render time. Set in
   * finishHybrid, cleared on reset() and on the next startHybrid.
   */
  finishedHybrid: boolean;
  lastResult: HybridFinalizeResult | null;
  lastCalories: number;
  startHybrid: (
    plan: HybridPlan,
    aerobicKind: 'running' | 'walking',
    /** Full-park gate. Omitted (budget-split) → current single-segment plan path. */
    fullPark?: boolean,
    /** Full-park only: false = the user skipped the warmup in the overview. */
    warmupActive?: boolean,
  ) => void;
  /** "הגעתי לתחנה" / distance threshold — close the leg, open the station. */
  arrive: () => void;
  /** StrengthRunner.onComplete — close the station, resume the next leg. */
  completeStation: (exerciseLog?: SegmentExerciseDetail[]) => void;
  /** "סיים אימון משולב" — finalize, write the single doc, tear down the run. */
  finishHybrid: () => Promise<void>;
  reset: () => void;
}

export const useHybridRun = create<HybridRunStore>((set) => ({
  active: false,
  phase: 'idle',
  stationPlan: null,
  isFinalLeg: false,
  finishedHybrid: false,
  lastResult: null,
  lastCalories: 0,

  startHybrid: (plan, aerobicKind, fullPark = false, warmupActive = true) => {
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
      // Clear any stale HybridSummary stash from a prior session.
      finishedHybrid: false,
      lastResult: null,
      lastCalories: 0,
    });
  },

  arrive: () => {
    if (!controllerRef) return;
    const s = useSessionStore.getState();
    controllerRef.arrive(s.totalDistance || 0, s.totalDuration || 0, Date.now());
    useSessionStore.getState().pauseSession(); // freeze the run clock during the station
    const station = controllerRef.getActiveStation();
    let stationPlan = station?.content
      ? strengthBlockToWorkoutPlan(station.content, {
          name: 'תחנת כוח', location: 'park', fullPark: planFullPark, isWarmupActive: planWarmupActive,
        })
      : null;
    // Full-park + user skipped the warmup → strip the warmup segment BEFORE StrengthRunner
    // (same predicate as app/workouts/[id]/active/page.tsx). Budget-split (planFullPark=false)
    // never enters this branch, so its plan stays byte-identical.
    if (stationPlan && planFullPark && !planWarmupActive) {
      stationPlan = {
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
    // [TEMP DIAG — remove after debugging] media fields that reach StrengthRunner on the hybrid path
    if (stationPlan) {
      const rows = stationPlan.segments.flatMap((seg: any) =>
        (seg.exercises ?? []).map((ex: any) => ({
          name: ex.name, videoUrl: ex.videoUrl, bunnyVideoId: ex.bunnyVideoId, imageUrl: ex.imageUrl,
        })),
      );
      console.log('[hybrid-media-diag] plan → StrengthRunner:', JSON.stringify(rows, null, 2));
    }
    set({ phase: controllerRef.getPhase(), stationPlan, isFinalLeg: false });
  },

  completeStation: (exerciseLog) => {
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
    const dur = station?.content?.estimatedDurationSec ?? 0;
    controllerRef.completeStation(sets, dur, Date.now(), exerciseLog);
    useSessionStore.getState().resumeSession(); // resume the run clock for the next leg
    set({
      phase: controllerRef.getPhase(),
      stationPlan: null,
      isFinalLeg: isFinalLeg(controllerRef.getState()),
    });
  },

  finishHybrid: async () => {
    if (!controllerRef || saving) return;
    saving = true;
    const s = useSessionStore.getState();
    controllerRef.finish(s.totalDistance || 0, s.totalDuration || 0, Date.now());
    const result = controllerRef.finalize();

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
        const totalDurationSec = result.segments.reduce(
          (acc, s) => acc + (s.actual?.durationSec ?? 0), 0,
        );
        const aerobicSec = result.summary.totalActualAerobicSec;
        const strengthSec = Math.max(0, totalDurationSec - aerobicSec);

        const { syncWorkoutCompletion } = await import(
          '@/features/workout-engine/services/completion-sync.service'
        );
        await syncWorkoutCompletion({
          workoutType: 'hybrid',
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

    // ── Tear down the runner (finishWorkout suppressed → no second doc) ───────
    try {
      const { useRunningPlayer } = await import(
        '@/features/workout-engine/players/running/store/useRunningPlayer'
      );
      await useRunningPlayer.getState().finishWorkout();
    } catch (e) {
      console.error('[useHybridRun] runner teardown failed', e);
    }

    controllerRef = null;
    set({ active: false, phase: 'done', stationPlan: null, isFinalLeg: false });
  },

  reset: () => {
    controllerRef = null;
    saving = false;
    set({
      active: false,
      phase: 'idle',
      stationPlan: null,
      isFinalLeg: false,
      finishedHybrid: false,
      lastResult: null,
      lastCalories: 0,
    });
  },
}));
