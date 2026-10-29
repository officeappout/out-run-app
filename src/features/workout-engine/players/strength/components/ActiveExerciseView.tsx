'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import FillingButton from './FillingButton';
import IsometricTimerCard from './IsometricTimerCard';
import TimerCardExtras from './TimerCardExtras';
import ExerciseDetailContent from './ExerciseDetailContent';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';
import { TIMER_AUTO_ADVANCE_ENABLED } from '@/config/feature-flags';
import { useStrengthPlayerV2 } from '../context/StrengthPlayerV2Context';
import { useStrengthDrawerV1 } from '../hooks/useStrengthDrawerV1';
import { useSnapDrawer } from '../../shared/v2/useSnapDrawer';
import SnapDrawerGrabber from '../../shared/v2/SnapDrawerGrabber';
import PlayerDrawerCompact from '../../shared/v2/PlayerDrawerCompact';
import WideSplit from '../../shared/v2/WideSplit';
import { useWidePlayer, WidePlayerProvider } from '../../shared/v2/WidePlayerContext';
import AmbientMedia from '../../shared/v2/AmbientMedia';
import { decidePlayerMode, isAmbientColumn, videoAspect, type VideoAspect } from '../../shared/v2/immersive-mode';
import ImmersiveOverlay from './ImmersiveOverlay';
import type { CardClockReport } from '../tv/card-clock';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import ActiveRepsWidePanel from './ActiveRepsWidePanel';

import { useUiDir } from '@/lib/i18n/useUiDir';
/**
 * ActiveExerciseView — the live ACTIVE-phase player surface.
 *
 * Composes:
 *   • Full-screen ExerciseVideoPlayer (background)
 *   • Hidden <video preload="auto"> pre-fetch for the next exercise
 *   • IsometricTimerCard bottom sheet (for `time` exercises only)
 *   • Scrollable lyrics overlay (for rep-based exercises only):
 *     – central metric block (range + target)
 *     – pyramid step counter + upcoming-steps mini preview
 *     – exercise name
 *     – superset badge + cycle counter
 *     – primary CTA (FillingButton "סיימתי")
 *     – swap-exercise button
 *     – ExerciseDetailContent (cues, muscles, goal, equipment)
 *
 * Pure presentational — orchestrator owns:
 *   – state-machine routing (`workoutState === 'ACTIVE'`)
 *   – the activeKey derivation
 *   – the isTimeExercise decision (`exerciseType === 'time' && !isFollowAlongMode`)
 *   – every callback (onComplete, onSwap, onSetVideoProgress)
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-12).
 */

export interface ActiveExerciseMuscleGroups {
  primary: string[];
  secondary: string[];
}

export interface ActiveExerciseViewProps {
  /** Stable React key forcing remount on segment/exercise/round change. */
  activeKey: string;
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
  /** Whether the workout is currently paused (gates video + filling button). */
  isPaused: boolean;
  /** Resolved (offline-cached) video URL for the active exercise. */
  safeVideoUrl: string | null;
  /** Resolved (offline-cached) video URL for the next exercise — used as a hidden pre-fetch. */
  cachedNextVideoUrl: string | null;
  /** Long-form instructional video for the active exercise — drives the "צפה בהסבר המלא" CTA (null hides it). */
  exerciseFullTutorial?: ExternalVideo | null;
  /** Stable id of the active exercise (used by ExerciseVideoPlayer + remount keys). */
  exerciseId: string;
  /** Name of the active exercise (drives the title under the metrics). */
  exerciseName: string;
  /** Type of the active exercise (`reps` / `time` / etc.). */
  exerciseType: string;
  /** B1: narrow guided-follow-along flag, forwarded to ExerciseVideoPlayer's
   *  fullscreen/rotate affordance gate (recovery keeps it; plain warmup does not). */
  isFollowAlong?: boolean;
  /** Whether the active exercise should run as a time-based isometric (drives IsometricTimerCard vs scrollable card). */
  isTimeExercise: boolean;
  /** Duration in seconds for time-based exercises (`IsometricTimerCard.duration`). */
  exerciseDuration: number;
  /**
   * Block-protocol work interval (tabata): overrides the timer duration and
   * runs the card in autoStart + autoCompleteAtTarget + isTabata mode (same
   * bottom-sheet card as any time-based exercise, just auto-only chrome).
   * The orchestrator forces isTimeExercise=true alongside. Absent = normal flow.
   */
  blockWorkSec?: number | null;
  /**
   * Block-protocol lead-in (tabata): seconds of "get ready" before the work
   * count for THIS interval — the first interval gets a lead-in, later ones 0.
   * Undefined outside tabata = IsometricTimerCard's default 5s prep.
   */
  timerPrepSeconds?: number;
  /** Machine-tabata-only label ("מתקן X/2 · סבב Y/2") piped straight to
   *  IsometricTimerCard's badge row. Null/undefined for every other block. */
  machineTabataLabel?: { machine: number; machineCount: number; round: number; roundsPerMember: number } | null;
  /** Active side for unilateral exercises ("left" / "right" / null) — drives timer remount + side label. */
  currentSide: 'left' | 'right' | null;
  /** Range display text ("6-8 חזרות" / "30 שניות"). */
  repsOrDurationText: string;
  /** Smart-target picker value (cyan "(יעד: N)" pill). */
  targetValue: number;
  /** Whether the exercise is unilateral (suffixes "(לכל צד)" to the range text). */
  isUnilateral: boolean;
  /** Whether the active exercise is currently inside a pyramid sequence. */
  isPyramidActive: boolean;
  /** 1-based current round (also drives the pyramid "שלב N מתוך M" counter). */
  currentRound: number;
  /** Total rounds for the active exercise. */
  totalRounds: number;
  /** Remaining pyramid steps after the current round (preview row). */
  upcomingPyramidSteps: PyramidStep[];
  /** Whether the player is currently inside a superset block (drives badge). */
  isSupersetActive: boolean;
  /** Name of the superset partner exercise (shown next to the badge). */
  supersetPartnerName: string | null;
  /** Autocomplete duration for the FillingButton CTA (null disables the auto-fill animation). */
  autoCompleteTime: number;
  /** Execution-step cues piped to ExerciseDetailContent. */
  executionSteps: string[];
  /** Muscle groups (primary + secondary) piped to ExerciseDetailContent. */
  muscleGroups: ActiveExerciseMuscleGroups;
  /** Exercise goal text piped to ExerciseDetailContent. */
  exerciseGoal: string | null;
  /** Equipment id(s) of the active exercise piped to ExerciseDetailContent. */
  equipment?: string | string[];
  /** Workout location piped to ExerciseDetailContent (drives equipment SVG resolution). */
  workoutLocation?: string;
  /** External scroll-container ref (so the orchestrator can drive programmatic scrolls if needed). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Primary completion action — fires from FillingButton click or video-ended. */
  onComplete: (elapsed?: number) => void;
  /** Optional swap-exercise action (renders the "החלפת תרגיל" CTA only when defined). */
  onSwap?: () => void;
  /** PR-B1 guided mode: one short guidance line (reps card / timer card). Omitted → none. */
  guidanceLine?: string;
  /** PR-B2 demo gate: the clip's own paused state. While the gate holds the PLAYER paused the
   *  demo keeps looping behind it, so this can be false while isPaused is true. Default = isPaused. */
  videoPaused?: boolean;
  /** PR-B2: receives the direct <video> element (see ExerciseVideoPlayer.onVideoElement). */
  onVideoElement?: (el: HTMLVideoElement | null) => void;
  /** Park live v2 station: the clip plays with sound and resumes by this key (clip-playback.ts). */
  stationClipKey?: string | null;
  /** PR-B2: start the timed card without its "התחלה" tap (the gate's "צפיתי, התחל" was the tap).
   *  Its normal get-ready still runs; tabata keeps its own autoStart. */
  autoStartTimer?: boolean;
  /** Video-progress callback piped to ExerciseVideoPlayer. */
  onSetVideoProgress?: (progress: number) => void;
  /** enable_wide_player_v1: the next exercise, for the wide panel's next-up card. */
  nextUp?: { name: string; caption?: string | null; imageUrl?: string | null };
  /** enable_tv_mode_v1: the timer card reports its clock here (see IsometricTimerCard). Absent = off. */
  onClockState?: (r: CardClockReport | null) => void;
  /** enable_wide_player_v1: this exercise's poster — the ambient blurred fill behind a portrait clip. */
  posterUrl?: string | null;
  /** enable_wide_player_v1: true while immersive (the orchestrator hides its header / story bars). */
  onImmersiveChange?: (immersive: boolean) => void;
  /** Immersive overlay's minimize. */
  onMinimize?: () => void;
}

export default function ActiveExerciseView({
  activeKey,
  fadeIn,
  isPaused,
  safeVideoUrl,
  cachedNextVideoUrl,
  exerciseFullTutorial,
  exerciseId,
  exerciseName,
  exerciseType,
  isFollowAlong,
  isTimeExercise,
  exerciseDuration,
  blockWorkSec,
  timerPrepSeconds,
  machineTabataLabel,
  currentSide,
  repsOrDurationText,
  targetValue,
  isUnilateral,
  isPyramidActive,
  currentRound,
  totalRounds,
  upcomingPyramidSteps,
  isSupersetActive,
  supersetPartnerName,
  autoCompleteTime,
  executionSteps,
  muscleGroups,
  exerciseGoal,
  equipment,
  workoutLocation,
  scrollRef,
  onComplete,
  onSwap,
  guidanceLine,
  videoPaused,
  onVideoElement,
  stationClipKey = null,
  autoStartTimer = false,
  onSetVideoProgress,
  nextUp,
  onClockState,
  posterUrl,
  onImmersiveChange,
  onMinimize,
}: ActiveExerciseViewProps) {
  const { direction } = useUiDir();
  // Gate the hidden prefetch <video> until the main video has started loading.
  // On iOS WKWebView, two concurrent video decoders can exhaust the system
  // media budget and cause the primary video to fail. Waiting for the main
  // video's `loadeddata` event before mounting the prefetch avoids this race.
  const [mainVideoReady, setMainVideoReady] = useState(false);
  // enable_home_v2 — styling only (provided once by StrengthRunner).
  const v2 = useStrengthPlayerV2();
  // enable_strength_drawer_v1: the reps / timer card as a two-snap drawer
  // (remembered for the app session) + the corner "הסבר" chip.
  const drawerV1 = useStrengthDrawerV1();
  const drawerState = useSnapDrawer('strength', drawerV1);
  // enable_wide_player_v1: wide = side panel instead of the bottom sheet (no drawer).
  const layout = useWidePlayer();
  const t = useT(player);
  // The clip's own shape (from the <video> element — no change to ExerciseVideoPlayer): the app's
  // landscape-filmed clips (recovery sessions) get the immersive mode on a landscape screen.
  const [aspect, setAspect] = useState<VideoAspect>(null);
  const [userImmersive, setUserImmersive] = useState(false);
  const detachRef = useRef<(() => void) | null>(null);
  const handleVideoEl = useCallback((el: HTMLVideoElement | null) => {
    detachRef.current?.();
    detachRef.current = null;
    onVideoElement?.(el);
    if (!el) return;
    const read = () => setAspect(videoAspect(el.videoWidth, el.videoHeight));
    if (el.readyState >= 1) read();
    el.addEventListener('loadedmetadata', read);
    detachRef.current = () => el.removeEventListener('loadedmetadata', read);
  }, [onVideoElement]);
  const mode = decidePlayerMode({ enabled: layout.enabled, wide: layout.wide, landscape: layout.landscape, aspect, userImmersive });
  const split = mode === 'split';
  const immersive = mode === 'immersive';
  // State (collapsed / expanded, scroll) survives immersive: the card stays mounted, just hidden.
  const drawer = drawerV1 && !split ? drawerState : null;
  const collapsed = !!drawer?.collapsed;
  useEffect(() => {
    onImmersiveChange?.(immersive);
    return () => onImmersiveChange?.(false);
  }, [immersive, onImmersiveChange]);

  // Reset the gate on every set remount so the prefetch is re-deferred.
  useEffect(() => {
    setMainVideoReady(false);
    setAspect(null);
  }, [activeKey]);

  const timerEl = isTimeExercise ? (
        <IsometricTimerCard
          key={`timer-${currentSide || 'bilateral'}`}
          duration={blockWorkSec ?? (exerciseDuration > 0 ? exerciseDuration : 30)}
          exerciseName={exerciseName}
          repsOrDurationText={repsOrDurationText}
          onComplete={(elapsed) => onComplete(elapsed)}
          side={currentSide}
          autoStart={!!blockWorkSec || autoStartTimer}
          autoCompleteAtTarget={!!blockWorkSec}
          isTabata={!!blockWorkSec}
          machineTabataLabel={machineTabataLabel}
          prepSeconds={timerPrepSeconds}
          externalPaused={isPaused}
          guidanceLine={guidanceLine}
          drawer={drawer}
          nextUp={split ? nextUp : undefined}
          onClockState={onClockState}
          extras={
            <TimerCardExtras
              exerciseName={exerciseName}
              onSwap={onSwap}
              primaryMuscle={muscleGroups.primary[0] || null}
              secondaryMuscles={muscleGroups.secondary.length > 0 ? muscleGroups.secondary : undefined}
              cues={executionSteps.length > 0 ? executionSteps : undefined}
              goal={exerciseGoal}
              equipment={equipment}
              workoutLocation={workoutLocation}
            />
          }
        />
  ) : null;
  const videoEl = (
    <ExerciseVideoPlayer
        key={`player-${activeKey}`}
        exerciseId={exerciseId}
        videoUrl={safeVideoUrl}
        imageUrl={posterUrl ?? null}
        exerciseName={exerciseName}
        exerciseType={exerciseType}
        isFollowAlong={isFollowAlong}
        isPaused={videoPaused ?? isPaused}
        hasAudio={false}
        onVideoElement={handleVideoEl}
        withSound={stationClipKey != null}
        resumeKey={stationClipKey}
        fullTutorial={exerciseFullTutorial ?? null}
        tutorialPlacement={drawerV1 || split || immersive ? 'corner' : 'legacy'}
        onVideoProgress={onSetVideoProgress}
        onVideoEnded={(isTimeExercise || !TIMER_AUTO_ADVANCE_ENABLED) ? undefined : () => onComplete()}
        onLoadingChange={(loading) => {
          if (!loading) setMainVideoReady(true);
        }}
      />
  );
  const prefetchEl = mainVideoReady && cachedNextVideoUrl ? (
    <video src={cachedNextVideoUrl} preload="auto" className="hidden" muted playsInline {...{"webkit-playsinline": "true"}} />
  ) : null;

  // The timer card keeps ONE place in the tree in every mode (so a rotation never resets it); it only
  // changes look: hero card in split / immersive, today's bottom sheet otherwise.
  const timerNode = isTimeExercise ? (
    <div
      data-wide-timer-slot=""
      className={immersive ? 'absolute z-40 w-[360px] max-w-[46vw] rounded-3xl bg-white shadow-2xl' : 'contents'}
      style={immersive ? { insetInlineEnd: 'max(3vw, env(safe-area-inset-right, 0px))', top: '50%', transform: 'translateY(-50%)', zoom: layout.scale } : undefined}
    >
      <WidePlayerProvider value={{ ...layout, wide: split || immersive }}>{timerEl}</WidePlayerProvider>
    </div>
  ) : null;

  // Full-screen toggle for a landscape-filmed clip that is not immersive yet.
  const enterBtn = layout.enabled && aspect === 'landscape' && !immersive ? (
    <button
      type="button"
      onClick={() => setUserImmersive(true)}
      aria-label={t('wide.immersive.enter')}
      className="absolute z-20 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md"
      style={{ insetInlineEnd: 16, top: split ? 16 : 'calc(env(safe-area-inset-top, 0px) + 6.5rem)' }}
    >
      <Maximize2 size={18} aria-hidden />
    </button>
  ) : null;

  if (split) {
    return (
      <div
        key={activeKey}
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
      >
        <WideSplit
          media={<AmbientMedia posterUrl={posterUrl} column={isAmbientColumn(aspect)}>{videoEl}{enterBtn}</AmbientMedia>}
          panel={isTimeExercise ? timerNode : (
            <ActiveRepsWidePanel
              activeKey={activeKey}
              exerciseName={exerciseName}
              repsOrDurationText={repsOrDurationText}
              isUnilateral={isUnilateral}
              targetValue={targetValue}
              currentRound={currentRound}
              totalRounds={totalRounds}
              isSupersetActive={isSupersetActive}
              supersetPartnerName={supersetPartnerName}
              guidanceLine={guidanceLine}
              autoCompleteTime={autoCompleteTime}
              isPaused={isPaused}
              v2={v2}
              nextUp={nextUp}
              onComplete={() => onComplete()}
              onSwap={onSwap}
            />
          )}
        />
        {prefetchEl}
      </div>
    );
  }

  return (
    <div
      key={activeKey}
      className={`absolute inset-0 bg-black transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Video background layer.
          #2: warmup/follow-along exercises run in follow-along MODE (non-looping
          video), so onVideoEnded auto-advanced every few seconds. It is gated below
          behind TIMER_AUTO_ADVANCE_ENABLED (the C1 flag) — while off, the clip ends
          without advancing; the user taps "סיימתי". Covers regular + follow-along
          warmup, standalone + hybrid. (reps loop, so onVideoEnded never fired for them.) */}
      {videoEl}
      {enterBtn}

      {/* Pre-fetch next exercise video — deferred until the main video has fired
          loadeddata. On iOS WKWebView, mounting two <video> elements simultaneously
          exhausts the concurrent decoder budget and can block the primary video. */}
      {prefetchEl}

      {/* Isometric timer drawer — bottom sheet for time-based exercises */}
      {timerNode}

      {/* Scrollable overlay — spacer lets video show, then the white card peeks up */}
      {!isTimeExercise && (
        <div
          ref={scrollRef}
          className={`${collapsed
            ? 'absolute inset-x-0 bottom-0 z-10'
            : 'absolute inset-0 overflow-y-auto overscroll-contain z-10'}${immersive ? ' invisible pointer-events-none' : ''}`}
        >
          {/* Spacer — pushes card to bottom; maximises visible video. B4:
              warmup / follow-along shows a guided clip with no big reps/target
              number, so its card is naturally shorter — reserve less bottom
              space (140px vs 220px) for a taller video and a card peek sized to
              its lighter content. Live-player only; the overview sheet is untouched. */}
          {!collapsed && (
          <div
            className="pointer-events-none"
            style={{ height: `calc(100dvh - ${exerciseType === 'follow-along' ? 140 : 220}px)` }}
          />
          )}

          {/* Card — compact, content-hugging */}
          <div
            className={v2
              ? 'relative bg-white rounded-t-[28px] shadow-v2-sheet px-5 pt-2'
              : 'relative bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-2'}
            dir={direction}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
          >
            {/* Scroll hint — drag handle (enable_strength_drawer_v1: the snap grabber) */}
            {drawer ? (
              <SnapDrawerGrabber drawer={drawer} />
            ) : (
            <div className="flex justify-center mb-1.5">
              <div className={v2 ? 'h-1.5 w-10 rounded-full bg-v2-pill-border' : 'w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full'} />
            </div>
            )}

            {/* Compact snap: one row (name · range · target · round) above the SAME
                FillingButton below — it stays mounted, so its auto-fill keeps going. */}
            {collapsed && drawer ? (
              <div className="mb-2">
                <PlayerDrawerCompact
                  drawer={drawer}
                  title={exerciseName}
                  caption={[
                    repsOrDurationText ? `${repsOrDurationText}${isUnilateral ? t('strengthPlayer.active.perSide') : ''}` : null,
                    (isPyramidActive || (isSupersetActive && totalRounds > 1)) ? t('strengthPlayer.active.captionRound', { current: String(currentRound), total: String(totalRounds) }) : null,
                  ].filter(Boolean).join(' · ')}
                  value={targetValue > 0 ? String(targetValue) : null}
                  unit={targetValue > 0 ? t('strengthPlayer.active.targetUnit') : null}
                />
              </div>
            ) : (
            <>

            {/* ── Central Metrics: Range (XL Black) + Target (Blue) ────── */}
            {repsOrDurationText && (
              <div className="flex items-baseline justify-center gap-2 mb-0.5">
                <span
                  className={v2 ? 'text-4xl font-black text-v2-ink !tracking-[-0.02em] whitespace-nowrap tabular-nums' : 'text-4xl font-black'}
                  style={v2 ? { fontFamily: 'var(--font-simpler)' } : { fontFamily: 'var(--font-simpler)', color: '#000000' }}
                >
                  {repsOrDurationText}{isUnilateral ? t('strengthPlayer.active.perSide') : ''}
                </span>
                {targetValue > 0 && (
                  <span
                    className={v2 ? 'text-[13px] font-extrabold text-v2-deep whitespace-nowrap' : 'text-sm font-bold'}
                    style={v2 ? { fontFamily: 'var(--font-simpler)' } : { fontFamily: 'var(--font-simpler)', color: '#00B4FF' }}
                  >
                    {t('strengthPlayer.active.target', { target: String(targetValue) })}
                  </span>
                )}
              </div>
            )}

            {/* ── Pyramid step indicator ───────────────────────────────── */}
            {isPyramidActive && (
              <div className="flex flex-col items-center gap-0.5 mb-1" dir={direction}>
                {/* Step counter — same visual register as superset "סבב N מתוך M" */}
                <span
                  className={v2 ? 'text-[12px] font-extrabold text-v2-deep whitespace-nowrap' : 'text-[11px] font-bold text-[#00BAF7] uppercase tracking-wider'}
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {t('strengthPlayer.active.step', { current: String(currentRound), total: String(totalRounds) })}
                </span>

                {/* Upcoming steps mini-preview */}
                {upcomingPyramidSteps.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {upcomingPyramidSteps.map((step, idx) => {
                      const val = step.targetHold ?? step.targetReps;
                      const unit = t('strengthPlayer.active.stepUnit', { unit: step.targetHold != null ? 'seconds' : 'reps' });
                      return (
                        <span
                          key={idx}
                          className={v2 ? 'text-[11px] font-bold text-v2-muted whitespace-nowrap' : 'text-[10px] text-slate-400 dark:text-slate-500'}
                          style={{ fontFamily: 'var(--font-simpler)' }}
                        >
                          {idx === 0 ? '▸' : '→'} {val} {unit}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Exercise name — secondary, below the metrics */}
            <p
              className={v2 ? 'text-[17px] font-black text-v2-ink text-center mb-2 !tracking-[-0.01em]' : 'text-base font-semibold text-slate-900 dark:text-white text-center mb-2'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {exerciseName}
            </p>

            {/* PR-B1 guided: one short guidance line */}
            {guidanceLine && (
              <p
                className={v2 ? 'text-[13px] font-bold text-center text-v2-deep mb-2' : 'text-[13px] font-semibold text-center text-[#007EA8] mb-2'}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {guidanceLine}
              </p>
            )}

            {/* Superset badge + round counter */}
            {isSupersetActive && supersetPartnerName && (
              <div className="flex flex-col items-center gap-1 mb-2">
                <div className={v2 ? 'inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-violet-50 ring-1 ring-inset ring-violet-200 rounded-full' : 'inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 border border-violet-200 dark:bg-violet-950/60 dark:border-violet-700 rounded-full'}>
                  <span className={v2 ? 'text-[11px] font-extrabold text-violet-600 whitespace-nowrap' : 'text-[10px] font-bold text-violet-600 dark:text-violet-300 uppercase tracking-wider'} style={{ fontFamily: 'var(--font-simpler)' }}>
                    {t('strengthPlayer.active.superset')}
                  </span>
                  <span className={v2 ? 'text-[11px] font-bold text-violet-500 truncate' : 'text-[10px] text-violet-400'} style={{ fontFamily: 'var(--font-simpler)' }}>
                    × {supersetPartnerName}
                  </span>
                </div>
                {totalRounds > 1 && (
                  <span
                    className={v2 ? 'text-[12px] font-extrabold text-violet-500 whitespace-nowrap' : 'text-[11px] font-semibold text-violet-500 dark:text-violet-400'}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {t('strengthPlayer.active.round', { current: String(currentRound), total: String(totalRounds) })}
                  </span>
                )}
              </div>
            )}

            </>
            )}

            {/* Primary CTA */}
            <div className="mb-2" data-coach="player-done">
              <FillingButton
                key={`fill-${activeKey}`}
                autoCompleteTime={autoCompleteTime}
                onClick={() => onComplete()}
                isPaused={isPaused}
                v2={v2}
              />
            </div>

            {/* Swap button — tight below CTA */}
            {!collapsed && onSwap && (
              <div className="flex justify-center mb-1">
                <button
                  onClick={onSwap}
                  className={v2
                    ? 'inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2'
                    : 'inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 active:scale-[0.97] transition-transform'}
                >
                  <img src="/assets/icons/ui/swap.svg" className={v2 ? 'w-4 h-4' : 'w-4 h-4 dark:invert'} alt="Swap" />
                  <span
                    className={v2 ? 'text-[14px] font-extrabold text-v2-ink-2 whitespace-nowrap' : 'text-sm font-bold text-slate-600 dark:text-slate-300'}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {t('strengthPlayer.active.swap')}
                  </span>
                </button>
              </div>
            )}

            {/* ── Below the fold — unified ExerciseDetailContent ──────────
                The player tour's ONE "איך מבצעים" target (always rendered, unlike the
                video's conditional "צפה בהסבר המלא" button). */}
            {!collapsed && (
            <div className="-mx-5 mt-4" data-coach="player-how-to">
              <ExerciseDetailContent
                exerciseName={exerciseName}
                videoUrl={null}
                hideHeroVideo
                hideTitle
                primaryMuscle={muscleGroups.primary[0] || null}
                secondaryMuscles={muscleGroups.secondary.length > 0 ? muscleGroups.secondary : undefined}
                cues={executionSteps.length > 0 ? executionSteps : undefined}
                goal={exerciseGoal}
                equipment={equipment}
                workoutLocation={workoutLocation}
              />
            </div>
            )}
          </div>
        </div>
      )}
      {immersive && (
        <ImmersiveOverlay
          exerciseName={exerciseName}
          targetText={repsOrDurationText}
          onDone={isTimeExercise ? undefined : () => onComplete()}
          onMinimize={onMinimize}
          onExit={userImmersive && !layout.landscape ? () => setUserImmersive(false) : undefined}
        />
      )}
    </div>
  );
}
