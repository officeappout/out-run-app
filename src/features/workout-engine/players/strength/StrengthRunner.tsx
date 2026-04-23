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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Pause, Play, Dumbbell, ChevronUp, Square, Check, PersonStanding,
} from 'lucide-react';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import type { WorkoutPlan } from '@/features/parks';

import HorizontalPicker from './components/HorizontalPicker';
import WorkoutStoryBars from './components/WorkoutStoryBars';
import ExerciseVideoPlayer from './components/ExerciseVideoPlayer';
import FillingButton from './components/FillingButton';
import IsometricTimerCard from './components/IsometricTimerCard';
import RestWithPreview from './components/RestWithPreview';
import WorkoutPlaylist from './playlist/WorkoutPlaylist';

import {
  useWorkoutStateMachine,
  ExerciseResultLog,
  NextExerciseInfo,
} from './hooks/useWorkoutStateMachine';
import { useWorkoutPersistence } from './hooks/useWorkoutPersistence';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';
import { useMediaSession } from './hooks/useMediaSession';
import { resolveEquipmentLabel, resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import ExerciseDetailContent from './components/ExerciseDetailContent';
import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const OFFLINE_PLACEHOLDER = '/images/park-placeholder.svg';

export type { ExerciseResultLog };

const MINI_PLAYER_H = 72;

interface StrengthRunnerProps {
  workout: WorkoutPlan;
  onComplete?: (exerciseLog?: ExerciseResultLog[]) => void;
  onPause?: () => void;
  onResume?: () => void;
  onSwapExercise?: (exerciseId: string, segmentIndex: number, exerciseIndex: number) => void;
  /** Pre-fetched map of exerciseId → last-session confirmed reps, for smart target selection */
  exerciseHistoryMap?: Record<string, number[]>;
}

export default function StrengthRunner({
  workout,
  onComplete,
  onPause,
  onResume,
  onSwapExercise,
  exerciseHistoryMap,
}: StrengthRunnerProps) {
  const sm = useWorkoutStateMachine(workout, onComplete, onPause, onResume, undefined, exerciseHistoryMap);

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

  // ── Offline-cached media URLs (must be before any usage) ────────────────
  const isOnline = useOnlineStatus();
  const cachedVideoUrl = useCachedMediaUrl(sm.exerciseVideoUrl);
  const cachedImageUrl = useCachedMediaUrl(sm.activeExercise?.imageUrl);
  const cachedNextVideoUrl = useCachedMediaUrl(sm.nextExercise.videoUrl);

  // When offline, only use blob: URLs or a local placeholder — never hit the network
  const safeVideoUrl = cachedVideoUrl?.startsWith('blob:') ? cachedVideoUrl
    : isOnline ? cachedVideoUrl : null;
  const safeImageUrl = cachedImageUrl?.startsWith('blob:') ? cachedImageUrl
    : isOnline ? cachedImageUrl : OFFLINE_PLACEHOLDER;
  const safeNextVideoUrl = cachedNextVideoUrl?.startsWith('blob:') ? cachedNextVideoUrl
    : isOnline ? cachedNextVideoUrl : null;

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
    exerciseImageUrl: safeImageUrl || sm.nextExercise.imageUrl,
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
  // Use dynamicTarget (history-aware) as the picker's goal marker; fall back to targetReps
  const pickerTargetValue = Math.max(
    isTimeExercise
      ? (sm.exerciseDuration > 0 ? sm.exerciseDuration : 30)
      : (sm.dynamicTarget ?? sm.targetReps ?? 12),
    1,
  );
  const pickerUnitType: 'reps' | 'time' = isTimeExercise ? 'time' : 'reps';
  const pickerMax = isTimeExercise ? 120 : (sm.repsRangeMax ?? (sm.targetReps ? sm.targetReps * 2 : 50));
  const pickerInitialValue = sm.lastSavedReps ?? pickerTargetValue;

  // ── Drawer stability gate: don't render picker until drawer animation settles ──
  const [isDrawerStable, setIsDrawerStable] = useState(false);
  const drawerOpenTimeRef = useRef(0);

  useEffect(() => {
    if (sm.isLogDrawerOpen) {
      drawerOpenTimeRef.current = Date.now();
      setIsDrawerStable(false);
      const timer = setTimeout(() => setIsDrawerStable(true), 280);
      return () => clearTimeout(timer);
    }
    setIsDrawerStable(false);
  }, [sm.isLogDrawerOpen]);

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

  // ── Locked value snapshot: prevent picker initialization from overwriting timer result ──
  const lockedAchievedRef = useRef<number | null>(null);

  useEffect(() => {
    if (sm.isLogDrawerOpen && sm.completedReps != null && sm.completedReps > 0) {
      if (lockedAchievedRef.current === null) {
        lockedAchievedRef.current = sm.completedReps;
      }
    }
    if (!sm.isLogDrawerOpen) {
      lockedAchievedRef.current = null;
    }
  }, [sm.isLogDrawerOpen, sm.completedReps]);

  const handlePickerChange = useCallback((newVal: number) => {
    console.log(`[Runner Link] Received from picker: ${newVal} at ${Date.now() - drawerOpenTimeRef.current}ms since drawer open`);
    if (newVal <= 0) return;
    sm.setCompletedReps(newVal);
  }, [sm.setCompletedReps]);

  // ── Coach Hint (Live Failure / Overachieve Detection) ────────────────────

  const [coachHint, setCoachHint] = useState<'fail' | 'overachieve' | null>(null);

  // Clear hint when exercise changes
  useEffect(() => {
    setCoachHint(null);
  }, [sm.activeExercise?.id]);

  const showHeader = sm.workoutState !== 'PREPARING';
  const isResting = sm.workoutState === 'RESTING';
  const isUnilateral = sm.activeExercise?.symmetry === 'unilateral';

  const segTitle = sm.currentSegment?.title || '';
  const isWarmupSegment = segTitle.includes('חימום') || segTitle.toLowerCase().includes('warmup')
    || sm.activeExercise?.exerciseRole === 'warmup';
  const isCooldownSegment = segTitle.includes('שחרור') || segTitle.includes('קירור')
    || segTitle.toLowerCase().includes('cooldown')
    || sm.activeExercise?.exerciseRole === 'cooldown';

  // ── Unilateral per-side state ─────────────────────────────────────────
  const [repsRight, setRepsRight] = useState(pickerInitialValue);
  const [repsLeft, setRepsLeft] = useState(pickerInitialValue);

  // Reset per-side values when exercise or set changes;
  // for unilateral timed, use the recorded side data from the state machine
  useEffect(() => {
    if (sm.pendingSideData) {
      setRepsRight(sm.pendingSideData.right);
      setRepsLeft(sm.pendingSideData.left);
    } else {
      setRepsRight(pickerInitialValue);
      setRepsLeft(pickerInitialValue);
    }
  }, [sm.activeExercise?.id, sm.currentRound, sm.pendingSideData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnilateralSave = useCallback(() => {
    const effective = Math.min(repsRight, repsLeft);
    sm.handleRepetitionSave(effective, { left: repsLeft, right: repsRight });
  }, [repsRight, repsLeft, sm.handleRepetitionSave]);

  // ── Swap handler ─────────────────────────────────────────────────────────

  const handleSwap = onSwapExercise
    ? () => {
        const exId = sm.activeExercise?.id || '';
        if (exId) onSwapExercise(exId, sm.currentSegmentIndex, sm.currentExerciseIndex);
      }
    : undefined;

  // ── Log Drawer content (slot into RestWithPreview) ───────────────────────

  const logDrawerContent = (
    <div
      className="bg-white dark:bg-[#0F172A] rounded-t-[24px] px-4 pt-2.5 shadow-2xl"
      dir="rtl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
    >
      <h2
        className="text-base font-bold text-slate-900 dark:text-white text-center mb-0.5"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {pickerUnitType === 'time'
          ? isUnilateral ? 'כמה שניות לכל צד?' : 'כמה שניות החזקת?'
          : isUnilateral ? 'כמה חזרות לכל צד?' : 'כמה חזרות הצלחת מהתרגיל הקודם?'}
      </h2>

      {!isDrawerStable ? (
        <div className="w-full h-[72px] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00B4FF] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isUnilateral && (pickerUnitType === 'reps' || pickerUnitType === 'time') ? (
        <div className="space-y-1">
          {/* Right side picker */}
          <div>
            <div className="flex items-center gap-1.5 justify-center mb-0.5">
              <span className="text-sm">✋</span>
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>ימין</p>
              <span className="text-xs font-semibold text-[#00B4FF]">{repsRight}{pickerUnitType === 'time' ? '"' : ''}</span>
            </div>
            <HorizontalPicker
              min={pickerUnitType === 'time' ? 0 : 1}
              max={pickerMax}
              targetValue={pickerTargetValue}
              value={repsRight}
              onChange={setRepsRight}
              unitType={pickerUnitType}
            />
          </div>

          {/* Separator */}
          <div className="h-px bg-slate-200 dark:bg-zinc-700 mx-6" />

          {/* Left side picker */}
          <div>
            <div className="flex items-center gap-1.5 justify-center mb-0.5">
              <span className="text-sm" style={{ transform: 'scaleX(-1)' }}>✋</span>
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>שמאל</p>
              <span className="text-xs font-semibold text-[#00B4FF]">{repsLeft}{pickerUnitType === 'time' ? '"' : ''}</span>
            </div>
            <HorizontalPicker
              min={pickerUnitType === 'time' ? 0 : 1}
              max={pickerMax}
              targetValue={pickerTargetValue}
              value={repsLeft}
              onChange={setRepsLeft}
              unitType={pickerUnitType}
            />
          </div>
        </div>
      ) : (() => {
        const achieved = lockedAchievedRef.current;
        const pickerValue = (achieved != null && achieved > 0)
          ? achieved
          : (sm.completedReps != null && sm.completedReps > 0)
            ? sm.completedReps
            : pickerTargetValue;
        console.log('[Picker Debug] locked:', achieved, 'completedReps:', sm.completedReps, 'target:', pickerTargetValue, '→ value:', pickerValue);
        return (
          <HorizontalPicker
            min={pickerUnitType === 'time' ? 0 : 1}
            max={pickerMax}
            targetValue={pickerTargetValue}
            value={pickerValue}
            onChange={handlePickerChange}
            unitType={pickerUnitType}
          />
        );
      })()}

      <button
        onClick={isUnilateral
          ? () => {
              const effective = Math.min(repsRight, repsLeft);
              const min = sm.repsRangeMin;
              const max = sm.repsRangeMax;
              if (pickerUnitType === 'reps') {
                if (min !== null && effective < min) setCoachHint('fail');
                else if (max !== null && effective > max) setCoachHint('overachieve');
                else setCoachHint(null);
              }
              handleUnilateralSave();
            }
          : () => {
              const repsToSave = sm.completedReps ?? lockedAchievedRef.current ?? pickerInitialValue ?? pickerTargetValue;
              if (!repsToSave || repsToSave <= 0) {
                sm.handleRepetitionSave(pickerTargetValue);
                return;
              }
              const min = sm.repsRangeMin;
              const max = sm.repsRangeMax;
              if (min !== null && repsToSave < min) setCoachHint('fail');
              else if (max !== null && repsToSave > max) setCoachHint('overachieve');
              else setCoachHint(null);
              sm.handleRepetitionSave(repsToSave);
            }
        }
        className="w-full mt-3 h-12 rounded-full font-bold text-base text-white shadow-lg active:scale-[0.97] transition-transform"
        style={{
          background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
          fontFamily: 'var(--font-simpler)',
        }}
      >
        שמירה ומעבר למנוחה
      </button>

      {/* Swap button — consistent with Active screen */}
      {handleSwap && (
        <button
          onClick={handleSwap}
          className="w-full mt-2 h-10 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 active:scale-[0.97] transition-transform"
        >
          <img src="/assets/icons/ui/swap.svg" className="w-4 h-4 dark:invert" alt="Swap" />
          <span
            className="text-sm font-bold text-slate-600 dark:text-slate-300"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            החלפת תרגיל
          </span>
        </button>
      )}
    </div>
  );

  // ── Phase 4.6: Pause Overlay & Early Exit ───────────────────────────────

  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  const handleEarlyExit = useCallback(() => {
    setShowExitConfirmModal(false);
    onComplete?.(sm.getExerciseLog());
  }, [sm.getExerciseLog, onComplete]);

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

  // ── Mini-player bar (visible when minimized) ─────────────────────────────

  const renderMiniPlayer = () => {
    return (
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
          {safeVideoUrl ? (
            <video src={safeVideoUrl} className="w-full h-full object-cover" muted playsInline />
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
  };

  // ── Header overlay (gradient + 3 rows) ──────────────────────────────────

  const renderHeader = () => (
    <div
      className={`absolute top-0 left-0 right-0 z-[45] transition-all duration-300 ${
        isResting ? 'pb-20' : 'pb-16'
      }`}
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 35%, rgba(255,255,255,0.85) 55%, rgba(255,255,255,0.5) 75%, rgba(255,255,255,0.15) 90%, rgba(255,255,255,0) 100%)',
        touchAction: 'none',
      }}
      onPointerDown={handleHeaderPointerDown}
    >
      <div className="px-4" style={{ paddingTop: 'max(3rem, env(safe-area-inset-top, 48px))' }}>
        {/* Row 1: Story Bars */}
        <div className="mb-3">
          <WorkoutStoryBars
            progressBars={sm.progressBars}
            activeBarDuration={sm.autoCompleteTime}
            isPaused={sm.isPaused}
            isResting={isResting}
          />
        </div>

        {/* Row 2: List | Timer/Title (centered) | Pause */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <img src="/assets/icons/ui/list.svg" className="w-5 h-5 dark:invert" alt="List" />
          </button>

          <div
            className="flex-1 text-center text-slate-900 dark:text-white font-bold text-xl tracking-wider tabular-nums"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {sm.isPaused
              ? 'הפסקה'
              : sm.isLogDrawerOpen
                ? 'התרגיל שביצעת'
                : isResting
                  ? 'התרגיל הבא'
                  : sm.formatTime(sm.elapsedTime)}
          </div>

          <button
            onClick={sm.togglePause}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            {sm.isPaused ? (
              <Play size={18} className="text-slate-800" fill="currentColor" />
            ) : (
              <img src="/assets/icons/ui/pause.svg" className="w-5 h-5 dark:invert" alt="Pause" />
            )}
          </button>
        </div>

        {/* Set Pills — reactive to exerciseLogSnapshot */}
        {!isResting && sm.totalRounds > 1 && !isWarmupSegment && !isCooldownSegment && (
          <div className="flex justify-end gap-1.5 mb-2">
            {currentExLoggedReps.map((reps, i) => {
              const isLogged = reps !== null;
              const isCurrentActive = i === (firstIncompleteSetIdx >= 0 ? firstIncompleteSetIdx : sm.currentRound - 1);
              return (
                <div
                  key={i}
                  className={[
                    'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                    isLogged
                      ? 'text-white shadow-sm'
                      : isCurrentActive
                        ? 'bg-white dark:bg-slate-800 text-[#00BAF7]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500',
                  ].join(' ')}
                  style={
                    isLogged
                      ? { background: 'linear-gradient(to left, #00BAF7, #0CF2E3)' }
                      : isCurrentActive
                        ? { border: '2px solid #00BAF7' }
                        : { border: '1px solid #E0E9FF' }
                  }
                >
                  {isLogged ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
              );
            })}
          </div>
        )}

        {/* Row 3: Equipment Pills (right/RTL) | Name+Reps (left/RTL) */}
        {isResting && !sm.isLogDrawerOpen ? (
          <div className="flex flex-row-reverse items-center justify-between w-full py-1" dir="rtl">
            {restPreviewExercise.equipment.length > 0 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {restPreviewExercise.equipment.map((eqId: string) => {
                  const svgPaths = resolveEquipmentSvgPathList(eqId, workout.workoutLocation);
                  const svgPath = svgPaths[0] ?? null;
                  return (
                    <div
                      key={eqId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      {svgPath ? (
                        <img
                          src={svgPath}
                          alt=""
                          width={14}
                          height={14}
                          className="object-contain"
                          onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            img.removeAttribute('src');
                            img.style.display = 'none';
                          }}
                        />
                      ) : (
                        <PersonStanding size={14} className="text-slate-400" />
                      )}
                      <span
                        className="text-xs font-normal text-slate-700 dark:text-slate-200"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {resolveEquipmentLabel(eqId)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col items-start min-w-0">
              <p
                className="font-semibold text-slate-900 dark:text-white truncate max-w-full"
                style={{ fontFamily: 'var(--font-simpler)', fontSize: '14px', lineHeight: '20px' }}
              >
                {sm.isSupersetActive && sm.supersetPartnerName
                  ? `⟳ ${restPreviewExercise.name}`
                  : restPreviewExercise.name}
              </p>
              {restPreviewExercise.reps && (
                <p
                  className="font-normal text-slate-900 dark:text-white"
                  style={{ fontFamily: 'var(--font-simpler)', fontSize: '14px', lineHeight: '20px' }}
                >
                  {restPreviewExercise.reps}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* Preparation cue banner — below Row 3, only during rest */}
        {isResting && !sm.isLogDrawerOpen && restPreviewExercise.notificationText && (
          <div className="mt-3 mx-1" dir="rtl">
            <div
              className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl border"
              style={{
                background: 'rgba(219, 234, 254, 0.6)',
                borderColor: 'rgba(191, 219, 254, 0.8)',
              }}
            >
              <span className="text-base flex-shrink-0 mt-px">💡</span>
              <p
                className="text-xs font-semibold text-slate-700 leading-relaxed"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {restPreviewExercise.notificationText}
              </p>
            </div>
          </div>
        )}
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
          {(safeVideoUrl || safeImageUrl) && (
            <div className="absolute inset-0">
              {safeImageUrl && safeImageUrl !== OFFLINE_PLACEHOLDER ? (
                <img src={safeImageUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-30" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : safeVideoUrl ? (
                <video src={safeVideoUrl} className="w-full h-full object-cover blur-2xl scale-110 opacity-30" autoPlay loop muted playsInline />
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
            nextExercise={restPreviewExercise}
            logDrawerNode={logDrawerContent}
            isLogDrawerOpen={sm.isLogDrawerOpen}
            onSkip={sm.skipRest}
            isPaused={sm.isPaused}
            videoKey={sm.isLogDrawerOpen
              ? `current-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}`
              : `next-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}`}
          />
          {/* Coach hint — compact floating notification above rest drawer (hidden on last set) */}
          <AnimatePresence>
            {coachHint && !sm.isLogDrawerOpen && sm.currentRound < sm.totalRounds && (
              <motion.div
                key="coach-hint"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                className="absolute left-4 right-4 z-[60]"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 160px)' }}
                dir="rtl"
              >
                <div className={`rounded-2xl px-3.5 py-2.5 shadow-lg backdrop-blur-sm flex items-center gap-2.5 ${
                  coachHint === 'fail'
                    ? 'bg-orange-50/90 border border-orange-200/60 dark:bg-orange-950/80 dark:border-orange-700/50'
                    : 'bg-emerald-50/90 border border-emerald-200/60 dark:bg-emerald-950/80 dark:border-emerald-700/50'
                }`}>
                  <span className="text-base flex-shrink-0">{coachHint === 'fail' ? '💪' : '🔥'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight ${coachHint === 'fail' ? 'text-orange-700 dark:text-orange-300' : 'text-emerald-700 dark:text-emerald-300'}`} style={{ fontFamily: 'var(--font-simpler)' }}>
                      {coachHint === 'fail' ? 'קשה מדי?' : 'קל מדי?'}
                    </p>
                    <p className={`text-[11px] leading-tight mt-0.5 ${coachHint === 'fail' ? 'text-orange-600/80 dark:text-orange-400/80' : 'text-emerald-600/80 dark:text-emerald-400/80'}`} style={{ fontFamily: 'var(--font-simpler)' }}>
                      {coachHint === 'fail'
                        ? 'תוכל/י להחליף לגרסה קלה יותר'
                        : 'כל הכבוד! הקושי יעלה אוטומטית'}
                    </p>
                  </div>
                  {handleSwap && coachHint === 'fail' && (
                    <button
                      onClick={() => { setCoachHint(null); handleSwap(); }}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/60 active:scale-[0.96] transition-transform"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/assets/icons/ui/swap.svg" className="w-3.5 h-3.5 dark:invert" alt="" />
                      <span className="text-[11px] font-bold text-orange-700 dark:text-orange-300 whitespace-nowrap" style={{ fontFamily: 'var(--font-simpler)' }}>
                        החלפה
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => setCoachHint(null)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-slate-400/70 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label="סגור"
                  >
                    <span className="text-sm leading-none">×</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    // ACTIVE — video + scrollable lyrics card
    // Key includes currentRound so React fully remounts when straight sets advance
    const activeKey = `active-${sm.currentSegmentIndex}-${sm.currentExerciseIndex}-set-${sm.currentRound}`;

    const isTimeExercise = sm.exerciseType === 'time' && !sm.isFollowAlongMode;

    return (
      <div key={activeKey} className={`absolute inset-0 bg-black transition-opacity duration-300 ${sm.fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        {/* Video background layer */}
        <ExerciseVideoPlayer
          key={`player-${activeKey}`}
          exerciseId={sm.activeExercise?.id || `ex-${sm.currentExerciseIndex}`}
          videoUrl={safeVideoUrl}
          exerciseName={sm.exerciseName}
          exerciseType={sm.exerciseType}
          isPaused={sm.isPaused}
          hasAudio={false}
          onVideoProgress={sm.setVideoProgress}
          onVideoEnded={isTimeExercise ? undefined : sm.handleExerciseComplete}
        />

        {/* Pre-fetch next exercise video (uses cached blob when offline) */}
        {safeNextVideoUrl && (
          <video src={safeNextVideoUrl} preload="auto" className="hidden" muted playsInline />
        )}

        {/* Isometric timer drawer — bottom sheet for time-based exercises */}
        {isTimeExercise && (
          <IsometricTimerCard
            key={`timer-${sm.currentSide || 'bilateral'}`}
            duration={sm.exerciseDuration > 0 ? sm.exerciseDuration : 30}
            exerciseName={sm.exerciseName}
            repsOrDurationText={sm.repsOrDurationText}
            onComplete={(elapsed) => sm.handleExerciseComplete(elapsed)}
            side={sm.currentSide}
          />
        )}

        {/* Scrollable overlay — spacer lets video show, then the white card peeks up */}
        {!isTimeExercise && (
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain z-10"
        >
          {/* Spacer — pushes card to bottom; maximises visible video */}
          <div className="pointer-events-none" style={{ height: 'calc(100dvh - 180px)' }} />

          {/* Card — compact, content-hugging */}
          <div
            className="relative bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-2"
            dir="rtl"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
          >
            {/* Scroll hint — drag handle */}
            <div className="flex justify-center mb-1.5">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>

            {/* ── Central Metrics: Range (XL Black) + Target (Blue) ────── */}
            {sm.repsOrDurationText && (
              <div className="flex items-baseline justify-center gap-2 mb-0.5">
                <span
                  className="text-4xl font-black"
                  style={{ fontFamily: 'var(--font-simpler)', color: '#000000' }}
                >
                  {sm.repsOrDurationText}{isUnilateral ? ' (לכל צד)' : ''}
                </span>
                {pickerTargetValue > 0 && (
                  <span
                    className="text-sm font-bold"
                    style={{ fontFamily: 'var(--font-simpler)', color: '#00B4FF' }}
                  >
                    (יעד: {pickerTargetValue})
                  </span>
                )}
              </div>
            )}

            {/* Exercise name — secondary, below the metrics */}
            <p
              className="text-base font-semibold text-slate-900 dark:text-white text-center mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {sm.exerciseName}
            </p>

            {/* Superset badge */}
            {sm.isSupersetActive && sm.supersetPartnerName && (
              <div className="flex items-center justify-center mb-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 border border-violet-200 dark:bg-violet-950/60 dark:border-violet-700 rounded-full">
                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-300 uppercase tracking-wider" style={{ fontFamily: 'var(--font-simpler)' }}>
                    סופרסט
                  </span>
                  <span className="text-[10px] text-violet-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                    × {sm.supersetPartnerName}
                  </span>
                </div>
              </div>
            )}

            {/* Primary CTA */}
            <div className="mb-2">
              <FillingButton
                key={`fill-${activeKey}`}
                autoCompleteTime={sm.autoCompleteTime}
                onClick={sm.handleExerciseComplete}
                label="סיימתי"
                isPaused={sm.isPaused}
              />
            </div>

            {/* Swap button — tight below CTA */}
            {handleSwap && (
              <div className="flex justify-center mb-1">
                <button
                  onClick={handleSwap}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 active:scale-[0.97] transition-transform"
                >
                  <img src="/assets/icons/ui/swap.svg" className="w-4 h-4 dark:invert" alt="Swap" />
                  <span
                    className="text-sm font-bold text-slate-600 dark:text-slate-300"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    החלפת תרגיל
                  </span>
                </button>
              </div>
            )}

            {/* ── Below the fold — unified ExerciseDetailContent ────────── */}
            <div className="-mx-5 mt-4">
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
                workoutLocation={workout.workoutLocation}
              />
            </div>
          </div>
        </div>
        )}
      </div>
    );
  };

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div
      className="relative w-full bg-slate-100 dark:bg-slate-950 overflow-hidden"
      style={{ height: '100dvh', overscrollBehavior: 'none' }}
    >
      {/* ─── BASE LAYER: Workout Playlist ─────────────────────────────── */}
      <div className="absolute inset-0 z-0 bg-white dark:bg-slate-900">
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
          renderMiniPlayer()
        ) : (
          <div className="relative w-full h-full overflow-hidden">
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
