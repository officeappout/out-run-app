/**
 * strength-snapshot — what the strength player tells TV mode about itself (pure, no React).
 * `buildStrengthSnapshot` maps the state machine's values onto the player-agnostic RunnerSnapshot.
 */
import { buildBunnyStreamUrl } from '@/lib/bunny/bunny.config';
import { buildTvMedia } from '@/features/tv-mode/core/media';
import { ageTimer } from '@/features/tv-mode/core/runner-timer';
import { IDLE_SNAPSHOT_TIMER, type RunnerSnapshot } from '@/features/tv-mode/core/runner-snapshot';
import type { TvMedia, TvTimer } from '@/features/tv-mode/core/types';
import type { CardClockReport } from './card-clock';

const bunnyMp4 = (id: string) => buildBunnyStreamUrl(id, 720);

export const tvMediaFor = (src: { videoUrl?: string | null; bunnyVideoId?: string | null; imageUrl?: string | null }): TvMedia | undefined => buildTvMedia(src, bunnyMp4);

export interface StrengthFacts {
  nowMs: number;
  workoutState: string;
  paused: boolean;
  segmentIndex: number;
  exerciseIndex: number;
  /** Exercises per segment, in order — "exercise n of m" counts exercises, not sets. */
  segmentSizes: number[];
  exerciseId?: string;
  exerciseName: string;
  nextName?: string;
  round: number;
  totalRounds: number;
  repsMin?: number;
  repsMax?: number;
  targetReps?: number;
  /** The ACTIVE exercise runs on the timer card (hold / time / tabata work interval). */
  clockDriven: boolean;
  /** Seconds of the hold / work interval. */
  durationSec?: number;
  isTabata: boolean;
  restLeftSec: number;
  /** Longest rest seen in this RESTING stretch (for the progress bar). */
  restTotalSec: number;
  card: CardClockReport | null;
  media?: TvMedia;
  nextMedia?: TvMedia;
}

/** The card's clock as a TvTimer, true at `nowMs`. */
export function cardTimer(card: CardClockReport | null, nowMs: number): TvTimer {
  if (!card || card.phase === 'idle') return IDLE_SNAPSHOT_TIMER;
  const running = !card.paused;
  let t: TvTimer;
  if (card.phase === 'preparing') {
    t = { dir: 'down', baseMs: Math.max(0, card.prepLeftSec) * 1000, running, totalMs: Math.max(0, card.prepTotalSec) * 1000 };
  } else if (card.phase === 'counting') {
    t = { dir: 'down', baseMs: Math.max(0, card.durationSec - card.elapsedSec) * 1000, running, totalMs: card.durationSec * 1000 };
  } else {
    t = { dir: 'up', baseMs: Math.max(0, card.elapsedSec - card.durationSec) * 1000, running, totalMs: 0 };
  }
  return ageTimer(t, nowMs - card.at);
}

export function buildStrengthSnapshot(f: StrengthFacts): RunnerSnapshot {
  const resting = f.workoutState === 'RESTING';
  const clockActive = f.workoutState === 'ACTIVE' && f.clockDriven;
  let timer: TvTimer = IDLE_SNAPSHOT_TIMER;
  if (resting) {
    timer = { dir: 'down', baseMs: Math.max(0, f.restLeftSec) * 1000, running: !f.paused, totalMs: Math.max(f.restTotalSec, f.restLeftSec) * 1000 };
  } else if (clockActive) {
    timer = cardTimer(f.card, f.nowMs);
  }
  const lo = f.repsMin ?? (f.targetReps && f.targetReps > 0 ? f.targetReps : undefined);
  const hi = f.repsMax ?? lo;
  const before = f.segmentSizes.slice(0, f.segmentIndex).reduce((a, b) => a + b, 0);
  const total = f.segmentSizes.reduce((a, b) => a + b, 0);
  return {
    exerciseKey: `${f.segmentIndex}:${f.exerciseIndex}:${f.exerciseId ?? ''}`,
    exerciseIndex: before + f.exerciseIndex,
    exerciseCount: total,
    exerciseId: f.exerciseId,
    exerciseName: f.exerciseName,
    nextExerciseName: f.nextName || undefined,
    media: f.media,
    nextMedia: f.nextMedia,
    mode: f.isTabata ? 'tabata' : 'strength',
    setIndex: f.round,
    setCount: f.totalRounds,
    ...(f.clockDriven ? { holdSec: f.durationSec || undefined } : lo != null ? { repsMin: lo, repsMax: hi } : {}),
    phase: resting ? 'rest' : f.workoutState === 'PREPARING' ? 'idle' : 'work',
    paused: f.paused || (clockActive && !!f.card?.paused),
    timer,
    together: false,
  };
}
