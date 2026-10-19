/**
 * timed.types — vocabulary of the timed-format engine (tabata / EMOM / AMRAP).
 *
 * The configs are the EXISTING protocol configs (core/types/protocol.types):
 * a segment's `protocol` + `protocolConfig` is all the engine needs. A round
 * item may be an exercise or an aerobic leg (the RoundItem union that already
 * exists for "run 300 m inside a round", board U-E3).
 *
 * All times inside the state are ACTIVE milliseconds since the block started
 * (pauses excluded), so the state is a pure function of its events.
 */
import type {
  AmrapProtocolConfig,
  EmomProtocolConfig,
  TabataProtocolConfig,
} from '../../core/types/protocol.types';

export type TimedFormat = 'tabata' | 'emom' | 'amrap';

/** One thing the user does inside a timed block. */
export interface TimedItem {
  kind: 'exercise' | 'aerobic_leg';
  /** Stable key inside the block (exercise id, or `run-<n>`). */
  key: string;
  exerciseId?: string;
  name: string;
  imageUrl?: string;
  targetReps?: number;
  targetHoldSec?: number;
  /** Tabata: a unilateral member takes two intervals (right, then left). */
  isUnilateral?: boolean;
  /** Aerobic leg target (one of the two). */
  distanceM?: number;
  durationSec?: number;
}

export type TimedBlockSpec =
  | { format: 'tabata'; config: TabataProtocolConfig; items: TimedItem[] }
  | { format: 'emom'; config: EmomProtocolConfig; items: TimedItem[] }
  | { format: 'amrap'; config: AmrapProtocolConfig; items: TimedItem[] };

export interface TimedOptions {
  /** Seconds before a phase end that emit a countdown cue (default 3,2,1). */
  countdownSec?: number[];
  /** The "last seconds" window (orange timer) — default 5 s. */
  lastSecondsWindowSec?: number;
  /**
   * EMOM: a "done" tap this soon after a new minute starts is credited to
   * the minute that just ended (the user tapped as the minute rolled over).
   * Default 1000 ms. 0 disables.
   */
  emomGraceMs?: number;
  /** Countdown cues older than this are dropped (app resumed from background). */
  staleCueMs?: number;
}

export type TimedStatus = 'idle' | 'running' | 'paused' | 'awaiting_partial' | 'done';

export interface TimedClock {
  /** Wall ms of START. */
  startedAtMs: number | null;
  /** Wall ms the current pause began (null when not paused). */
  pausedAtMs: number | null;
  /** Total paused wall ms before the current pause. */
  pausedTotalMs: number;
  /** Active ms at which the clock froze (cap / end / finish). */
  frozenActiveMs: number | null;
  /** Wall ms of the end of the block. */
  endedAtMs: number | null;
}

/** Live progress of an aerobic item (leg-relative). */
export interface AerobicProgress {
  distanceM: number;
  /** Which item visit the distance belongs to (EMOM minute / AMRAP visit number). */
  ownerIndex: number;
}

// ── Per-format records ───────────────────────────────────────────────────────

export interface TabataInterval {
  index: number;
  itemIndex: number;
  side: 'right' | 'left' | null;
}

export interface TabataData {
  intervals: TabataInterval[];
  /** Reps the user entered for an interval (reps exercises), by interval index. */
  reps: Array<number | null>;
}

export type EmomMinuteStatus = 'pending' | 'done' | 'partial' | 'missed';

export interface EmomMinute {
  index: number;
  itemIndex: number;
  status: EmomMinuteStatus;
  /** Active ms from the minute start to "done" (null until done). */
  workMs: number | null;
  reps: number | null;
  /** True when the reps were entered by the user (not the prefilled target). */
  repsEdited: boolean;
  /** Aerobic item: distance covered in the minute. */
  distanceM: number | null;
}

export interface EmomData {
  minutes: EmomMinute[];
  aerobic: AerobicProgress;
}

export interface AmrapItemRecord {
  itemIndex: number;
  reps: number | null;
  repsEdited: boolean;
  durationMs: number;
  distanceM: number | null;
  /** True for the item that was cut by the cap (partial). */
  partial: boolean;
}

export interface AmrapRound {
  index: number;
  startedActiveMs: number;
  endedActiveMs: number | null;
  items: AmrapItemRecord[];
}

export interface AmrapData {
  /** Completed rounds + the current (open) one, last. */
  rounds: AmrapRound[];
  /** Position of the current item inside the round. */
  itemIndex: number;
  itemStartedActiveMs: number;
  aerobic: AerobicProgress;
}

interface TimedStateBase {
  status: TimedStatus;
  clock: TimedClock;
  options: Required<TimedOptions>;
  log: string[];
}

export type TimedState =
  | (TimedStateBase & { spec: Extract<TimedBlockSpec, { format: 'tabata' }>; data: TabataData })
  | (TimedStateBase & { spec: Extract<TimedBlockSpec, { format: 'emom' }>; data: EmomData })
  | (TimedStateBase & { spec: Extract<TimedBlockSpec, { format: 'amrap' }>; data: AmrapData });

export type TabataState = Extract<TimedState, { spec: { format: 'tabata' } }>;
export type EmomState = Extract<TimedState, { spec: { format: 'emom' } }>;
export type AmrapState = Extract<TimedState, { spec: { format: 'amrap' } }>;

export type TimedEvent =
  | { type: 'START'; atMs: number }
  | { type: 'PAUSE'; atMs: number }
  | { type: 'RESUME'; atMs: number }
  /** Re-sync to the clock (display tick / app resumed). Never accumulates. */
  | { type: 'TICK'; atMs: number }
  /** "סיימתי" — AMRAP: the current item; EMOM: this minute's work. */
  | { type: 'ITEM_DONE'; atMs: number; reps?: number }
  /** Live distance on the current aerobic item (leg-relative metres). */
  | { type: 'AEROBIC_PROGRESS'; atMs: number; distanceM: number }
  /**
   * Enter reps. AMRAP: the partial item at the cap. EMOM: a minute
   * (`index`, default = the latest minute that is not done). Tabata: an
   * interval (`index`, default = the current / last one).
   */
  | { type: 'LOG_REPS'; atMs: number; reps: number; index?: number }
  /** Stop the block early (user ended the workout). */
  | { type: 'FINISH'; atMs: number };

export type TimedPhase = 'idle' | 'work' | 'rest' | 'aerobic' | 'awaiting_partial' | 'paused' | 'done';

export type TimedCue =
  | { type: 'phase_start'; phase: 'work' | 'rest'; atActiveMs: number; index: number }
  | { type: 'countdown'; secondsLeft: number; atActiveMs: number }
  | { type: 'minute_start'; minute: number; atActiveMs: number }
  | { type: 'cap_reached'; atActiveMs: number }
  | { type: 'block_end'; atActiveMs: number };
