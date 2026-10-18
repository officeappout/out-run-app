'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Lightbulb, Volume2, VolumeX, Timer } from 'lucide-react';
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import type { NextExerciseInfo } from '../hooks/useWorkoutStateMachine';
import { useNetworkAwareStreamUrl } from '@/features/content/exercises/client/hooks/useNetworkAwareStreamUrl';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import { usePlayerAudioMute } from '../logic/player-audio-mute';
import { REST_EXTEND_SECONDS } from '../logic/player-controls.utils';
import { useStrengthPlayerV2 } from '../context/StrengthPlayerV2Context';

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
 *     thumbnail tile, the exercise name and reps/time — all as plain text
 *     below the tile, never overlaid on the image. (The coach-hint/prep note
 *     now sits under the center countdown — full width, 13px, up to 2
 *     lines.) This is the SINGLE place next-exercise name/reps/notes are
 *     shown; RunnerHeader's own row 3 and prep-cue
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
/** PR-B1 guided: how long the auto-expanded next-exercise tile stays open. */
export const REST_PREVIEW_AUTO_COLLAPSE_MS = 4000;

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
  /** Skip-rest action. Omit entirely to hide the button. (Tabata rest now passes it too — G2.4.) */
  onSkip?: () => void;
  /** "+15 שנ׳" — extend the current rest. Omit to hide (tabata keeps its fixed protocol rest). */
  onExtend?: () => void;
  /** PR-B1 guided: the next-exercise tile starts EXPANDED and collapses after
   *  REST_PREVIEW_AUTO_COLLAPSE_MS, through the same toggle the user taps. Omitted → unchanged. */
  autoExpandPreview?: boolean;
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
  onExtend,
  autoExpandPreview = false,
  logDrawerNode,
  isLogDrawerOpen = false,
}: RestScreenProps) {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(autoExpandPreview);
  // Guided: expand on every new rest (videoKey changes per next exercise), collapse after ~4s.
  // A user tap in between still toggles freely; the timer only ever collapses.
  useEffect(() => {
    if (!autoExpandPreview) return;
    setIsPreviewExpanded(true);
    const t = setTimeout(() => setIsPreviewExpanded(false), REST_PREVIEW_AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [autoExpandPreview, videoKey]);
  const [posterFailed, setPosterFailed] = useState(false);
  // enable_home_v2 — styling only (provided once by StrengthRunner).
  const v2 = useStrengthPlayerV2();
  // Session-wide mute for countdown beeps (and later voice) — see player-audio-mute.ts.
  const audioMuted = usePlayerAudioMute((st) => st.muted);
  const toggleAudioMuted = usePlayerAudioMute((st) => st.toggleMuted);

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
      <div className={v2 ? 'absolute inset-0 bg-v2-surface' : 'absolute inset-0 bg-white dark:bg-[#0F172A]'} />

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
              className={v2 ? 'text-[12px] font-extrabold text-v2-deep whitespace-nowrap' : 'text-[11px] font-bold text-slate-700 dark:text-zinc-200 uppercase tracking-wider'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              התרגיל הבא
            </p>
            <button
              onClick={() => setIsPreviewExpanded((v) => !v)}
              className={v2
                ? 'relative w-full rounded-[18px] overflow-hidden bg-v2-tint shadow-v2-card transition-all duration-300 ease-v2 active:scale-[0.97]'
                : 'relative w-full rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-zinc-700 bg-slate-900 transition-all duration-300'}
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
                <div className={v2 ? 'absolute inset-0 flex items-center justify-center bg-v2-tint' : 'absolute inset-0 flex items-center justify-center bg-slate-700'}>
                  <Dumbbell size={22} className={v2 ? 'text-v2-accent' : 'text-slate-400'} />
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
              className={v2 ? 'text-[13px] font-extrabold text-v2-ink leading-tight line-clamp-2 w-full' : 'text-xs font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 w-full'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {nextExercise.name}
            </p>
            {nextRepsOrDuration && (
              <p
                className={v2 ? 'text-[12px] font-bold text-v2-muted w-full truncate whitespace-nowrap' : 'text-[10px] text-slate-400 dark:text-zinc-500 w-full'}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {nextRepsOrDuration}
              </p>
            )}
          </div>

          {/* Center — title + countdown + animation */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <p
              className={v2 ? 'text-[13px] font-extrabold text-v2-deep whitespace-nowrap mb-2' : 'text-xs text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מנוחה
            </p>
            <div
              className={v2 ? 'text-7xl font-black text-v2-ink !tracking-[-0.03em] tabular-nums mb-4' : 'text-7xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums mb-4'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {formatTime(clampedRemaining)}
            </div>
            {/* Prep note for the next exercise (its engine-selected method's
                notificationText). Full width under the countdown — it was a
                10px line squeezed into the 84px tile column, unreadable. */}
            {nextExercise.notificationText && (
              <p
                className={v2 ? 'w-full max-w-sm text-center text-[13px] font-bold text-v2-deep leading-snug line-clamp-2 mb-2' : 'w-full max-w-sm text-center text-[13px] text-blue-500 dark:text-blue-400 leading-snug line-clamp-2 mb-2'}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {v2 ? (
                  <Lightbulb size={15} strokeWidth={2.5} className="inline-block align-[-3px] me-1 text-v2-accent" aria-hidden />
                ) : '💡 '}{nextExercise.notificationText}
              </p>
            )}
            <DotLottieReact src={REST_ANIMATION_SRC} loop autoplay style={{ width: 180, height: 180 }} />
          </div>

          {/* Secondary rest controls (G2.4) — mute (every rest, incl. tabata) + "+15 שנ׳"
              (when the caller provides onExtend). Text + icon, above the skip button. */}
          <div
            className="absolute z-20 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2"
            style={{ bottom: onSkip ? `calc(max(2rem, env(safe-area-inset-bottom, 24px)) + ${v2 ? 56 : 48}px)` : 'max(2rem, env(safe-area-inset-bottom, 24px))' }}
          >
            <button
              type="button"
              onClick={toggleAudioMuted}
              aria-pressed={audioMuted}
              className={v2
                ? `flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-extrabold whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2 ${audioMuted ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'}`
                : 'flex items-center gap-1.5 py-2 px-4 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-500 dark:text-zinc-400 bg-white dark:bg-[#0F172A] active:scale-[0.98] transition-all'}
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {v2 ? (
                audioMuted ? <VolumeX size={16} strokeWidth={2.5} aria-hidden /> : <Volume2 size={16} strokeWidth={2.5} aria-hidden />
              ) : (
                <span aria-hidden>{audioMuted ? '🔇' : '🔊'}</span>
              )}
              {audioMuted ? 'מושתק' : 'השתקה'}
            </button>
            {onExtend && (
              <button
                type="button"
                onClick={onExtend}
                className={v2 ? 'flex items-center gap-1.5 h-9 px-4 rounded-full bg-white shadow-v2-ring text-[13px] font-extrabold text-v2-ink-2 whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2' : 'flex items-center gap-1.5 py-2 px-4 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-500 dark:text-zinc-400 bg-white dark:bg-[#0F172A] active:scale-[0.98] transition-all'}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {v2 ? <Timer size={16} strokeWidth={2.5} aria-hidden /> : <span aria-hidden>⏱️</span>}
                <bdi dir="ltr">+{REST_EXTEND_SECONDS}</bdi> שנ׳
              </button>
            )}
          </div>

          {/* Skip rest — whenever the caller provides onSkip (incl. tabata since G2.4) */}
          {onSkip && (
            <button
              onClick={onSkip}
              className={v2
                ? 'absolute z-20 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-v2-cta text-v2-on-cta shadow-v2-cta text-[15px] font-extrabold whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2'
                : 'absolute z-20 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 py-2 px-5 border border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] bg-white dark:bg-[#0F172A]'}
              style={{ bottom: 'max(2rem, env(safe-area-inset-bottom, 24px))', fontFamily: 'var(--font-simpler)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/icons/ui/skip.svg" className={v2 ? 'w-4 h-4' : 'w-4 h-4 dark:invert'} alt="Skip" />
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
            className={v2 ? 'absolute inset-0 z-30 flex items-center justify-center bg-v2-surface' : 'absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-[#0F172A]'}
          >
            <span
              className={v2 ? 'text-9xl font-black tabular-nums text-v2-accent' : 'text-9xl font-bold tabular-nums'}
              style={v2 ? { fontFamily: 'var(--font-simpler)' } : { fontFamily: 'var(--font-simpler)', color: '#93C5FD' }}
            >
              {clampedRemaining}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
