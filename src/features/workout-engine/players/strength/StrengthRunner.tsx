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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import WorkoutPlaylist from './playlist/WorkoutPlaylist';

import {
  useWorkoutStateMachine,
  ExerciseResultLog,
  NextExerciseInfo,
} from './hooks/useWorkoutStateMachine';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { usePlayerMedia } from './hooks/usePlayerMedia';
import { usePlayerDrag } from './hooks/usePlayerDrag';
import { useInputPickerState } from './hooks/useInputPickerState';
import { usePlayerLifecycle } from './hooks/usePlayerLifecycle';
import { usePlayerMediaSession } from './hooks/usePlayerMediaSession';

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
}

export default function StrengthRunner({
  workout,
  onComplete,
  onPause,
  onResume,
  onSwapExercise,
  exerciseHistoryMap,
  embedded = false,
}: StrengthRunnerProps) {
  const sm = useWorkoutStateMachine(workout, onComplete, onPause, onResume, undefined, exerciseHistoryMap);

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
  // the snapshot so RestWithPreview switches to the next exercise.
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
        if (exId) onSwapExercise(exId, sm.currentSegmentIndex, sm.currentExerciseIndex);
      }
    : undefined;

  // ── Log Drawer content (extracted to LogDrawerContent, Step R-5) ─────────
  // Slot rendered inside RestWithPreview as the `logDrawerNode`.  All picker
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
      // Tabata: clean big-number rest countdown (shared overlay), unified with
      // the work surface. Fed by the machine's rest clock (restTimeLeft), which
      // owns the 3/2/1 beeps + auto-advance. Blurred next-exercise video behind.
      if (sm.blockProtocol?.id === 'tabata') {
        return (
          <PreparingStateView
            count={sm.restTimeLeft}
            variant="rest"
            label="מנוחה"
            safeVideoUrl={safeNextVideoUrl}
            safeImageUrl={null}
            exerciseName={restPreviewExercise.name}
            fadeIn={sm.fadeIn}
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
    const TABATA_LEAD_IN_SECONDS = 5;
    const isFirstTabataInterval =
      !!blockWorkSec && sm.currentRound === 1 && sm.currentExerciseIndex === 0 && sm.currentSide !== 'left';
    const timerPrepSeconds = blockWorkSec
      ? (isFirstTabataInterval ? TABATA_LEAD_IN_SECONDS : 0)
      : undefined;

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

            {/* Header overlay — also the drag handle for minimize */}
            {showHeader && (
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
                isWarmupSegment={isWarmupSegment}
                isCooldownSegment={isCooldownSegment}
                currentExLoggedReps={currentExLoggedReps}
                firstIncompleteSetIdx={firstIncompleteSetIdx}
                restPreviewExercise={restPreviewExercise}
                workoutLocation={workout.workoutLocation}
                isSupersetActive={sm.isSupersetActive}
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
        {sm.isPaused && !showExitConfirmModal && sm.workoutState !== 'PREPARING' && (
          <PauseOverlay
            onResume={sm.togglePause}
            onOpenExitModal={() => setShowExitConfirmModal(true)}
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
