import { timerProgress, timerReading } from '../core/mirror';
import { TV_MAX_PARTICIPANTS } from '../core/constants';
import type { TvMedia, TvMirror, TvMode, TvParticipant } from '../core/types';

export type StageTone = 'accent' | 'warn' | 'ok' | 'idle';

/**
 * Everything the TV stage draws, as data. This is the seam to the wide player (#768,
 * enable_wide_player_v1): when it lands, the adapter maps this model onto its WideHeroClock /
 * WideSplit / WideNextUp slots instead of the stand-in layout below — no change upstream of here.
 */
export interface WideStageModel {
  phase: TvMirror['phase'];
  paused: boolean;
  clockMs: number;
  /** false = no clock for this phase (idle / done / reps with no timer). */
  hasClock: boolean;
  progress: number;
  tone: StageTone;
  exerciseName: string;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  setCount: number;
  repsMin?: number;
  repsMax?: number;
  holdSec?: number;
  nextName?: string;
  /** Media of what is on screen (during a rest: the exercise that comes next). */
  media?: TvMedia;
  /** Media of the next-up card. */
  nextMedia?: TvMedia;
  mode: TvMode;
  /** The clock is counting down right now (drives the countdown beeps). */
  clockRunningDown: boolean;
  /** At most TV_MAX_PARTICIPANTS people; the rest are counted. */
  friends: TvParticipant[];
  moreFriends: number;
  hostUid: string | null;
}

export function buildStageModel(args: {
  mirror: TvMirror;
  timerAnchorAtMs: number | null;
  serverNowMs: number;
  friends: TvParticipant[];
  hostUid?: string | null;
}): WideStageModel {
  const { mirror, timerAnchorAtMs, serverNowMs, friends } = args;
  const clockMs = timerReading(mirror.timer, timerAnchorAtMs, serverNowMs);
  const tone: StageTone = mirror.paused ? 'idle' : mirror.phase === 'rest' ? 'ok' : mirror.phase === 'work' && mirror.timer.dir === 'down' && clockMs <= 5000 && mirror.timer.running ? 'warn' : 'accent';
  return {
    phase: mirror.phase,
    paused: mirror.paused,
    clockMs,
    hasClock: mirror.timer.dir !== 'none',
    progress: timerProgress(mirror.timer, clockMs),
    tone,
    exerciseName: mirror.exerciseName,
    exerciseIndex: mirror.exerciseIndex,
    exerciseCount: mirror.exerciseCount,
    setIndex: mirror.setIndex,
    setCount: mirror.setCount,
    repsMin: mirror.repsMin,
    repsMax: mirror.repsMax,
    holdSec: mirror.holdSec,
    nextName: mirror.nextExerciseName,
    media: mirror.phase === 'rest' ? (mirror.nextMedia ?? mirror.media) : mirror.media,
    nextMedia: mirror.nextMedia,
    mode: mirror.mode ?? 'strength',
    clockRunningDown: mirror.timer.dir === 'down' && mirror.timer.running && !mirror.paused && mirror.phase !== 'done',
    // The host is one of the friends on the screen — equal list, no ranking.
    friends: friends.slice(0, TV_MAX_PARTICIPANTS),
    moreFriends: Math.max(0, friends.length - TV_MAX_PARTICIPANTS),
    hostUid: args.hostUid ?? null,
  };
}
