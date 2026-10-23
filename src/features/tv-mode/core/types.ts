/**
 * TV mode — shared plain-data types (enable_tv_mode_v1).
 *
 * `tvSessions/{code}` is created by the server (POST /api/tv/session). The first phone that
 * enters the code claims `hostUid` and is the remote AND the source of truth; the TV only
 * mirrors. Every later phone is a participant (`participants/{uid}`, own doc only).
 * Everything here is plain data so it can be unit-tested without Firestore.
 */

export type TvStatus = 'waiting' | 'lobby' | 'live' | 'ended';

export type TvPhase = 'idle' | 'work' | 'rest' | 'done';

/** Pause-able clock. `anchorMs` (server clock) is the moment `baseMs` was true. */
export interface TvTimer {
  dir: 'down' | 'up' | 'none';
  /** Value of the clock at the anchor, ms. */
  baseMs: number;
  running: boolean;
  /** Total length of the interval being counted (for the progress bar), 0 = unknown. */
  totalMs: number;
}

/** The host phone's view of the workout, mirrored to the TV. Names are data, not UI strings. */
export interface TvMirror {
  v: 1;
  /** Monotonic per host — a late snapshot never wins. */
  seq: number;
  phase: TvPhase;
  paused: boolean;
  exerciseIndex: number;
  exerciseCount: number;
  exerciseId?: string;
  exerciseName: string;
  nextExerciseName?: string;
  /** 1-based. */
  setIndex: number;
  setCount: number;
  repsMin?: number;
  repsMax?: number;
  holdSec?: number;
  timer: TvTimer;
  /** Alone or with the participants ("ביחד" chip). */
  together: boolean;
}

export interface TvWorkoutInfo {
  title: string;
  kind: 'strength' | 'timed';
  durationMin: number;
  exerciseCount: number;
  /** sharedWorkouts/{id} — what a participant opens to train the same workout. */
  sharedWorkoutId?: string;
}

export type TvCommandType = 'volume' | 'mute' | 'end';

/** Host → TV one-shot instruction. Applied once per `seq`. */
export interface TvCommand {
  seq: number;
  type: TvCommandType;
  /** volume: 0..1 · mute: 0|1 */
  value?: number;
}

/** Session doc as the app reads it (timestamps already turned into ms). */
export interface TvSession {
  code: string;
  hostUid: string | null;
  hostName: string | null;
  hostGender: 'male' | 'female' | 'other' | null;
  status: TvStatus;
  createdAtMs: number;
  expiresAtMs: number;
  /** Server-stamped by the host every TV_HEARTBEAT_MS, null before the first beat. */
  hostBeatAtMs: number | null;
  workout: TvWorkoutInfo | null;
  mirror: TvMirror | null;
  /** Server time of the last timer change, null when the timer was never set. */
  timerAnchorAtMs: number | null;
  volume: number;
  cmd: TvCommand | null;
}

export type TvParticipantState = 'joined' | 'active' | 'resting' | 'done' | 'left';

export interface TvParticipant {
  uid: string;
  /** Nickname (guest) or first name (account) — it is shown on a shared screen. */
  name: string;
  joinedAtMs: number;
  /** Default avatar index 0..TV_AVATAR_COUNT-1 (colour). Frozen after the first write. */
  avatar: number;
  state: TvParticipantState;
  set?: number;
  totalSets?: number;
  seq: number;
}

export type TvJoinRole = 'host' | 'participant';

export type TvJoinError =
  | 'not-found'
  | 'expired'
  | 'ended'
  | 'offline'
  | 'unknown'
  /** A guest reached a code nobody hosts yet: only a signed-in account can host. */
  | 'host-required'
  | 'invalid-nickname';

export type TvJoinResult =
  | { ok: true; role: TvJoinRole; session: TvSession }
  | { ok: false; error: TvJoinError };

export type Unsubscribe = () => void;
