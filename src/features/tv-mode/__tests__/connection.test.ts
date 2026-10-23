import { describe, expect, it } from 'vitest';
import { phoneLinkState, deriveTvScreen } from '../core/connection';
import { ServerClock } from '../core/clock';
import { TV_LOST_AFTER_MS } from '../core/constants';
import type { TvSession } from '../core/types';

const base: TvSession = {
  code: '482913', hostUid: 'h', hostName: 'נועה', hostGender: 'female', status: 'live',
  createdAtMs: 0, expiresAtMs: 4 * 3600_000, hostBeatAtMs: 100_000, workout: null, mirror: null, timerAnchorAtMs: null, volume: 1, cmd: null,
};

describe('deriveTvScreen', () => {
  it('no doc yet / no host = waiting', () => {
    expect(deriveTvScreen(null, 0)).toBe('waiting');
    expect(deriveTvScreen({ ...base, status: 'waiting', hostUid: null }, 0)).toBe('waiting');
  });
  it('host present, workout not started = lobby', () => {
    expect(deriveTvScreen({ ...base, status: 'lobby' }, 0)).toBe('lobby');
  });
  it('live with a fresh heartbeat = live', () => {
    expect(deriveTvScreen(base, 100_000 + TV_LOST_AFTER_MS)).toBe('live');
  });
  it('live and the heartbeat went quiet = lost (the TV keeps its local timer)', () => {
    expect(deriveTvScreen(base, 100_000 + TV_LOST_AFTER_MS + 1)).toBe('lost');
  });
  it('a quiet phone in the lobby is not "lost"', () => {
    expect(deriveTvScreen({ ...base, status: 'lobby', hostBeatAtMs: null }, 3_000_000)).toBe('lobby');
  });
  it('live before the first beat is still live', () => {
    expect(deriveTvScreen({ ...base, hostBeatAtMs: null }, 50_000)).toBe('live');
  });
  it('expired after 4 hours, ended wins over everything', () => {
    expect(deriveTvScreen(base, base.expiresAtMs)).toBe('expired');
    expect(deriveTvScreen({ ...base, status: 'ended' }, base.expiresAtMs + 1)).toBe('ended');
  });
});

describe('phoneLinkState', () => {
  it('offline = lost, gone session = over', () => {
    expect(phoneLinkState({ online: true, session: base, nowMs: 1 })).toBe('ok');
    expect(phoneLinkState({ online: false, session: base, nowMs: 1 })).toBe('lost');
    expect(phoneLinkState({ online: true, session: { ...base, status: 'ended' }, nowMs: 1 })).toBe('over');
    expect(phoneLinkState({ online: true, session: null, nowMs: 1 })).toBe('over');
    expect(phoneLinkState({ online: true, session: base, nowMs: base.expiresAtMs })).toBe('over');
  });
});

describe('ServerClock', () => {
  it('uses the lowest-latency sample (the largest offset)', () => {
    const c = new ServerClock();
    expect(c.ready).toBe(false);
    expect(c.now(1000)).toBe(1000);
    c.sample(10_000, 10_400); // offset -400 (slow delivery)
    c.sample(20_000, 20_050); // offset -50  (fast)
    c.sample(30_000, 30_900); // offset -900
    expect(c.offsetMs).toBe(-50);
    expect(c.now(40_000)).toBe(39_950);
  });
  it('keeps only the recent samples', () => {
    const c = new ServerClock(2);
    c.sample(0, -1000); // +1000, will be evicted
    c.sample(0, 10);
    c.sample(0, 20);
    expect(c.offsetMs).toBe(-10);
  });
});
