'use client';

import React from 'react';
import { Play, Check, PersonStanding } from 'lucide-react';
import WorkoutStoryBars from './WorkoutStoryBars';
import {
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

/**
 * RunnerHeader — gradient overlay header for the live workout player.
 *
 * Three rows of metadata sitting at z-45 above the state-content layer:
 *   • Row 1 — WorkoutStoryBars (segment progress dots/bars)
 *   • Row 2 — left: minimize button, center: timer/title, right: pause button
 *   • Row 2.5 — set pills (only on multi-round, non-warmup/cooldown segments)
 *   • Row 3 — during REST: equipment pills + next-exercise name/reps
 *   • Banner — during REST: preparation cue ("💡 ...")
 *
 * Also doubles as the framer-motion drag handle (touch-action: none + pointer-down
 * routed to the parent's dragControls.start).
 *
 * Pure presentational — no state, no refs.  All wiring through typed props.
 *
 * Named `RunnerHeader` (not `WorkoutHeader`) to avoid collision with the
 * existing `WorkoutHeader.tsx` workout-preview header in this same folder.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-8).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProgressBar = any;

export interface RestPreviewExerciseShape {
  name: string;
  reps?: string | null;
  equipment: string[];
  notificationText?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export interface RunnerHeaderProps {
  /** Segment progress bar definitions piped to WorkoutStoryBars. */
  progressBars: ProgressBar[];
  /** Autocomplete duration for the active progress bar (drives its fill animation). */
  autoCompleteTime: number;
  /** Whether the workout is currently paused — flips the pause/play icon. */
  isPaused: boolean;
  /** Whether the bottom log drawer is open — flips the center title to "התרגיל שביצעת". */
  isLogDrawerOpen: boolean;
  /** Whether the player is in the RESTING state — drives row 3 content + padding. */
  isResting: boolean;
  /** Live elapsed time in seconds — formatted by `formatTime` for the center title. */
  elapsedTime: number;
  /** Time formatter (e.g. "12:34"). */
  formatTime: (t: number) => string;
  /** Total rounds for the active exercise — drives set-pills visibility. */
  totalRounds: number;
  /** 1-based current round for the active exercise. */
  currentRound: number;
  /** Tabata interval position (1-based / total) — replaces the set pills inside a tabata block. */
  tabataInterval?: { current: number; total: number } | null;
  /** True for a machine-tabata block (orderMode === 'exercise-major') — hides
   *  this top "אינטרוול X/4" row entirely, since the equivalent "מתקן X/2 ·
   *  סבב Y/2" label now lives next to the "טבטה" badge on the work card
   *  (16.09.2026). General-finisher tabata (no bottom label) is unaffected. */
  isMachineTabata?: boolean;
  /** Whether the active segment is the warmup (suppresses set pills). */
  isWarmupSegment: boolean;
  /** Whether the active segment is the cooldown (suppresses set pills). */
  isCooldownSegment: boolean;
  /** Per-set logged reps (parallel to the playlist pills). */
  currentExLoggedReps: (number | null)[];
  /** Index of the first incomplete set (or -1 if all logged). */
  firstIncompleteSetIdx: number;
  /** Snapshot of the next exercise (used by row 3's equipment pills during REST). */
  restPreviewExercise: RestPreviewExerciseShape;
  /** Workout location (gym / outdoor / home) — drives equipment SVG resolution. */
  workoutLocation?: string;
  /** Whether the NEXT exercise is the superset partner (drives A→B transition cue). */
  isNextPartnerExercise: boolean;
  /** Name of the superset partner exercise (for both cycle prefix and A→B cue). */
  supersetPartnerName: string | null;
  /** Header pointer-down handler — starts the framer-motion drag gesture. */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Minimize button → collapses the player into the mini-player bar. */
  onMinimize: () => void;
  /** B2: hide the minimize button (a hybrid station has no mini-player bar). A
   *  spacer preserves the title's centering. Default false → standalone unchanged. */
  hideMinimize?: boolean;
  /** Pause button → toggles workout pause state. */
  onTogglePause: () => void;
}

export default function RunnerHeader({
  progressBars,
  autoCompleteTime,
  isPaused,
  isLogDrawerOpen,
  isResting,
  elapsedTime,
  formatTime,
  totalRounds,
  currentRound,
  tabataInterval,
  isMachineTabata = false,
  isWarmupSegment,
  isCooldownSegment,
  currentExLoggedReps,
  firstIncompleteSetIdx,
  restPreviewExercise,
  workoutLocation,
  isNextPartnerExercise,
  supersetPartnerName,
  onPointerDown,
  onMinimize,
  hideMinimize = false,
  onTogglePause,
}: RunnerHeaderProps) {
  return (
    <div
      className={`absolute top-0 left-0 right-0 z-[45] transition-all duration-300 ${
        isResting ? 'pb-20' : 'pb-16'
      }`}
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 35%, rgba(255,255,255,0.85) 55%, rgba(255,255,255,0.5) 75%, rgba(255,255,255,0.15) 90%, rgba(255,255,255,0) 100%)',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
    >
      <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 0.75rem)' }}>
        {/* Row 1: Story Bars */}
        <div className="mb-3">
          <WorkoutStoryBars
            progressBars={progressBars}
            activeBarDuration={autoCompleteTime}
            isPaused={isPaused}
            isResting={isResting}
          />
        </div>

        {/* Row 2: List | Timer/Title (centered) | Pause */}
        <div className="flex items-center mb-2">
          {/* B2: minimize collapses to the mini-player bar — meaningless inside a
              hybrid station, so hide it there. The invisible spacer keeps the
              centered title balanced against the pause button on the right. */}
          {hideMinimize ? (
            <div className="w-10 h-10" aria-hidden />
          ) : (
            <button
              onClick={onMinimize}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <img src="/assets/icons/ui/list.svg" className="w-5 h-5 dark:invert" alt="List" />
            </button>
          )}

          <div
            className="flex-1 text-center text-slate-900 dark:text-white font-bold text-xl tracking-wider tabular-nums"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {isPaused
              ? 'הפסקה'
              : isLogDrawerOpen
                ? 'התרגיל שביצעת'
                : isResting
                  ? 'מנוחה'
                  : formatTime(elapsedTime)}
          </div>

          <button
            onClick={onTogglePause}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            {isPaused ? (
              <Play size={18} className="text-slate-800" fill="currentColor" />
            ) : (
              <img src="/assets/icons/ui/pause.svg" className="w-5 h-5 dark:invert" alt="Pause" />
            )}
          </button>
        </div>

        {/* Tabata interval counter — replaces the (misleading) set pills inside a
            block. tabataInterval is non-null ONLY for a tabata segment (work
            AND rest alike — its own computation doesn't gate on isResting),
            so this condition alone already scopes the extension below to
            tabata; every other exercise type/state is untouched. During rest
            the number steps forward by one (capped at total) so it reads as
            "who's coming up", matching the next-exercise name shown alongside
            it on the rest card — during work it's simply the live interval. */}
        {tabataInterval && !isMachineTabata && (
          <div className="flex justify-center mb-2">
            <span
              className="text-[11px] font-bold text-[#00BAF7] uppercase tracking-wider tabular-nums"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              אינטרוול {isResting
                ? Math.min(tabataInterval.current + 1, tabataInterval.total)
                : tabataInterval.current}/{tabataInterval.total}
            </span>
          </div>
        )}

        {/* Set Pills — reactive to exerciseLogSnapshot */}
        {!isResting && !tabataInterval && totalRounds > 1 && !isWarmupSegment && !isCooldownSegment && (
          <div className="flex justify-end gap-1.5 mb-2">
            {currentExLoggedReps.map((reps, i) => {
              const isLogged = reps !== null;
              const isCurrentActive = i === (firstIncompleteSetIdx >= 0 ? firstIncompleteSetIdx : currentRound - 1);
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

        {/* Row 3: Equipment Pills (right/RTL) | superset cue (left/RTL).
            Name/reps used to live here too, but RestScreen's own top-left
            block (16.09.2026) now shows name+reps+notes once, in one place —
            duplicating them here read as the exact same info appearing both
            above and below RestScreen's tile. The superset A→B cue stays:
            it's not shown anywhere else. */}
        {isResting && !isLogDrawerOpen ? (
          <div className="flex flex-row-reverse items-center justify-between w-full py-1" dir="rtl">
            {restPreviewExercise.equipment.length > 0 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {restPreviewExercise.equipment.map((eqId: string) => {
                  const svgPaths = resolveEquipmentSvgPathList(eqId, workoutLocation);
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
            {isNextPartnerExercise && supersetPartnerName && (
              <div className="flex flex-col items-start min-w-0">
                <p
                  className="font-semibold text-violet-500 dark:text-violet-400 truncate max-w-full"
                  style={{ fontFamily: 'var(--font-simpler)', fontSize: '12px', lineHeight: '18px' }}
                >
                  מעבר לבן זוג הסופרסט: {supersetPartnerName}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
