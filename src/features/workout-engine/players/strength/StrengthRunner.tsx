'use client';

/**
 * StrengthRunner — Phase 3 Spotify-Style Layered Architecture
 *
 * Architecture:
 *   Base Layer  — Workout Playlist (placeholder for now)
 *   Top Layer   — Active workout, draggable to a mini-player
 *
 * Drag mechanics (framer-motion):
 *   - Header area is the drag handle (touch-action: none)
 *   - Drag down from header → snaps to mini-player (based on offset/velocity)
 *   - Drag up from mini-player → expands back to full screen
 *
 * Internal scroll ("Lyrics" view):
 *   - ACTIVE: scrolling down reveals execution steps, muscle groups, goal, swap
 *   - RESTING: handled by RestWithPreview (scrollable next-exercise details)
 *   - Scrolling does NOT trigger minimize — only the header drag does
 *
 * State machine: PREPARING → ACTIVE → RESTING (with isLogDrawerOpen overlay)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pause, Play, List, Dumbbell, Replace, ChevronUp, Bell, Square,
} from 'lucide-react';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import type { WorkoutPlan } from '@/features/parks';

import HorizontalPicker from './components/HorizontalPicker';
import WorkoutStoryBars from './components/WorkoutStoryBars';
import ExerciseVideoPlayer from './components/ExerciseVideoPlayer';
import FillingButton from './components/FillingButton';
import RestWithPreview from './components/RestWithPreview';
import WorkoutPlaylist from './playlist/WorkoutPlaylist';

import {
  useWorkoutStateMachine,
  ExerciseResultLog,
} from './hooks/useWorkoutStateMachine';
import { useWorkoutPersistence } from './hooks/useWorkoutPersistence';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';
import { useMediaSession } from './hooks/useMediaSession';
import { resolveEquipmentLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import ExerciseDetailContent from './components/ExerciseDetailContent';

export type { ExerciseResultLog };

const MINI_PLAYER_H = 72;

interface StrengthRunnerProps {
  workout: WorkoutPlan;
  onComplete?: (exerciseLog?: ExerciseResultLog[]) => void;
  onPause?: () => void;
  onResume?: () => void;
  onSwapExercise?: (exerciseId: string, segmentIndex: number, exerciseIndex: number) => void;
}

export default function StrengthRunner({
  workout,
  onComplete,
  onPause,
  onResume,
  onSwapExercise,
}: StrengthRunnerProps) {
  const sm = useWorkoutStateMachine(workout, onComplete, onPause, onResume);

  useWorkoutPersistence({
    workoutId: workout.id,
    segmentIndex: sm.currentSegmentIndex,
    exerciseIndex: sm.currentExerciseIndex,
    elapsedTime: sm.elapsedTime,
    exerciseLog: sm.getExerciseLog(),
    enabled: sm.workoutState !== 'PREPARING',
    onBackground: sm.togglePause,
    onForeground: sm.togglePause,
  });

  // ── Phase 4: Native Device Capabilities ──────────────────────────────────

  const isWorkoutActive =
    sm.workoutState === 'ACTIVE' || sm.workoutState === 'RESTING';

  useScreenWakeLock(isWorkoutActive && !sm.isPaused);

  const mediaSessionNextTrack = useCallback(() => {
    if (sm.workoutState === 'RESTING') {
      sm.skipRest();
    } else {
      sm.handleExerciseComplete();
    }
  }, [sm.workoutState, sm.skipRest, sm.handleExerciseComplete]);

  useMediaSession({
    workoutState: sm.workoutState,
    exerciseName: sm.exerciseName,
    nextExerciseName: sm.nextExercise.name,
    workoutName: workout.name,
    exerciseImageUrl: sm.activeExercise?.imageUrl || sm.nextExercise.imageUrl,
    isPaused: sm.isPaused,
    onNextTrack: mediaSessionNextTrack,
    onTogglePause: sm.togglePause,
  });

  // ── Spotify layer state ──────────────────────────────────────────────────
  const [isMinimized, setIsMinimized] = useState(false);
  const [winH, setWinH] = useState(typeof window !== 'undefined' ? window.innerHeight : 812);
  const dragControls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);

  const minimizedY = winH - MINI_PLAYER_H;

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Force expand during PREPARING
  useEffect(() => {
    if (sm.workoutState === 'PREPARING') setIsMinimized(false);
  }, [sm.workoutState]);

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const { offset, velocity } = info;
      if (isMinimized) {
        if (offset.y < -50 || velocity.y < -500) setIsMinimized(false);
      } else {
        if (offset.y > 100 || velocity.y > 500) setIsMinimized(true);
      }
    },
    [isMinimized],
  );

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragControls.start(e);
    },
    [dragControls],
  );

  // ── Picker config ────────────────────────────────────────────────────────

  const isTimeExercise = sm.activeExercise?.exerciseType === 'time';
  const pickerTargetValue = isTimeExercise ? sm.exerciseDuration : (sm.targetReps || 12);
  const pickerUnitType: 'reps' | 'time' = isTimeExercise ? 'time' : 'reps';
  const pickerMax = isTimeExercise ? 120 : (sm.targetReps ? sm.targetReps * 2 : 50);
  const pickerInitialValue = sm.lastSavedReps ?? pickerTargetValue;

  const showHeader = sm.workoutState !== 'PREPARING';
  const isResting = sm.workoutState === 'RESTING';
  const isUnilateral = sm.activeExercise?.symmetry === 'unilateral';

  // ── Unilateral per-side state ─────────────────────────────────────────
  const [repsRight, setRepsRight] = useState(pickerInitialValue);
  const [repsLeft, setRepsLeft] = useState(pickerInitialValue);

  // Reset per-side values when exercise changes
  useEffect(() => {
    setRepsRight(pickerInitialValue);
    setRepsLeft(pickerInitialValue);
  }, [sm.activeExercise?.id, pickerInitialValue]);

  const handleUnilateralSave = useCallback(() => {
    const effective = Math.min(repsRight, repsLeft);
    sm.handleRepetitionSave(effective, { left: repsLeft, right: repsRight });
  }, [repsRight, repsLeft, sm.handleRepetitionSave]);

  // ── Log Drawer content (slot into RestWithPreview) ───────────────────────

  const logDrawerContent = (
    <div
      className="bg-white dark:bg-[#0F172A] rounded-t-[24px] px-4 pt-3 pb-5 shadow-2xl max-h-[25vh]"
      dir="rtl"
    >
      <h2
        className="text-base font-bold text-slate-900 dark:text-white text-center mb-0.5"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {pickerUnitType === 'time' ? 'כמה שניות החזקת?' : isUnilateral ? 'כמה חזרות לכל צד?' : 'כמה חזרות עשית?'}
      </h2>
      <p
        className="text-[11px] text-slate-500 dark:text-zinc-400 text-center mb-1"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        יעד: {pickerTargetValue} {pickerUnitType === 'reps' ? 'חזרות' : 'שניות'}{isUnilateral ? ' (לכל צד)' : ''}
      </p>

      {isUnilateral && pickerUnitType === 'reps' ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs text-center text-slate-500 dark:text-zinc-400 mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>ימין</p>
            <HorizontalPicker
              min={1}
              max={pickerMax}
              targetValue={pickerTargetValue}
              value={repsRight}
              onChange={setRepsRight}
              unitType="reps"
            />
          </div>
          <div className="flex-1">
            <p className="text-xs text-center text-slate-500 dark:text-zinc-400 mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>שמאל</p>
            <HorizontalPicker
              min={1}
              max={pickerMax}
              targetValue={pickerTargetValue}
              value={repsLeft}
              onChange={setRepsLeft}
              unitType="reps"
            />
          </div>
        </div>
      ) : (
        <HorizontalPicker
          min={pickerUnitType === 'time' ? 0 : 1}
          max={pickerMax}
          targetValue={pickerTargetValue}
          value={sm.completedReps ?? pickerInitialValue}
          onChange={sm.setCompletedReps}
          unitType={pickerUnitType}
        />
      )}

      <button
        onClick={isUnilateral && pickerUnitType === 'reps'
          ? handleUnilateralSave
          : () => sm.handleRepetitionSave(sm.completedReps ?? pickerInitialValue)
        }
        className="w-full mt-2 h-10 bg-[#00B4FF] hover:bg-[#00A0E0] text-white rounded-lg font-bold text-sm shadow-lg active:scale-[0.98] transition-all"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        שמירה והמשך
      </button>
    </div>
  );

  // ── Swap handler ─────────────────────────────────────────────────────────

  const handleSwap = onSwapExercise
    ? () => {
        const exId = sm.activeExercise?.id || '';
        if (exId) onSwapExercise(exId, sm.currentSegmentIndex, sm.currentExerciseIndex);
      }
    : undefined;

  // ── Phase 4.6: Pause Overlay & Early Exit ───────────────────────────────

  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  const handleEarlyExit = useCallback(() => {
    setShowExitConfirmModal(false);
    onComplete?.(sm.getExerciseLog());
  }, [sm.getExerciseLog, onComplete]);

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  // ── Mini-player bar (visible when minimized) ─────────────────────────────

  const renderMiniPlayer = () => (
    <div
      className="flex items-center h-[72px] px-4 gap-3 cursor-pointer"
      onClick={() => setIsMinimized(false)}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        dragControls.start(e);
      }}
      style={{ touchAction: 'none' }}
    >
      <div className="w-11 h-11 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
        {sm.exerciseVideoUrl ? (
          <video src={sm.exerciseVideoUrl} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Dumbbell size={18} className="text-slate-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0" dir="rtl">
        <p className="text-white font-bold text-sm truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
          {sm.exerciseName}
        </p>
        <p className="text-white/50 text-xs tabular-nums" style={{ fontFamily: 'var(--font-simpler)' }}>
          {sm.formatTime(sm.elapsedTime)}
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); sm.togglePause(); }}
        className="w-10 h-10 flex items-center justify-center"
      >
        {sm.isPaused ? (
          <Play size={20} className="text-white" fill="white" />
        ) : (
          <Pause size={20} className="text-white" />
        )}
      </button>

      <ChevronUp size={18} className="text-white/40" />
    </div>
  );

  // ── Header overlay (gradient + 3 rows) ──────────────────────────────────

  const renderHeader = () => (
    <div
      className={`absolute top-0 left-0 right-0 z-[45] transition-all duration-300 ${
        isResting ? 'pb-6' : 'pb-4'
      }`}
      style={{
        background:
          'linear-gradient(to bottom, white 0%, rgba(255,255,255,0.95) 40%, rgba(255,255,255,0.7) 65%, rgba(255,255,255,0) 100%)',
        touchAction: 'none',
      }}
      onPointerDown={handleHeaderPointerDown}
    >
      <div className="pt-12 px-4">
        {/* Row 1: Story Bars */}
        <div className="mb-3">
          <WorkoutStoryBars
            progressBars={sm.progressBars}
            activeBarDuration={sm.autoCompleteTime}
            isPaused={sm.isPaused}
            isResting={isResting}
          />
        </div>

        {/* Row 2: Pause | Timer | List */}
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={sm.togglePause}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/10 backdrop-blur-sm"
          >
            {sm.isPaused ? (
              <Play size={18} className="text-slate-800" fill="currentColor" />
            ) : (
              <Pause size={18} className="text-slate-800" />
            )}
          </button>

          <div
            className="text-slate-900 font-bold text-xl tracking-wider tabular-nums"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {sm.isPaused ? 'הפסקה' : sm.formatTime(sm.elapsedTime)}
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/10 backdrop-blur-sm"
          >
            <List size={18} className="text-slate-800" />
          </button>
        </div>

        {/* Row 3: Contextual info */}
        {isResting ? (
          <div className="text-center" dir="rtl">
            <p
              className="text-xs text-slate-500 uppercase tracking-wider mb-0.5"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              התרגיל הבא
            </p>
            <h2
              className="text-xl font-bold text-slate-900 mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {sm.nextExercise.name}
            </h2>
            {sm.nextExercise.equipment.length > 0 && (
              <div className="flex justify-center mb-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#00B4FF]/10 border border-[#00B4FF]/30 rounded-full">
                  <Dumbbell size={14} className="text-[#00B4FF]" />
                  <span
                    className="text-xs text-[#00B4FF] font-bold"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {resolveEquipmentLabel(sm.nextExercise.equipment[0])}
                  </span>
                </div>
              </div>
            )}
            {sm.nextExercise.reps && (
              <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                {sm.nextExercise.reps}
              </p>
            )}
            {sm.totalRounds > 1 && (
              <p className="text-[11px] text-[#00B4FF] font-bold mt-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                סט {sm.currentRound} מתוך {sm.totalRounds}
              </p>
            )}
            {sm.nextExercise.notificationText && (
              <div className="flex justify-center mt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full max-w-[90%]">
                  <Bell size={12} className="text-amber-500 flex-shrink-0" />
                  <span className="text-[11px] text-amber-700 font-medium leading-tight" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {sm.nextExercise.notificationText}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  // ── State-specific content ──────────────────────────────────────────────

  const renderStateContent = () => {
    // PREPARING — centered countdown
    if (sm.workoutState === 'PREPARING') {
      return (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 ${
            sm.fadeIn ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {(sm.exerciseVideoUrl || sm.activeExercise?.imageUrl) && (
            <div className="absolute inset-0">
              {sm.activeExercise?.imageUrl ? (
                <img src={sm.activeExercise.imageUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-30" />
              ) : sm.exerciseVideoUrl ? (
                <video src={sm.exerciseVideoUrl} className="w-full h-full object-cover blur-2xl scale-110 opacity-30" autoPlay loop muted playsInline />
              ) : null}
              <div className="absolute inset-0 bg-black/50" />
            </div>
          )}
          <div className="relative z-10 text-center">
            <div className="text-8xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
              {sm.preparationCountdown}
            </div>
            <p className="text-xl text-white/80" style={{ fontFamily: 'var(--font-simpler)' }}>מתכוננים...</p>
            <p className="text-lg text-white/60 mt-4" style={{ fontFamily: 'var(--font-simpler)' }}>{sm.exerciseName}</p>
            {workout.aiCue && (
              <p className="text-sm text-white/50 mt-3 max-w-[260px] mx-auto" style={{ fontFamily: 'var(--font-simpler)' }}>
                💡 {workout.aiCue}
              </p>
            )}
          </div>
        </div>
      );
    }

    // RESTING — RestWithPreview (scrollable with next-exercise lyrics)
    if (sm.workoutState === 'RESTING') {
      return (
        <div className={`absolute inset-0 transition-opacity duration-300 ${sm.fadeIn ? 'opacity-100' : 'opacity-0'}`}>
          <RestWithPreview
            restTimeLeft={sm.restTimeLeft}
            formatTime={sm.formatTime}
            nextExercise={sm.nextExercise}
            logDrawerNode={logDrawerContent}
            isLogDrawerOpen={sm.isLogDrawerOpen}
            onSkip={sm.skipRest}
            isPaused={sm.isPaused}
            videoKey={`${sm.currentSegmentIndex}-${sm.currentExerciseIndex}`}
          />
        </div>
      );
    }

    // ACTIVE — video + scrollable lyrics card
    // Key includes currentRound so React fully remounts when straight sets advance
    const activeKey = `active-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}-set-${sm.currentRound}`;
    return (
      <div key={activeKey} className={`absolute inset-0 transition-opacity duration-300 ${sm.fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        {/* Video background layer */}
        <ExerciseVideoPlayer
          key={`player-${activeKey}`}
          exerciseId={sm.activeExercise?.id || `ex-${sm.currentExerciseIndex}`}
          videoUrl={sm.exerciseVideoUrl}
          exerciseName={sm.exerciseName}
          exerciseType={sm.exerciseType}
          isPaused={sm.isPaused}
          hasAudio={false}
          onVideoProgress={sm.setVideoProgress}
          onVideoEnded={sm.handleExerciseComplete}
        />

        {/* Pre-fetch next exercise video */}
        {sm.nextExercise.videoUrl && (
          <video src={sm.nextExercise.videoUrl} preload="auto" className="hidden" muted playsInline />
        )}

        {/* Scrollable overlay — spacer lets video show, then the white card peeks up */}
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain z-10"
        >
          {/* Spacer — exercise name + reps + CTA peek above viewport bottom */}
          <div className="pointer-events-none" style={{ height: 'calc(100vh - 200px)' }} />

          {/* Card — collapsed by default; user scrolls to reveal lyrics */}
          <div
            className="relative bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-3 pb-32"
            dir="rtl"
          >
            {/* Scroll hint — drag handle */}
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Reps (prominent) + exercise name (secondary) + set badge */}
            <div className="flex items-center justify-center gap-2 mb-1">
              {sm.repsOrDurationText && (
                <p className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
                  {sm.repsOrDurationText}
                </p>
              )}
              {sm.totalRounds > 1 && (
                <span className="text-[11px] text-white bg-[#00B4FF] px-2 py-0.5 rounded-full font-bold" style={{ fontFamily: 'var(--font-simpler)' }}>
                  סט {sm.currentRound}/{sm.totalRounds}
                </span>
              )}
            </div>
            <p
              className="text-base text-slate-500 dark:text-slate-400 text-center mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {sm.exerciseName}
            </p>

            {/* AI Cue — contextual coaching tip */}
            {workout.aiCue && (
              <p
                className="text-xs text-center text-[#00C9F2] bg-[#00C9F2]/8 rounded-lg px-3 py-1.5 mb-4 mx-auto max-w-[280px]"
                style={{ fontFamily: 'var(--font-simpler)' }}
                dir="rtl"
              >
                💡 {workout.aiCue}
              </p>
            )}

            {/* FillingButton — primary CTA */}
            <div className="mb-6">
              <FillingButton
                key={`fill-${activeKey}`}
                autoCompleteTime={sm.autoCompleteTime}
                onClick={sm.handleExerciseComplete}
                label="סיימתי"
                isPaused={sm.isPaused}
              />
            </div>

            {/* ── Below the fold — unified ExerciseDetailContent ────────── */}
            <div className="-mx-5">
              <ExerciseDetailContent
                exerciseName={sm.exerciseName}
                videoUrl={null}
                hideHeroVideo
                hideTitle
                primaryMuscle={sm.muscleGroups.primary[0] || null}
                secondaryMuscles={sm.muscleGroups.secondary.length > 0 ? sm.muscleGroups.secondary : undefined}
                cues={sm.executionSteps.length > 0 ? sm.executionSteps : undefined}
                goal={sm.exerciseGoal}
                equipment={sm.activeExercise?.equipment}
              />
            </div>

            {/* Swap Button — always at the very bottom */}
            {handleSwap && (
              <div className="mt-2 mb-4">
                <button
                  onClick={handleSwap}
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98]"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  <Replace size={20} />
                  החלפת תרגיל
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div className="relative w-full h-screen bg-slate-100 dark:bg-slate-950">
      {/* ─── BASE LAYER: Workout Playlist ─────────────────────────────── */}
      <div className="absolute inset-0 bg-white dark:bg-slate-900">
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
        />
      </div>

      {/* ─── TOP LAYER: Active Workout ───────────────────────────────────── */}
      <motion.div
        className={`absolute inset-0 bg-black shadow-2xl overflow-hidden ${
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
          renderMiniPlayer()
        ) : (
          <div className="relative w-full h-screen overflow-hidden">
            {/* State content */}
            {renderStateContent()}

            {/* Header overlay — also the drag handle for minimize */}
            {showHeader && renderHeader()}
          </div>
        )}
      </motion.div>

      {/* ─── UNIFIED PAUSE OVERLAY ────────────────────────────────────── */}
      {/* Sits at the end of the JSX to cover ALL states (ACTIVE, RESTING, REPS_INPUT) */}
      <AnimatePresence>
        {sm.isPaused && !showExitConfirmModal && sm.workoutState !== 'PREPARING' && (
          <motion.div
            key="pause-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            dir="rtl"
          >
            <h1
              className="text-4xl font-black text-white mb-12"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              הפסקה
            </h1>

            <div className="w-full max-w-xs space-y-3 px-6">
              <button
                onClick={sm.togglePause}
                className="w-full h-16 bg-[#F97316] rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/30"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <Play size={22} fill="white" />
                התחילו שוב
              </button>
              <button
                onClick={() => setShowExitConfirmModal(true)}
                className="w-full h-16 bg-white rounded-2xl font-bold text-slate-800 text-lg active:scale-[0.98] transition-transform shadow-lg"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                סיום אימון
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── EARLY EXIT CONFIRMATION MODAL ──────────────────────────────── */}
      <AnimatePresence>
        {showExitConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-6"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowExitConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
                <Square size={22} className="text-orange-400" fill="currentColor" />
              </div>

              <h2
                className="text-xl font-black text-slate-900 dark:text-white mb-2"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                בטוחים שאתם רוצים לסיים את האימון?
              </h2>
              <p
                className="text-sm text-slate-500 dark:text-slate-400 mb-7"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                כבר עוצרים? השרירים רק התחילו להתחמם!
              </p>

              <button
                onClick={() => {
                  setShowExitConfirmModal(false);
                  if (sm.isPaused) sm.togglePause();
                }}
                className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                יאללה להמשיך
              </button>

              <button
                onClick={handleEarlyExit}
                className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                אני רוצה לסיים את האימון באמצע
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
