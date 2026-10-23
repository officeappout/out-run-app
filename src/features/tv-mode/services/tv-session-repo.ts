import type {
  TvCommand,
  TvJoinResult,
  TvMirror,
  TvParticipant,
  TvSession,
  TvWorkoutInfo,
  Unsubscribe,
} from '../core/types';

export interface TvUser {
  uid: string;
  /** Shown on the shared screen: callers pass the FIRST name only. */
  name: string;
  gender?: 'male' | 'female' | 'other' | null;
}

export type PresencePatch = Pick<TvParticipant, 'state' | 'set' | 'totalSets' | 'seq'>;

/**
 * Storage seam for tvSessions/{code}: Firestore in the app, in-memory in tests.
 * The session doc is CREATED by the server (POST /api/tv/session), never by a client.
 */
export interface TvSessionRepo {
  subscribeSession(code: string, onSession: (s: TvSession | null) => void, onError?: (e: unknown) => void): Unsubscribe;
  subscribeParticipants(code: string, onList: (list: TvParticipant[]) => void, onError?: (e: unknown) => void): Unsubscribe;

  /** First caller on a free session = host (one transaction); everyone else = participant. */
  join(code: string, user: TvUser): Promise<TvJoinResult>;
  /** Host only: attach the workout that is about to be shown (lobby). */
  setWorkout(code: string, workout: TvWorkoutInfo): Promise<void>;
  /** Host only: lobby → live. */
  startWorkout(code: string): Promise<void>;
  /** Host only: the mirrored state. `restampTimer` = the clock changed, stamp a fresh server anchor. */
  writeMirror(code: string, mirror: TvMirror, restampTimer: boolean): Promise<void>;
  /** Host only: liveness (server-stamped). */
  beat(code: string): Promise<void>;
  /** Host only: volume / mute / end. */
  sendCommand(code: string, cmd: TvCommand): Promise<void>;
  /** Host only: end the session for everyone. */
  end(code: string): Promise<void>;

  /** A participant's own presence (own doc only). */
  publishPresence(code: string, uid: string, patch: PresencePatch): Promise<void>;
  leave(code: string, uid: string): Promise<void>;
}
