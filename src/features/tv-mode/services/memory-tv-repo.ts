import type { PresencePatch, TvSessionRepo, TvUser } from './tv-session-repo';
import { expiresAtFor, isExpired } from '../core/expiry';
import { checkNickname } from '../core/nickname';
import { defaultAvatar } from '../core/participants';
import type { TvCommand, TvJoinResult, TvMirror, TvParticipant, TvSession, TvWorkoutInfo } from '../core/types';

/** In-memory TvSessionRepo for unit tests and local demos — same rules the Firestore rules enforce. */
export class MemoryTvRepo implements TvSessionRepo {
  sessions = new Map<string, TvSession>();
  participants = new Map<string, Map<string, TvParticipant>>();
  private sessionSubs = new Map<string, Set<(s: TvSession | null) => void>>();
  private partSubs = new Map<string, Set<(l: TvParticipant[]) => void>>();
  constructor(public clock: () => number = Date.now) {}

  /** What POST /api/tv/session does: a fresh waiting session. Returns false when the code is taken. */
  createServerSide(code: string): boolean {
    const existing = this.sessions.get(code);
    if (existing && !isExpired(existing.expiresAtMs, this.clock())) return false;
    const now = this.clock();
    this.sessions.set(code, {
      code, hostUid: null, hostName: null, hostGender: null, status: 'waiting',
      createdAtMs: now, expiresAtMs: expiresAtFor(now), hostBeatAtMs: null,
      workout: null, mirror: null, timerAnchorAtMs: null, volume: 1, cmd: null,
    });
    this.participants.set(code, new Map());
    this.emit(code);
    return true;
  }

  private emit(code: string): void {
    const s = this.sessions.get(code) ?? null;
    this.sessionSubs.get(code)?.forEach((fn) => fn(s ? { ...s } : null));
    const list = Array.from(this.participants.get(code)?.values() ?? []);
    this.partSubs.get(code)?.forEach((fn) => fn(list.map((p) => ({ ...p }))));
  }

  /** Host-only write: throws like a rules denial for anyone else. */
  private asHost(code: string, fn: (s: TvSession) => void): void {
    const s = this.sessions.get(code);
    if (!s) throw new Error('not-found');
    fn(s);
    this.emit(code);
  }

  subscribeSession(code: string, on: (s: TvSession | null) => void) {
    const set = this.sessionSubs.get(code) ?? new Set();
    this.sessionSubs.set(code, set);
    set.add(on);
    const s = this.sessions.get(code);
    on(s ? { ...s } : null);
    return () => void set.delete(on);
  }

  subscribeParticipants(code: string, on: (l: TvParticipant[]) => void) {
    const set = this.partSubs.get(code) ?? new Set();
    this.partSubs.set(code, set);
    set.add(on);
    on(Array.from(this.participants.get(code)?.values() ?? []));
    return () => void set.delete(on);
  }

  async join(code: string, user: TvUser): Promise<TvJoinResult> {
    const s = this.sessions.get(code);
    if (!s) return { ok: false, error: 'not-found' };
    if (s.status === 'ended') return { ok: false, error: 'ended' };
    if (isExpired(s.expiresAtMs, this.clock())) return { ok: false, error: 'expired' };
    let name = user.name;
    if (user.guest) {
      const nick = checkNickname(user.name);
      if (!nick.ok) return { ok: false, error: 'invalid-nickname' };
      name = nick.value;
      if (s.hostUid === null) return { ok: false, error: 'host-required' };
    }
    const role = s.hostUid === null || s.hostUid === user.uid ? 'host' : 'participant';
    if (s.hostUid === null) {
      s.hostUid = user.uid;
      s.hostName = name;
      s.hostGender = user.gender ?? null;
      s.status = 'lobby';
    }
    const parts = this.participants.get(code)!;
    const mine = parts.get(user.uid);
    if (mine) mine.state = 'joined';
    else parts.set(user.uid, { uid: user.uid, name, avatar: user.avatar ?? defaultAvatar(user.uid), joinedAtMs: this.clock(), state: 'joined', seq: 0 });
    this.emit(code);
    return { ok: true, role, session: { ...s } };
  }

  async setWorkout(code: string, workout: TvWorkoutInfo) {
    this.asHost(code, (s) => void (s.workout = workout));
  }
  async startWorkout(code: string) {
    this.asHost(code, (s) => void (s.status = 'live'));
  }
  async writeMirror(code: string, mirror: TvMirror, restampTimer: boolean) {
    this.asHost(code, (s) => {
      if (s.mirror && mirror.seq < s.mirror.seq) return;
      s.mirror = mirror;
      if (restampTimer) s.timerAnchorAtMs = this.clock();
    });
  }
  async beat(code: string) {
    this.asHost(code, (s) => void (s.hostBeatAtMs = this.clock()));
  }
  async sendCommand(code: string, cmd: TvCommand) {
    this.asHost(code, (s) => {
      s.cmd = cmd;
      if (cmd.type === 'volume' && cmd.value != null) s.volume = cmd.value;
    });
  }
  async end(code: string) {
    this.asHost(code, (s) => void (s.status = 'ended'));
  }
  async publishPresence(code: string, uid: string, patch: PresencePatch) {
    const p = this.participants.get(code)?.get(uid);
    if (!p) throw new Error('permission-denied');
    Object.assign(p, patch);
    this.emit(code);
  }
  async leave(code: string, uid: string) {
    const p = this.participants.get(code)?.get(uid);
    if (p) p.state = 'left';
    this.emit(code);
  }
}
