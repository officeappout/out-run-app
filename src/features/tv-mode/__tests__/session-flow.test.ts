import { describe, expect, it } from 'vitest';
import { nextCommand } from '../core/commands';
import { initialMirror, mirrorReducer } from '../core/mirror';
import { TV_SESSION_TTL_MS } from '../core/constants';
import { MemoryTvRepo } from '../services/memory-tv-repo';
import { parseMirror, parseParticipant, parseSession, stripUndefinedDeep, tsMs } from '../services/firestore-tv-parse';

const CODE = '482913';
const setup = () => {
  let now = 1_000_000;
  const repo = new MemoryTvRepo(() => now);
  repo.createServerSide(CODE);
  return { repo, advance: (ms: number) => void (now += ms) };
};

describe('joining a session', () => {
  it('the first phone is the host, later phones are participants (equal list)', async () => {
    const { repo } = setup();
    const a = await repo.join(CODE, { uid: 'noa', name: 'נועה', gender: 'female' });
    const b = await repo.join(CODE, { uid: 'dani', name: 'דני' });
    expect(a).toMatchObject({ ok: true, role: 'host' });
    expect(b).toMatchObject({ ok: true, role: 'participant' });
    const s = repo.sessions.get(CODE)!;
    expect(s).toMatchObject({ hostUid: 'noa', hostName: 'נועה', hostGender: 'female', status: 'lobby' });
    expect(Array.from(repo.participants.get(CODE)!.keys())).toEqual(['noa', 'dani']);
  });
  it('the host re-joining stays host and does not steal anything', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.join(CODE, { uid: 'dani', name: 'דני' });
    const again = await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    expect(again).toMatchObject({ ok: true, role: 'host' });
    expect(repo.sessions.get(CODE)!.hostUid).toBe('noa');
  });
  it('unknown, expired and ended codes are refused with a reason', async () => {
    const { repo, advance } = setup();
    expect(await repo.join('000000', { uid: 'x', name: 'x' })).toEqual({ ok: false, error: 'not-found' });
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.end(CODE);
    expect(await repo.join(CODE, { uid: 'dani', name: 'דני' })).toEqual({ ok: false, error: 'ended' });
    const other = '111111';
    repo.createServerSide(other);
    advance(TV_SESSION_TTL_MS);
    expect(await repo.join(other, { uid: 'dani', name: 'דני' })).toEqual({ ok: false, error: 'expired' });
  });
  it('a live (unexpired) code cannot be created twice, an expired one can be reused', () => {
    const { repo, advance } = setup();
    expect(repo.createServerSide(CODE)).toBe(false);
    advance(TV_SESSION_TTL_MS + 1);
    expect(repo.createServerSide(CODE)).toBe(true);
  });
});

describe('guests (Kahoot model): nickname + default avatar, never host', () => {
  it('a guest cannot claim a free session, and nothing is written', async () => {
    const { repo } = setup();
    expect(await repo.join(CODE, { uid: 'g1', name: 'גיא', guest: true })).toEqual({ ok: false, error: 'host-required' });
    const s = repo.sessions.get(CODE)!;
    expect(s).toMatchObject({ hostUid: null, status: 'waiting' });
    expect(repo.participants.get(CODE)!.size).toBe(0);
  });
  it('a guest joins as a participant once a real user hosts; the nickname is normalised and an avatar is assigned', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    const r = await repo.join(CODE, { uid: 'g1', name: '  גיא   הגדול ', guest: true, avatar: 3 });
    expect(r).toMatchObject({ ok: true, role: 'participant' });
    expect(repo.participants.get(CODE)!.get('g1')).toMatchObject({ name: 'גיא הגדול', avatar: 3, state: 'joined' });
    expect(repo.participants.get(CODE)!.get('noa')!.avatar).toBeGreaterThanOrEqual(0);
    expect(repo.sessions.get(CODE)!.hostUid).toBe('noa');
  });
  it('a guest never becomes host, even when the host left (state left) or re-joins', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.leave(CODE, 'noa');
    await repo.join(CODE, { uid: 'g1', name: 'גיא', guest: true });
    await repo.join(CODE, { uid: 'g1', name: 'גיא', guest: true });
    expect(repo.sessions.get(CODE)!.hostUid).toBe('noa');
  });
  it('an invalid nickname is refused before anything is written', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    for (const bad of ['', '   ', 'a'.repeat(21), '<b>x</b>', 'smile 😀']) {
      expect(await repo.join(CODE, { uid: 'g1', name: bad, guest: true })).toEqual({ ok: false, error: 'invalid-nickname' });
    }
    expect(repo.participants.get(CODE)!.has('g1')).toBe(false);
  });
  it('the guest cannot write host fields or someone else\'s presence', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.join(CODE, { uid: 'g1', name: 'גיא', guest: true });
    await expect(repo.publishPresence(CODE, 'nobody', { state: 'active', seq: 1 })).rejects.toThrow('permission-denied');
    await repo.publishPresence(CODE, 'g1', { state: 'active', set: 1, totalSets: 3, seq: 1 });
    expect(repo.participants.get(CODE)!.get('g1')!.state).toBe('active');
  });
});

describe('host writes and subscriptions', () => {
  it('lobby → live, mirror + commands reach the TV subscriber', async () => {
    const { repo } = setup();
    const seen: Array<string> = [];
    repo.subscribeSession(CODE, (s) => s && seen.push(`${s.status}:${s.mirror?.seq ?? '-'}:${s.volume}`));
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.setWorkout(CODE, { title: 'מתח רחב', kind: 'strength', durationMin: 35, exerciseCount: 5 });
    await repo.startWorkout(CODE);
    const m = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 5, name: 'מתח', setCount: 3 });
    await repo.writeMirror(CODE, m, true);
    await repo.sendCommand(CODE, nextCommand(null, 'volume', 0.25));
    expect(seen.at(-1)).toBe('live:1:0.25');
    expect(repo.sessions.get(CODE)!.timerAnchorAtMs).not.toBeNull();
  });
  it('an older mirror snapshot is dropped, the heartbeat is stamped', async () => {
    const { repo, advance } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    const m1 = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 2, name: 'a', setCount: 1 });
    const m2 = mirrorReducer(m1, { type: 'set', setIndex: 1 });
    await repo.writeMirror(CODE, m2, false);
    await repo.writeMirror(CODE, m1, false);
    expect(repo.sessions.get(CODE)!.mirror!.seq).toBe(m2.seq);
    advance(5000);
    await repo.beat(CODE);
    expect(repo.sessions.get(CODE)!.hostBeatAtMs).toBe(1_005_000);
  });
  it('a participant writes only their own presence; a stranger cannot write at all', async () => {
    const { repo } = setup();
    await repo.join(CODE, { uid: 'noa', name: 'נועה' });
    await repo.join(CODE, { uid: 'dani', name: 'דני' });
    await repo.publishPresence(CODE, 'dani', { state: 'active', set: 2, totalSets: 5, seq: 1 });
    expect(repo.participants.get(CODE)!.get('dani')).toMatchObject({ state: 'active', set: 2, totalSets: 5 });
    await expect(repo.publishPresence(CODE, 'stranger', { state: 'active', seq: 1 })).rejects.toThrow('permission-denied');
    await repo.leave(CODE, 'dani');
    expect(repo.participants.get(CODE)!.get('dani')!.state).toBe('left');
  });
});

describe('doc parsing is defensive', () => {
  it('turns timestamps into ms and fills defaults for a bare doc', () => {
    const ts = { toMillis: () => 5000 };
    const s = parseSession(CODE, { hostUid: 'h', status: 'live', createdAt: ts, expiresAt: ts, hostBeatAt: ts, timerAnchorAt: ts });
    expect(s).toMatchObject({ hostUid: 'h', status: 'live', createdAtMs: 5000, hostBeatAtMs: 5000, timerAnchorAtMs: 5000, volume: 1, mirror: null, cmd: null });
    expect(parseSession(CODE, { status: 'nonsense', volume: 9 })).toMatchObject({ status: 'waiting', volume: 1, hostUid: null });
    expect(parseSession(CODE, undefined)).toBeNull();
  });
  it('rejects a mirror of another version and sanitises numbers', () => {
    expect(parseMirror({ v: 2 })).toBeNull();
    const m = parseMirror({ v: 1, seq: 'x', setIndex: 0, setCount: -3, timer: { dir: 'sideways', baseMs: -5 } })!;
    expect(m).toMatchObject({ seq: 0, setIndex: 1, setCount: 1 });
    expect(m.timer).toEqual({ dir: 'none', baseMs: 0, running: false, totalMs: 0 });
  });
  it('parses participants and drops undefined before a write', () => {
    expect(parseParticipant('u', { name: 'דני', state: 'weird', joinedAt: { toMillis: () => 7 } })).toMatchObject({ uid: 'u', name: 'דני', state: 'joined', joinedAtMs: 7 });
    // a doc without (or with a wild) avatar still gets a valid one
    expect(parseParticipant('u', { name: 'x' })!.avatar).toBeGreaterThanOrEqual(0);
    expect(parseParticipant('u', { name: 'x', avatar: 11 })!.avatar).toBe(3);
    expect(parseParticipant('u', { name: 'x', avatar: 5 })!.avatar).toBe(5);
    expect(stripUndefinedDeep({ a: 1, b: undefined, c: { d: undefined, e: NaN, f: 2 }, g: [{ h: undefined }] })).toEqual({ a: 1, c: { f: 2 }, g: [{}] });
    expect(tsMs('x')).toBeNull();
  });
});
