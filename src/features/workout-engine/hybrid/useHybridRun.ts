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
import type { HybridPhase, HybridRunState } from './hybrid-orchestrator';
import { createHybridSessionController } from './hybrid-session-controller';
import { strengthBlockToWorkoutPlan } from './strength-block-to-plan';

// Non-reactive handles (a controller closure can't live in reactive state).
let controllerRef: HybridControllerHandle | null = null;
let planCalories = 0;
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
  completeStation: () => void;
  /** "סיים אימון משולב" — finalize, write the single doc, tear down the run. */
  finishHybrid: () => Promise<void>;
  reset: () => void;
}

export const useHybridRun = create<HybridRunStore>((set) => ({
  active: false,
  phase: 'idle',
  stationPlan: null,
  isFinalLeg: false,

  startHybrid: (plan, aerobicKind, fullPark = false, warmupActive = true) => {
    controllerRef = createHybridSessionController(plan.segments);
    planCalories = plan.totals?.estCalories ?? 0;
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
    set({ phase: controllerRef.getPhase(), stationPlan, isFinalLeg: false });
  },

  completeStation: () => {
    if (!controllerRef) return;
    const station = controllerRef.getActiveStation();
    const sets = station?.content?.totalPlannedSets ?? 0;
    const dur = station?.content?.estimatedDurationSec ?? 0;
    controllerRef.completeStation(sets, dur, Date.now());
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
    set({ active: false, phase: 'idle', stationPlan: null, isFinalLeg: false });
  },
}));
