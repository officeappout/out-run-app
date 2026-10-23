import { TV_AVATAR_COUNT } from '../core/constants';
import { NO_TIMER } from '../core/mirror';
import { defaultAvatar } from '../core/participants';
import type {
  TvCommand,
  TvMirror,
  TvParticipant,
  TvParticipantState,
  TvPhase,
  TvSession,
  TvStatus,
  TvTimer,
  TvWorkoutInfo,
} from '../core/types';

/** Defensive parsers: a doc is data from the network — never assume a field exists. */

type Raw = Record<string, unknown> | undefined | null;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** Firestore Timestamp (or anything with toMillis / a millis number) → ms. */
export function tsMs(v: unknown): number | null {
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return num(v) ?? null;
}

const STATUSES: TvStatus[] = ['waiting', 'lobby', 'live', 'ended'];
const PHASES: TvPhase[] = ['idle', 'work', 'rest', 'done'];
const P_STATES: TvParticipantState[] = ['joined', 'active', 'resting', 'done', 'left'];

function parseTimer(raw: unknown): TvTimer {
  const t = obj(raw);
  if (!t) return NO_TIMER;
  const dir = t.dir === 'down' || t.dir === 'up' ? t.dir : 'none';
  return { dir, baseMs: Math.max(0, num(t.baseMs) ?? 0), running: t.running === true, totalMs: Math.max(0, num(t.totalMs) ?? 0) };
}

export function parseMirror(raw: unknown): TvMirror | null {
  const m = obj(raw);
  if (!m || m.v !== 1) return null;
  return {
    v: 1,
    seq: num(m.seq) ?? 0,
    phase: PHASES.includes(m.phase as TvPhase) ? (m.phase as TvPhase) : 'idle',
    paused: m.paused === true,
    exerciseIndex: num(m.exerciseIndex) ?? 0,
    exerciseCount: num(m.exerciseCount) ?? 0,
    ...(str(m.exerciseId) ? { exerciseId: str(m.exerciseId) } : {}),
    exerciseName: str(m.exerciseName) ?? '',
    ...(str(m.nextExerciseName) ? { nextExerciseName: str(m.nextExerciseName) } : {}),
    setIndex: Math.max(1, num(m.setIndex) ?? 1),
    setCount: Math.max(1, num(m.setCount) ?? 1),
    ...(num(m.repsMin) != null ? { repsMin: num(m.repsMin) } : {}),
    ...(num(m.repsMax) != null ? { repsMax: num(m.repsMax) } : {}),
    ...(num(m.holdSec) != null ? { holdSec: num(m.holdSec) } : {}),
    timer: parseTimer(m.timer),
    together: m.together === true,
  };
}

function parseWorkout(raw: unknown): TvWorkoutInfo | null {
  const w = obj(raw);
  if (!w) return null;
  return {
    title: str(w.title) ?? '',
    kind: w.kind === 'timed' ? 'timed' : 'strength',
    durationMin: num(w.durationMin) ?? 0,
    exerciseCount: num(w.exerciseCount) ?? 0,
    ...(str(w.sharedWorkoutId) ? { sharedWorkoutId: str(w.sharedWorkoutId) } : {}),
  };
}

function parseCmd(raw: unknown): TvCommand | null {
  const c = obj(raw);
  if (!c || !Number.isInteger(c.seq)) return null;
  const type = c.type === 'volume' || c.type === 'mute' || c.type === 'end' ? c.type : null;
  if (!type) return null;
  return { seq: c.seq as number, type, ...(num(c.value) != null ? { value: num(c.value) } : {}) };
}

export function parseSession(code: string, data: Raw): TvSession | null {
  if (!data) return null;
  const gender = data.hostGender;
  return {
    code,
    hostUid: str(data.hostUid) ?? null,
    hostName: str(data.hostName) ?? null,
    hostGender: gender === 'male' || gender === 'female' || gender === 'other' ? gender : null,
    status: STATUSES.includes(data.status as TvStatus) ? (data.status as TvStatus) : 'waiting',
    createdAtMs: tsMs(data.createdAt) ?? 0,
    expiresAtMs: tsMs(data.expiresAt) ?? 0,
    hostBeatAtMs: tsMs(data.hostBeatAt),
    workout: parseWorkout(data.workout),
    mirror: parseMirror(data.mirror),
    timerAnchorAtMs: tsMs(data.timerAnchorAt),
    volume: Math.min(1, Math.max(0, num(data.volume) ?? 1)),
    cmd: parseCmd(data.cmd),
  };
}

export function parseParticipant(uid: string, data: Raw): TvParticipant | null {
  if (!data) return null;
  return {
    uid,
    name: str(data.name) ?? '',
    joinedAtMs: tsMs(data.joinedAt) ?? 0,
    avatar: Number.isInteger(data.avatar) && (data.avatar as number) >= 0 ? (data.avatar as number) % TV_AVATAR_COUNT : defaultAvatar(uid),
    state: P_STATES.includes(data.state as TvParticipantState) ? (data.state as TvParticipantState) : 'joined',
    ...(num(data.set) != null ? { set: num(data.set) } : {}),
    ...(num(data.totalSets) != null ? { totalSets: num(data.totalSets) } : {}),
    seq: num(data.seq) ?? 0,
  };
}

/** Firestore rejects `undefined` — drop it (and NaN / Infinity), deeply for plain objects. */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}
