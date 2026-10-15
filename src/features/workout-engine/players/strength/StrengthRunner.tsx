'use client';

/**
 * StrengthRunner — Spotify-style decoupled live workout player.
 *
 * After Decoupling Steps R-1 … R-12, this file is a lean ORCHESTRATOR that
 * wires the workout state machine to specialised hooks and presentational
 * components.  No business logic, no inline JSX trees of significant size.
 *
 * Layered architecture:
 *   Base Layer  — WorkoutPlaylist (background playlist surface)
 *   Top Layer   — Active workout, draggable down to MiniPlayerBar
 *
 * Drag mechanics (framer-motion):
 *   - RunnerHeader is the drag handle (touch-action: none)
 *   - Drag down → snaps to MiniPlayerBar (based on offset/velocity)
 *   - Drag up   → expands back to full screen
 *
 * State machine view routing:
 *   PREPARING → PreparingStateView
 *   ACTIVE    → ActiveExerciseView
 *   INPUT     → InputStateView (Big-Screen rep/time confirmation)
 *   RESTING   → RestingStateView (+ LogDrawerContent slot)
 *
 * Extracted hooks (peripheral concerns):
 *   usePlayerMedia        — offline-cached video/image URL resolution
 *   usePlayerDrag         — minimize / expand drag state machine
 *   useInputPickerState   — every picker, ref, effect, coach-hint
 *   usePlayerLifecycle    — persistence + wake-lock
 *   usePlayerMediaSession — OS lock-screen / headphone controls bridge
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WorkoutPlan } from '@/features/parks';

import LogDrawerContent from './components/LogDrawerContent';
import MiniPlayerBar from './components/MiniPlayerBar';
import PauseOverlay from './components/PauseOverlay';
import ExitConfirmModal from './components/ExitConfirmModal';
import RunnerHeader from './components/RunnerHeader';
import PreparingStateView from './components/PreparingStateView';
import InputStateView from './components/InputStateView';
import RestingStateView from './components/RestingStateView';
import ActiveExerciseView from './components/ActiveExerciseView';
import RestScreen from './components/RestScreen';
import WorkoutPlaylist from './playlist/WorkoutPlaylist';

import {
  useWorkoutStateMachine,
  ExerciseResultLog,
  NextExerciseInfo,
  InitialWorkoutCheckpoint,
} from './hooks/useWorkoutStateMachine';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { usePlayerMedia } from './hooks/usePlayerMedia';
import { usePlayerDrag } from './hooks/usePlayerDrag';
import { useInputPickerState } from './hooks/useInputPickerState';
import { usePlayerLifecycle } from './hooks/usePlayerLifecycle';
import { usePlayerMediaSession } from './hooks/usePlayerMediaSession';
import { hapticMedium } from '@/lib/haptics';
import { useUserStore } from '@/features/user';
import { g } from '@/lib/utils/gendered-text';
import { guidanceLine } from '@/features/workout-engine/hybrid/guided-station';
import DemoGateOverlay from './components/DemoGateOverlay';
import FindEquipmentOverlay from './components/FindEquipmentOverlay';
import { findEquipmentScreen, idsToMarkFound } from './logic/find-equipment';
import {
  shouldGateExercise, timerLeadInSeconds, gateClipMuted, type DemoSeenStore,
} from './logic/demo-gate';
import { isPlayerAudioMuted } from './logic/player-audio-mute';

export type { ExerciseResultLog };

interface StrengthRunnerProps {
  workout: WorkoutPlan;
  onComplete?: (exerciseLog?: ExerciseResultLog[]) => void;
  onPause?: () => void;
  onResume?: () => void;
  onSwapExercise?: (exerciseId: string, segmentIndex: number, exerciseIndex: number) => void;
  /** Pre-fetched map of exerciseId → last-session confirmed reps, for smart target selection */
  exerciseHistoryMap?: Record<string, number[]>;
  /** B2: true when mounted inside a hybrid station (HybridStationLayer). Hides the
   *  minimize button (no mini-player bar in the hybrid flow). Default false → the
   *  standalone strength session is unchanged. */
  embedded?: boolean;
  /** PR-B1: the guided ("ליווי צעד-אחר-צעד") layer is on for this hybrid station → short
   *  guidance line under the exercise + the rest screen's next-exercise tile starts expanded.
   *  Default false → standalone strength and fast-mode stations are unchanged. */
  guided?: boolean;
  /** PR-B2: guided "watch the demo first" gate. When provided (guided mode + kill-switch on —
   *  only HybridStationLayer passes it), the player is held paused before the first set of each
   *  exercise not yet in this session-wide seen-store; the gate replaces the PREPARING countdown
   *  for the first exercise. Omitted → fast mode, byte-identical (PREPARING unchanged). */
  demoGate?: DemoSeenStore;
  /** PR-B3: guided "מצא את המתקן" screen for machine exercises — a session-wide "found" store.
   *  Omitted → never shown (fast mode). Shown BEFORE the demo gate (welcome → find → gate → set). */
  findEquipment?: DemoSeenStore;
  /**
   * Crash-recovery: seed values from a restored WorkoutCheckpoint, passed
   * down once the page-level resume-offer dialog resolves to "Resume".
   * Undefined (the default) is byte-identical to today — the state machine
   * starts fresh exactly as before this prop existed.
   */
  initialCheckpoint?: InitialWorkoutCheckpoint;
}

export default function StrengthRunner({
  workout,
  onComplete,
  onPause,
  onResume,
  onSwapExercise,
  exerciseHistoryMap,
  embedded = false,
  guided = false,
  demoGate,
  findEquipment,
  initialCheckpoint,
}: StrengthRunnerProps) {
  const sm = useWorkoutStateMachine(workout, onComplete, onPause, onResume, undefined, exerciseHistoryMap, initialCheckpoint);

  // ── Offline-cached + network-aware media URLs ──────────────────────────
  const { safeVideoUrl, safeImageUrl, safeNextVideoUrl } = usePlayerMedia({
    exerciseVideoUrl: sm.exerciseVideoUrl,
    bunnyVideoId: sm.exerciseBunnyVideoId,
    exerciseImageUrl: sm.activeExercise?.imageUrl,
    nextExerciseVideoUrl: sm.nextExercise.videoUrl,
    nextBunnyVideoId: sm.nextExercise.bunnyVideoId,
  });

  // NOTE: usePlayerMediaSession is declared AFTER handleBigScreenInputSave
  // (further below) to avoid a Temporal Dead Zone — `const` bindings are not
  // hoisted.  Hook order is preserved relative to the original call stack.

  // ── Spotify-style draggable shell (extracted to usePlayerDrag, Step R-2) ─
  const {
    dragControls,
    isMinimized,
    setIsMinimized,
    minimizedY,
    handleDragEnd,
    handleHeaderPointerDown,
  } = usePlayerDrag();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bridge: force-expand the player whenever we re-enter the PREPARING phase
  // (e.g. workout restart).  The drag hook is intentionally state-machine-agnostic,
  // so the orchestrator owns this single lifecycle reset.
  useEffect(() => {
    if (sm.workoutState === 'PREPARING') setIsMinimized(false);
  }, [sm.workoutState, setIsMinimized]);

  // ── Picker state + config (extracted to useInputPickerState, Step R-3) ───
  // Single source of truth for every picker, ref, effect, and coach-hint piece
  // used by both the Big-Screen INPUT layout and the Log-Drawer RESTING sheet.
  // Declared BEFORE isUnilateralForInput / handleBigScreenInputSave so the
  // input picker values are in scope by the time the orchestrator references
  // them (and before mediaSessionNextTrack to avoid a TDZ).
  const {
    inputRepsValue,
    inputRepsLeft,
    inputRepsRight,
    setInputRepsValue,
    setInputRepsLeft,
    setInputRepsRight,
    repsLeft,
    repsRight,
    setRepsLeft,
    setRepsRight,
    isDrawerStable,
    coachHint,
    setCoachHint,
    lockedAchievedRef,
    pickerConfig: {
      isTimeExercise,
      pickerTargetValue,
      pickerUnitType,
      pickerMax,
      pickerInitialValue,
    },
    handlePickerChange,
    handleUnilateralSave,
  } = useInputPickerState({
    workoutState: sm.workoutState,
    completedReps: sm.completedReps,
    isLogDrawerOpen: sm.isLogDrawerOpen,
    activeExercise: sm.activeExercise,
    exerciseDuration: sm.exerciseDuration,
    dynamicTarget: sm.dynamicTarget,
    targetReps: sm.targetReps,
    repsRangeMax: sm.repsRangeMax,
    lastSavedReps: sm.lastSavedReps,
    pendingSideData: sm.pendingSideData,
    currentRound: sm.currentRound,
    setCompletedReps: sm.setCompletedReps,
    handleRepetitionSave: sm.handleRepetitionSave,
  });

  // ── Peripheral OS / runtime lifecycle (extracted to usePlayerLifecycle, Step R-4) ─
  // Bundles workout-session persistence (auto-save + background pause) and
  // screen wake-lock acquisition.  Pure side-effect — no values flow back.
  usePlayerLifecycle({
    workoutId: workout.id,
    workoutState: sm.workoutState,
    isPaused: sm.isPaused,
    currentSegmentIndex: sm.currentSegmentIndex,
    currentExerciseIndex: sm.currentExerciseIndex,
    currentSetIndex: sm.currentRound - 1,
    elapsedTime: sm.elapsedTime,
    getExerciseLog: sm.getExerciseLog,
    togglePause: sm.togglePause,
  });

  // Memoized by exercise identity so the layout can't flicker to bilateral
  // during the ACTIVE→INPUT transition when activeExercise briefly resolves
  // to null between the setCompletedReps and setWorkoutState('INPUT') renders.
  const isUnilateralForInput = useMemo(
    () =>
      (sm.activeExercise as any)?.symmetry === 'unilateral' ||
      (sm.activeExercise as any)?.isUnilateral === true,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sm.activeExercise?.id],
  );

  const handleBigScreenInputSave = useCallback(() => {
    if (isUnilateralForInput) {
      sm.handleRepetitionSave(
        Math.min(inputRepsLeft, inputRepsRight),
        { left: inputRepsLeft, right: inputRepsRight },
      );
    } else {
      sm.handleRepetitionSave(inputRepsValue);
    }
  }, [
    isUnilateralForInput,
    inputRepsValue,
    inputRepsLeft,
    inputRepsRight,
    sm,
  ]);

  // ── OS lock-screen / headphone controls (extracted to usePlayerMediaSession, Step R-12) ─
  // Declared here so handleBigScreenInputSave is in scope.  Pure peripheral —
  // no return value; the hook owns the navigator.mediaSession bridge entirely.
  usePlayerMediaSession({
    workoutState: sm.workoutState,
    exerciseName: sm.exerciseName,
    nextExerciseName: sm.nextExercise.name,
    workoutName: workout.name,
    artworkUrl: safeImageUrl || sm.nextExercise.imageUrl,
    isPaused: sm.isPaused,
    onSkipRest: sm.skipRest,
    onSaveInput: handleBigScreenInputSave,
    onCompleteExercise: sm.handleExerciseComplete,
    onTogglePause: sm.togglePause,
  });

  // ── Context-Persistence: snapshot current exercise while drawer is open ──
  // When the log drawer opens, David should see the exercise he just finished
  // (not the next one). We continuously refresh the snapshot from sm values
  // while the drawer is open so it stays in sync with any late-arriving data
  // (e.g. videoUrl resolving after mount). When the drawer closes, we clear
  // the snapshot so RestScreen switches to the next exercise.
  const currentExerciseSnapshotRef = useRef<NextExerciseInfo | null>(null);

  if (sm.isLogDrawerOpen && sm.activeExercise) {
    currentExerciseSnapshotRef.current = {
      name: sm.exerciseName,
      videoUrl: safeVideoUrl,
      bunnyVideoId: sm.exerciseBunnyVideoId,
      imageUrl: safeImageUrl ?? null,
      equipment: sm.activeExercise.equipment
        ? (Array.isArray(sm.activeExercise.equipment) ? sm.activeExercise.equipment : [sm.activeExercise.equipment])
        : [],
      reps: sm.activeExercise.reps,
      duration: sm.activeExercise.duration,
      exerciseType: sm.exerciseType,
      executionSteps: sm.executionSteps,
      muscleGroups: sm.muscleGroups,
      exerciseGoal: sm.exerciseGoal,
      notificationText: null,
    };
  } else if (!sm.isLogDrawerOpen) {
    currentExerciseSnapshotRef.current = null;
  }

  const restPreviewExercise = sm.isLogDrawerOpen && currentExerciseSnapshotRef.current
    ? currentExerciseSnapshotRef.current
    : sm.nextExercise;

  const showHeader = sm.workoutState !== 'PREPARING';
  const isResting = sm.workoutState === 'RESTING';
  const isUnilateral = sm.activeExercise?.symmetry === 'unilateral';

  const segTitle = sm.currentSegment?.title || '';
  const isWarmupSegment = segTitle.includes('חימום') || segTitle.toLowerCase().includes('warmup')
    || sm.activeExercise?.exerciseRole === 'warmup';
  const isCooldownSegment = segTitle.includes('שחרור') || segTitle.includes('קירור')
    || segTitle.toLowerCase().includes('cooldown')
    || sm.activeExercise?.exerciseRole === 'cooldown';

  // ── Swap handler ─────────────────────────────────────────────────────────

  const handleSwap = onSwapExercise
    ? () => {
        const exId = sm.activeExercise?.id || '';
        if (exId) {
          hapticMedium();
          onSwapExercise(exId, sm.currentSegmentIndex, sm.currentExerciseIndex);
        }
      }
    : undefined;

  // ── Log Drawer content (extracted to LogDrawerContent, Step R-5) ─────────
  // Slot rendered inside RestScreen as the `logDrawerNode`.  All picker
  // wiring is piped from the picker hook; save callbacks below stitch the
  // component to the state-machine while keeping coach-hint UX inside the view.
  const logDrawerContent = (
    <LogDrawerContent
      isDrawerStable={isDrawerStable}
      isUnilateral={isUnilateral}
      pickerConfig={{
        targetValue: pickerTargetValue,
        unitType: pickerUnitType,
        max: pickerMax,
        initialValue: pickerInitialValue,
      }}
      lockedAchievedRef={lockedAchievedRef}
      completedReps={sm.completedReps}
      repsRight={repsRight}
      repsLeft={repsLeft}
      onRepsRightChange={setRepsRight}
      onRepsLeftChange={setRepsLeft}
      onPickerChange={handlePickerChange}
      repsRangeMin={sm.repsRangeMin}
      repsRangeMax={sm.repsRangeMax}
      onSaveBilateral={() => {
        const repsToSave =
          sm.completedReps ?? lockedAchievedRef.current ?? pickerInitialValue ?? pickerTargetValue;
        if (!repsToSave || repsToSave <= 0) {
          sm.handleRepetitionSave(pickerTargetValue);
          return;
        }
        sm.handleRepetitionSave(repsToSave);
      }}
      onSaveUnilateral={handleUnilateralSave}
      onSetCoachHint={setCoachHint}
      onSwap={handleSwap}
    />
  );

  // ── Phase 4.6: Pause Overlay & Early Exit ───────────────────────────────

  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const userGender = useUserStore((s) => s.profile?.core?.gender ?? 'male');

  // ── PR-B2 demo gate (guided only) ───────────────────────────────────────
  // Held in the player's EXISTING pause — every clock already honours isPaused (elapsed +
  // PREPARING countdown, rest countdown, the rep CTA's auto-fill, and since PR-A the timer
  // card). The gate sheet replaces the pause overlay; the demo clip keeps looping behind it.
  const isTabataBlock = sm.blockProtocol?.id === 'tabata';
  const isFirstTabataInterval =
    isTabataBlock && sm.currentRound === 1 && sm.currentExerciseIndex === 0 && sm.currentSide !== 'left';
  const gateActiveKey = `active-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}-set-${sm.currentRound}`;
  const [, setGateTick] = useState(0); // re-render after the (non-reactive) seen-store changes
  const [gatePassedKey, setGatePassedKey] = useState<string | null>(null);
  const gateVideoElRef = useRef<HTMLVideoElement | null>(null);
  const gateTransitionKeyRef = useRef<string | null>(null);
  // PR-B3: find-the-equipment comes first; the demo gate is only considered once no find screen
  // is pending for this exercise → welcome → find → gate → set. Both use the same hold.
  const findScreen = findEquipmentScreen({
    enabled: !!findEquipment,
    seen: findEquipment,
    workoutState: sm.workoutState,
    exerciseType: sm.exerciseType,
    segment: workout.segments[sm.currentSegmentIndex],
    exIdx: sm.currentExerciseIndex,
    isTabataBlock,
    isFirstTabataInterval,
  });
  const needsFind = findScreen != null;
  const gateInput = {
    enabled: !!demoGate,
    exerciseId: sm.activeExercise?.id,
    exerciseType: sm.exerciseType,
    workoutState: sm.workoutState,
    seen: demoGate,
    isTabataBlock,
    isFirstTabataInterval,
  };
  const needsGate = !needsFind && shouldGateExercise(gateInput);
  const needsHold = needsFind || needsGate;
  const gateActive = needsGate && sm.workoutState === 'ACTIVE';
  const findActive = needsFind && sm.workoutState === 'ACTIVE';
  // Layout effect → the hold lands before paint, so no clock gets a tick in.
  useLayoutEffect(() => {
    if (!needsHold) return;
    // First exercise: the gate REPLACES the 3-2-1 countdown (straight to ACTIVE, held).
    if (sm.workoutState === 'PREPARING' && gateTransitionKeyRef.current !== gateActiveKey) {
      gateTransitionKeyRef.current = gateActiveKey;
      sm.forceTransition('ACTIVE', { reason: 'demo-gate' });
    }
    if (!sm.isPaused) sm.togglePause();
  }, [needsHold, sm.workoutState, sm.isPaused, gateActiveKey]);

  const handleEquipmentFound = useCallback(() => {
    if (!findScreen) return;
    idsToMarkFound(findScreen).forEach((id) => findEquipment?.add(id));
    setGatePassedKey(gateActiveKey);
    setGateTick((t) => t + 1);
    // Next: the demo gate if this exercise's demo wasn't watched yet (stay held), else the set.
    const gateNext = shouldGateExercise({ ...gateInput, workoutState: 'ACTIVE' });
    if (!gateNext && sm.isPaused) sm.togglePause();
  }, [findScreen, findEquipment, gateActiveKey, gateInput, sm]);

  const handleGateStart = useCallback(() => {
    // Inside the tap (a user gesture): unmute + play the demo clip — unless the session mute is on.
    const el = gateVideoElRef.current;
    if (el) {
      el.muted = gateClipMuted(isPlayerAudioMuted());
      const attempt = el.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => { el.muted = true; el.play().catch(() => {}); });
      }
    }
    // Mark seen (a tabata block's one gate covers every member of the block).
    const ids = isTabataBlock
      ? (workout.segments[sm.currentSegmentIndex]?.exercises ?? []).map((e) => e.id).filter(Boolean)
      : [sm.activeExercise?.id].filter(Boolean);
    ids.forEach((id) => demoGate?.add(id as string));
    setGatePassedKey(gateActiveKey);
    setGateTick((t) => t + 1);
    if (sm.isPaused) sm.togglePause(); // release the hold → the timer / rep set starts now
  }, [isTabataBlock, workout.segments, sm, demoGate, gateActiveKey]);

  const handleEarlyExit = useCallback(() => {
    setShowExitConfirmModal(false);
    onComplete?.(sm.getExerciseLog());
  }, [sm.getExerciseLog, onComplete]);

  // Android hardware back / iOS edge-swipe-back → open the exit confirmation
  // modal instead of popping the route (which would silently discard all
  // workout progress). Dispatched by src/lib/native/init.ts (Android) /
  // ViewController.swift (iOS) while on an /active or /workout-builder route.
  //
  // ⚠️ LEGACY-PATH LISTENER (12.08.2026 product-decision reversal): behind
  // WORKOUT_EXIT_HARD_BLOCK_ENABLED (src/config/feature-flags.ts, default
  // false), both native handlers now silently absorb the gesture instead of
  // dispatching this event at all — the flag is the thing that stops this
  // listener from firing, not a code change here. While the flag is false
  // (today's shipped state) this is still live and required — do NOT delete
  // it without also confirming the flag has flipped true everywhere it
  // matters (web deploy for Android + a shipped native rebuild for iOS).
  // ExitConfirmModal has a SECOND, independent trigger — the explicit
  // "סיום אימון" button in PauseOverlay (below) — so the modal itself stays
  // regardless of this flag's state.
  useEffect(() => {
    const handleNativeBack = () => setShowExitConfirmModal(true);
    window.addEventListener('nativeBackInWorkout', handleNativeBack);
    return () => window.removeEventListener('nativeBackInWorkout', handleNativeBack);
  }, []);

  // ========================================================================
  // REACTIVE SET PROGRESS — same source-of-truth as the Playlist pills
  // ========================================================================

  const currentExLoggedReps = useMemo(() => {
    if (!sm.activeExercise) return [];
    const segId = workout.segments[sm.currentSegmentIndex]?.id || String(sm.currentSegmentIndex);
    const entry = sm.exerciseLogSnapshot.find(
      e => e.exerciseId === sm.activeExercise!.id && e.segmentId === segId,
    );
    const reps = entry?.confirmedReps ?? [];
    return Array.from({ length: sm.totalRounds }, (_, i) => reps[i] ?? null);
  }, [sm.activeExercise, sm.currentSegmentIndex, sm.exerciseLogSnapshot, sm.totalRounds, workout.segments]);

  const firstIncompleteSetIdx = useMemo(() => {
    const setIdx = sm.currentRound - 1;
    for (let j = 0; j < currentExLoggedReps.length; j++) {
      if (currentExLoggedReps[j] === null && j >= setIdx) return j;
    }
    return -1;
  }, [currentExLoggedReps, sm.currentRound]);

  useEffect(() => {
    console.log(
      `🖥️ [Big Screen] Snapshot received update. currentExercise reps: [${currentExLoggedReps.join(', ')}] | exercise: ${sm.exerciseName} | t=${performance.now().toFixed(1)}ms`,
    );
  }, [sm.exerciseLogSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  // ── Pyramid upcoming steps — slice everything after the current round ───
  // sm.currentRound is 1-based; slice(currentRound) gives steps AFTER now.
  const upcomingPyramidSteps = useMemo<PyramidStep[]>(() => {
    if (!sm.isPyramidActive) return [];
    const seq = (sm.activeExercise as unknown as { pyramidSequence?: PyramidStep[] })?.pyramidSequence;
    if (!seq || seq.length === 0) return [];
    return seq.slice(sm.currentRound);
  }, [sm.isPyramidActive, sm.activeExercise, sm.currentRound]);

  // ── State-specific content ──────────────────────────────────────────────

  const renderStateContent = () => {
    // PREPARING — centered countdown (extracted to PreparingStateView, R-9)
    if (sm.workoutState === 'PREPARING') {
      // PR-B2: the gate replaces the countdown — show nothing for the ~150ms hand-off to ACTIVE.
      if (needsHold) return <div className="absolute inset-0 bg-black" />;
      return (
        <PreparingStateView
          count={sm.preparationCountdown}
          safeVideoUrl={safeVideoUrl}
          safeImageUrl={safeImageUrl}
          exerciseName={sm.exerciseName}
          fadeIn={sm.fadeIn}
          aiCue={workout.aiCue}
        />
      );
    }

    // INPUT — Big-Screen rep / time confirmation (extracted to InputStateView, R-10)
    if (sm.workoutState === 'INPUT') {
      const inputKey = `input-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}-${sm.currentRound}`;
      return (
        <InputStateView
          activeKey={inputKey}
          fadeIn={sm.fadeIn}
          safeVideoUrl={safeVideoUrl}
          exerciseId={sm.activeExercise?.id || `ex-${sm.currentExerciseIndex}`}
          exerciseName={sm.exerciseName}
          exerciseType={sm.exerciseType}
          isUnilateralForInput={isUnilateralForInput}
          inputRepsValue={inputRepsValue}
          inputRepsLeft={inputRepsLeft}
          inputRepsRight={inputRepsRight}
          onRepsChange={setInputRepsValue}
          onRepsLeftChange={setInputRepsLeft}
          onRepsRightChange={setInputRepsRight}
          pickerConfig={{
            targetValue: pickerTargetValue,
            unitType: pickerUnitType,
            max: pickerMax,
            initialValue: pickerInitialValue,
          }}
          onVideoProgress={sm.setVideoProgress}
          onSave={handleBigScreenInputSave}
        />
      );
    }

    // RESTING — circular timer + next-exercise preview + coach hint (extracted to RestingStateView, R-11)
    if (sm.workoutState === 'RESTING') {
      // Tabata: same shared RestScreen as every other exercise type now
      // (16.09.2026 rest-screen unification). Fed by the machine's rest clock
      // (restTimeLeft), which owns the countdown beeps + auto-advance — purely
      // presentational, no timer of its own here. No logDrawerNode — no
      // rep-logging mid-block. G2.4: onSkip IS passed now — sm.skipRest runs the
      // exact transition the rest timer runs at 0 (handleRestTimerDone →
      // moveToNext, incl. the unilateral side-rest branch), the interval was
      // already logged before RESTING, so skipping only moves that transition
      // earlier. No "+15" here: tabata keeps its fixed protocol rest.
      if (sm.blockProtocol?.id === 'tabata') {
        return (
          <RestScreen
            restTimeLeft={sm.restTimeLeft}
            formatTime={sm.formatTime}
            nextExercise={restPreviewExercise}
            fadeIn={sm.fadeIn}
            isPaused={sm.isPaused}
            videoKey={`tabata-next-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}`}
            onSkip={sm.skipRest}
            autoExpandPreview={guided}
          />
        );
      }
      return (
        <RestingStateView
          fadeIn={sm.fadeIn}
          restTimeLeft={sm.restTimeLeft}
          formatTime={sm.formatTime}
          nextExercise={restPreviewExercise}
          logDrawerNode={logDrawerContent}
          isLogDrawerOpen={sm.isLogDrawerOpen}
          isPaused={sm.isPaused}
          currentSegmentIndex={sm.currentSegmentIndex}
          currentExerciseIndex={sm.currentExerciseIndex}
          coachHint={coachHint}
          currentRound={sm.currentRound}
          totalRounds={sm.totalRounds}
          onSkipRest={sm.skipRest}
          onExtendRest={() => sm.extendRest()}
          autoExpandPreview={guided}
          onDismissHint={() => setCoachHint(null)}
          onSwap={handleSwap}
        />
      );
    }

    // ACTIVE — video + scrollable lyrics card (extracted to ActiveExerciseView, R-12)
    // Key includes currentRound so React fully remounts when straight sets advance.
    const activeKey = `active-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}-set-${sm.currentRound}`;
    // Block-scoped segment (tabata): the work clock replaces reps/CTA for
    // EVERY exercise in the block — the timer card is forced, auto-started,
    // and auto-completes at workSec (the machine then skips INPUT).
    const blockWorkSec = sm.blockProtocol?.id === 'tabata' ? sm.blockProtocol.config.workSec : null;
    const isTimeExercise = (sm.exerciseType === 'time' && !sm.isFollowAlongMode) || !!blockWorkSec;
    // Tabata prep: ONE get-ready before the block's very first interval only
    // (cycle 0, position 0, not the unilateral left side). Every later interval
    // gets 0 — the 10s rest is the get-ready — so the block stays exactly 240s.
    // PR-B2/B3: when a guided hold (find screen and/or demo gate) fronts that first interval,
    // the hold IS the get-ready → 0 (decided before the card mounts, so it never starts at 5).
    const gatedThisInterval = (!!demoGate || !!findEquipment) && (needsHold || gatePassedKey === activeKey);
    const timerPrepSeconds = timerLeadInSeconds(!!blockWorkSec, isFirstTabataInterval, gatedThisInterval);

    return (
      <ActiveExerciseView
        activeKey={activeKey}
        fadeIn={sm.fadeIn}
        isPaused={sm.isPaused}
        safeVideoUrl={safeVideoUrl}
        cachedNextVideoUrl={safeNextVideoUrl}
        exerciseFullTutorial={sm.exerciseFullTutorial}
        exerciseId={sm.activeExercise?.id || `ex-${sm.currentExerciseIndex}`}
        exerciseName={sm.exerciseName}
        exerciseType={sm.exerciseType}
        isFollowAlong={sm.activeExercise?.isFollowAlong === true}
        isTimeExercise={isTimeExercise}
        exerciseDuration={sm.exerciseDuration}
        blockWorkSec={blockWorkSec}
        timerPrepSeconds={timerPrepSeconds}
        machineTabataLabel={sm.machineTabataLabel}
        currentSide={sm.currentSide}
        repsOrDurationText={sm.repsOrDurationText}
        targetValue={pickerTargetValue}
        isUnilateral={isUnilateral}
        isPyramidActive={sm.isPyramidActive}
        currentRound={sm.currentRound}
        totalRounds={sm.totalRounds}
        upcomingPyramidSteps={upcomingPyramidSteps}
        isSupersetActive={sm.isSupersetActive}
        supersetPartnerName={sm.supersetPartnerName}
        autoCompleteTime={sm.autoCompleteTime}
        executionSteps={sm.executionSteps}
        muscleGroups={sm.muscleGroups}
        exerciseGoal={sm.exerciseGoal}
        equipment={sm.activeExercise?.equipment}
        workoutLocation={workout.workoutLocation}
        scrollRef={scrollRef}
        onComplete={sm.handleExerciseComplete}
        onSwap={handleSwap}
        onSetVideoProgress={sm.setVideoProgress}
        // PR-B2: the demo keeps looping behind the gate while the player is held paused, and the
        // gate needs the <video> element to unmute it inside the tap. A timed (non-tabata) card
        // starts on its own after "צפיתי, התחל" — that tap was the start.
        videoPaused={gateActive ? false : sm.isPaused}
        onVideoElement={(el) => { gateVideoElRef.current = el; }}
        autoStartTimer={!blockWorkSec && isTimeExercise && gatePassedKey === activeKey}
        // PR-B1 guided only: one short line under the exercise. Timed (incl. tabata) → neutral
        // "ממשיכים עד שהטיימר נגמר"; reps → gendered "עשה/י X חזרות…". Follow-along: none.
        guidanceLine={
          !guided || sm.exerciseType === 'follow-along'
            ? undefined
            : isTimeExercise
              ? guidanceLine('time', userGender)
              : guidanceLine('reps', userGender, pickerTargetValue > 0 ? pickerTargetValue : undefined)
        }
      />
    );
  };

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div
      className="relative w-full h-full bg-slate-100 dark:bg-slate-950 overflow-hidden"
      style={{ overscrollBehavior: 'none' }}
    >
      {/* ─── BASE LAYER: Workout Playlist ─────────────────────────────── */}
      <div className="absolute inset-0 z-0 bg-white dark:bg-slate-900 flex flex-col">
        <WorkoutPlaylist
          workout={workout}
          currentSegmentIndex={sm.currentSegmentIndex}
          currentExerciseIndex={sm.currentExerciseIndex}
          currentSetIndex={sm.currentRound - 1}
          workoutState={sm.workoutState}
          isPaused={sm.isPaused}
          restTimeLeft={sm.restTimeLeft}
          formatTime={sm.formatTime}
          exerciseLog={sm.exerciseLogSnapshot}
          handleRepetitionSave={sm.handleRepetitionSave}
          onSkipRest={sm.skipRest}
        />
      </div>

      {/* ─── TOP LAYER: Active Workout ───────────────────────────────────── */}
      <motion.div
        className={`absolute inset-0 z-10 bg-black shadow-2xl overflow-hidden ${
          isMinimized ? 'rounded-t-2xl' : ''
        }`}
        animate={{ y: isMinimized ? minimizedY : 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: minimizedY }}
        dragElastic={0.12}
        onDragEnd={handleDragEnd}
      >
        {isMinimized ? (
          <MiniPlayerBar
            exerciseName={sm.exerciseName}
            elapsedTimeLabel={sm.formatTime(sm.elapsedTime)}
            safeVideoUrl={safeVideoUrl}
            isPaused={sm.isPaused}
            dragControls={dragControls}
            onExpand={() => setIsMinimized(false)}
            onTogglePause={sm.togglePause}
          />
        ) : (
          <div className="relative w-full h-full overflow-hidden">
            {/* State content */}
            {renderStateContent()}

            {/* PR-B3 guided find-the-equipment — before the demo gate, player held paused. */}
            {findActive && findScreen && (
              <FindEquipmentOverlay
                screen={findScreen}
                gender={userGender}
                onFound={handleEquipmentFound}
                onSwap={onSwapExercise
                  ? (item) => onSwapExercise(item.exerciseId, sm.currentSegmentIndex, item.exIdx)
                  : undefined}
              />
            )}

            {/* PR-B2 guided demo gate — over the live ACTIVE view, player held paused. */}
            {gateActive && (
              <DemoGateOverlay
                exerciseName={sm.exerciseName}
                cue={sm.executionSteps?.[0] ?? null}
                ctaLabel={g(userGender, 'צפיתי, התחל', 'צפיתי, התחילי')}
                onStart={handleGateStart}
              />
            )}

            {/* Header overlay — also the drag handle for minimize */}
            {showHeader && !gateActive && !findActive && (
              <RunnerHeader
                progressBars={sm.progressBars}
                autoCompleteTime={sm.autoCompleteTime}
                isPaused={sm.isPaused}
                isLogDrawerOpen={sm.isLogDrawerOpen}
                isResting={isResting}
                elapsedTime={sm.elapsedTime}
                formatTime={sm.formatTime}
                totalRounds={sm.totalRounds}
                currentRound={sm.currentRound}
                tabataInterval={sm.tabataInterval}
                isMachineTabata={!!sm.machineTabataLabel}
                isWarmupSegment={isWarmupSegment}
                isCooldownSegment={isCooldownSegment}
                currentExLoggedReps={currentExLoggedReps}
                firstIncompleteSetIdx={firstIncompleteSetIdx}
                restPreviewExercise={restPreviewExercise}
                workoutLocation={workout.workoutLocation}
                isNextPartnerExercise={sm.isNextPartnerExercise}
                supersetPartnerName={sm.supersetPartnerName}
                onPointerDown={handleHeaderPointerDown}
                onMinimize={() => setIsMinimized(true)}
                hideMinimize={embedded}
                onTogglePause={sm.togglePause}
              />
            )}
          </div>
        )}
      </motion.div>

      {/* ─── UNIFIED PAUSE OVERLAY (extracted Step R-7) ─────────────────── */}
      {/* Sits above ALL states (ACTIVE / INPUT / RESTING).  Visibility owned
          by the orchestrator since it depends on three cross-state flags. */}
      <AnimatePresence>
        {sm.isPaused && !showExitConfirmModal && sm.workoutState !== 'PREPARING' && !needsHold && (
          <PauseOverlay
            onResume={sm.togglePause}
            onOpenExitModal={() => setShowExitConfirmModal(true)}
            // Inside a hybrid station (embedded) this ends only the STATION (→ the station-complete
            // screen), not the workout. Copy only; the action is unchanged.
            endLabel={embedded ? g(userGender, 'סיים את התחנה', 'סיימי את התחנה') : undefined}
          />
        )}
      </AnimatePresence>

      {/* ─── EARLY EXIT CONFIRMATION MODAL (extracted Step R-7) ─────────── */}
      {/* Self-contained AnimatePresence — drives its own enter/exit on isOpen. */}
      <ExitConfirmModal
        isOpen={showExitConfirmModal}
        onDismiss={() => {
          setShowExitConfirmModal(false);
          if (sm.isPaused) sm.togglePause();
        }}
        onExit={handleEarlyExit}
      />

    </div>
  );
}
