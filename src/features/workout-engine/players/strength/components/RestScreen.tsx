'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell } from 'lucide-react';
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import type { NextExerciseInfo } from '../hooks/useWorkoutStateMachine';
import { useNetworkAwareStreamUrl } from '@/features/content/exercises/client/hooks/useNetworkAwareStreamUrl';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';

/**
 * RestScreen — unified REST-phase card, shared by every workout type
 * (regular exercises, hydraulic strength, machine tabata, ab/core finisher
 * tabata). Replaces the two previous parallel implementations:
 *   - RestWithPreview (non-tabata): full-bleed next-exercise video background
 *   - TabataRestCard (tabata, both machine + general-finisher): blurred
 *     background + SVG progress ring
 *
 * Neither predecessor owned any timer/advance logic itself — both were pure
 * functions of an externally-owned `restTimeLeft` (the real countdown lives
 * in useWorkoutTimers.ts / useWorkoutStateMachine.ts, untouched by this
 * component). Unifying the RENDERING here does not touch that wiring.
 *
 * Layout:
 *   - Center: "מנוחה" title + big countdown + the shared rest Lottie
 *     animation (same @lottiefiles/dotlottie-react + self-hosted WASM the
 *     flame indicator uses — src/components/ui/AnimatedFlame.tsx).
 *   - Top-left: one clean column — "התרגיל הבא" label, a portrait (9:16)
 *     thumbnail tile, the exercise name, reps/time, and (when present) a
 *     coach-hint/prep note — all as plain text below the tile, never
 *     overlaid on the image. This is the SINGLE place next-exercise
 *     name/reps/notes are shown; RunnerHeader's own row 3 and prep-cue
 *     banner were removed (16.09.2026) once they became a duplicate of this
 *     block. Positioned below RunnerHeader's story-bar + button rows (this
 *     app is dir="rtl" globally, so the header's Pause button — its last
 *     flex child — renders at the physical top-left; the header's z-[45]
 *     sits above this component's z-20, so the tile must clear the button
 *     row's actual height, not just share a z-index fight with it). Tap
 *     expands the tile to the regular preview clip/loop; tap again
 *     collapses. Collapsed state shows a poster image (nextExercise.imageUrl,
 *     or Bunny's auto-generated thumbnail) or a Dumbbell icon when neither
 *     resolves — the video player only mounts once expanded.
 *     (16.09.2026: full-length-tutorial-on-expand was tried and reverted —
 *     it broke collapse-back and surfaced the app's native player. Parked
 *     for a future unified-player task; NextExerciseInfo.fullTutorial and
 *     its resolution were removed along with it rather than left unused.)
 *   - Optional skip button (onSkip) — only for non-tabata; tabata rest has no
 *     skip control, unchanged from before.
 *   - Optional LOG_REPS drawer slot (logDrawerNode) — only for non-tabata.
 *   - Final 3-2-1 full-screen overlay: pure read of the existing
 *     `restTimeLeft` prop for its last 3 non-zero seconds — no separate
 *     clock, no added time. A transition with zero configured rest never
 *     enters this range, so it's skipped automatically.
 */

const REST_ANIMATION_SRC = '/assets/animations/sloth-rest.lottie';

// Self-hosted WASM engine — same file AnimatedFlame.tsx points at. Idempotent
// and cheap; must be called from this module's own top level too since the
// workout player route may not import AnimatedFlame at all.
setWasmUrl('/assets/animations/dotlottie-player.wasm');

export interface RestScreenProps {
  /** Seconds remaining in the current rest interval (ticks down externally). */
  restTimeLeft: number;
  /** Time formatter (mm:ss). */
  formatTime: (seconds: number) => string;
  /** Snapshot of the next exercise shown in the collapsible preview tile. */
  nextExercise: NextExerciseInfo;
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
  /** Whether the workout is currently paused (pauses the expanded preview video). */
  isPaused: boolean;
  /** Remount key for the expanded preview video. */
  videoKey: string;
  /** Skip-rest action. Omit entirely to hide the button (tabata rest — machine-timed, no manual skip). */
  onSkip?: () => void;
  /** Pre-rendered log-drawer slot. Omit entirely for tabata (no rep logging mid-block). */
  logDrawerNode?: React.ReactNode;
  /** Whether the bottom log drawer is currently open. */
  isLogDrawerOpen?: boolean;
}

export default function RestScreen({
  restTimeLeft,
  formatTime,
  nextExercise,
  fadeIn,
  isPaused,
  videoKey,
  onSkip,
  logDrawerNode,
  isLogDrawerOpen = false,
}: RestScreenProps) {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  // Same Bunny-aware resolution the old RestWithPreview used — byte-identical
  // fallback when there's no bunnyVideoId (legacy URL untouched).
  const { streamUrl: nextBunnyStreamUrl } = useNetworkAwareStreamUrl(nextExercise.bunnyVideoId ?? null);
  const previewVideoUrl = nextBunnyStreamUrl || nextExercise.videoUrl;

  // Collapsed-tile poster: nextExercise.imageUrl already went through the
  // engine's own multi-tier fallback (useExerciseDerivedValues.ts) — trust it
  // first. When it's null but the exercise IS a Bunny video, Bunny renders an
  // auto-generated thumbnail after encoding (buildBunnyThumbnailUrl) — use
  // that instead of leaving the tile blank while collapsed. When NEITHER
  // resolves (or the image URL 404s), showPosterIcon renders a Dumbbell
  // placeholder instead of an empty box.
  const posterUrl = nextExercise.imageUrl || (nextExercise.bunnyVideoId ? buildBunnyThumbnailUrl(nextExercise.bunnyVideoId) : null);
  const showPosterIcon = !posterUrl || posterFailed;

  const nextRepsOrDuration = nextExercise.exerciseType === 'time'
    ? (nextExercise.duration || '')
    : (nextExercise.reps || '');

  const clampedRemaining = Math.max(0, restTimeLeft);
  // Final 3-2-1 — reads the EXISTING rest countdown only, no new timer, no
  // added seconds. A 0-configured-rest transition never has restTimeLeft
  // land in (0, 3], so it's skipped automatically without a separate check.
  const showFinalCountdown = clampedRemaining > 0 && clampedRemaining <= 3;

  return (
    <div
      className={`absolute inset-0 overflow-hidden transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
      dir="rtl"
    >
      <div className="absolute inset-0 bg-white dark:bg-[#0F172A]" />

      {!isLogDrawerOpen && (
        <>
          {/* Top-left — compact next-exercise block: label, portrait tile,
              name and reps/time as plain text below it (never overlaid on
              the image). The wrapper's own width drives the tile's width
              (aspect-ratio handles the height) and the text wrap width, so
              collapsed vs. expanded is one single source of truth. Anchored
              below RunnerHeader's story-bar + button rows so it clears the
              Pause button (physical top-left under this app's dir="rtl"). */}
          <div
            className="absolute z-20 flex flex-col items-start gap-1 transition-all duration-300"
            style={{
              top: 'calc(env(safe-area-inset-top, 44px) + 5.5rem)',
              left: '1rem',
              width: isPreviewExpanded ? 'min(78vw, 360px)' : 84,
            }}
          >
            <p
              className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              התרגיל הבא
            </p>
            <button
              onClick={() => setIsPreviewExpanded((v) => !v)}
              className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-zinc-700 bg-slate-900 transition-all duration-300"
              style={{ aspectRatio: '9 / 16' }}
              aria-label={isPreviewExpanded ? 'כווץ תצוגה מקדימה' : 'הרחב תצוגה מקדימה'}
            >
              {isPreviewExpanded ? (
                <ExerciseVideoPlayer
                  key={`rest-preview-${videoKey}`}
                  exerciseId={`rest-preview-${videoKey}`}
                  videoUrl={previewVideoUrl}
                  exerciseName={nextExercise.name}
                  exerciseType="reps"
                  isPaused={isPaused}
                />
              ) : showPosterIcon ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-700">
                  <Dumbbell size={22} className="text-slate-400" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={posterUrl!}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setPosterFailed(true)}
                />
              )}
            </button>
            <p
              className="text-xs font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 w-full"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {nextExercise.name}
            </p>
            {nextRepsOrDuration && (
              <p
                className="text-[10px] text-slate-400 dark:text-zinc-500 w-full"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {nextRepsOrDuration}
              </p>
            )}
            {nextExercise.notificationText && (
              <p
                className="text-[10px] text-blue-500 dark:text-blue-400 leading-tight w-full"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                💡 {nextExercise.notificationText}
              </p>
            )}
          </div>

          {/* Center — title + countdown + animation */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <p
              className="text-xs text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מנוחה
            </p>
            <div
              className="text-7xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums mb-4"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {formatTime(clampedRemaining)}
            </div>
            <DotLottieReact src={REST_ANIMATION_SRC} loop autoplay style={{ width: 180, height: 180 }} />
          </div>

          {/* Skip rest — only when the caller provides onSkip (non-tabata) */}
          {onSkip && (
            <button
              onClick={onSkip}
              className="absolute z-20 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 py-2 px-5 border border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] bg-white dark:bg-[#0F172A]"
              style={{ bottom: 'max(2rem, env(safe-area-inset-bottom, 24px))', fontFamily: 'var(--font-simpler)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/icons/ui/skip.svg" className="w-4 h-4 dark:invert" alt="Skip" />
              דלגו על המנוחה
            </button>
          )}
        </>
      )}

      {/* LOG_REPS drawer (non-tabata only) */}
      {logDrawerNode && (
        <AnimatePresence>
          {isLogDrawerOpen && (
            <motion.div
              key="log-drawer"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute bottom-0 left-0 right-0 z-50"
            >
              {logDrawerNode}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Final 3-2-1 — prominent full-screen overlay, on top of everything
          above (including the preview tile), covering the final 3 seconds
          of the SAME rest countdown. No new timer: this is `restTimeLeft`
          itself, just rendered bigger while it's low. */}
      <AnimatePresence>
        {showFinalCountdown && (
          <motion.div
            key={`final-countdown-${clampedRemaining}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-[#0F172A]"
          >
            <span
              className="text-9xl font-bold tabular-nums"
              style={{ fontFamily: 'var(--font-simpler)', color: '#93C5FD' }}
            >
              {clampedRemaining}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
