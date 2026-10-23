import { describe, expect, it } from 'vitest';
import { decidePublish, statusChanged } from '../core/presence-throttle';
import { orderParticipants } from '../core/presence-order';
import { decideByLevel, decideByPace, decideTogetherMode, explainDecision } from '../core/level-similarity';
import { betterOffset, countdownAt, estimateClockOffset, planStartAt } from '../core/countdown';
import { addCheer, cheersReceived, diffTogetherEvents } from '../core/cheers';
import { sampleOffset } from '../core/clock-offset';
import type { PresenceEntry, PresenceStatus } from '../core/types';

const base = (o: Partial<PresenceStatus> = {}): PresenceStatus => ({
  uid: 'a', name: 'א', kind: 'run', state: 'active', distanceKm: 1, paceSecPerKm: 330, clientMs: 0, seq: 1, ...o,
});
const entry = (o: Partial<PresenceEntry> = {}): PresenceEntry => ({ ...base(), serverMs: 1000, ...o });

describe('presence throttle', () => {
  it('writes the first status immediately', () => {
    expect(decidePublish({ lastWritten: null, lastWriteMs: null, candidate: base(), nowMs: 0 })).toEqual({ action: 'write' });
  });
  it('waits out the 4 s gap when something changed', () => {
    const last = base();
    const d = decidePublish({ lastWritten: last, lastWriteMs: 1000, candidate: base({ distanceKm: 1.2 }), nowMs: 2500 });
    expect(d).toEqual({ action: 'wait', waitMs: 2500 });
  });
  it('writes a change after the gap', () => {
    const d = decidePublish({ lastWritten: base(), lastWriteMs: 0, candidate: base({ distanceKm: 1.2 }), nowMs: 4000 });
    expect(d.action).toBe('write');
  });
  it('skips an unchanged status until the heartbeat is due', () => {
    expect(decidePublish({ lastWritten: base(), lastWriteMs: 0, candidate: base({ clientMs: 5 }), nowMs: 10_000 }).action).toBe('skip');
    expect(decidePublish({ lastWritten: base(), lastWriteMs: 0, candidate: base({ clientMs: 5 }), nowMs: 20_000 }).action).toBe('write');
  });
  it('ignores sub-10 m distance and sub-second pace jitter', () => {
    expect(statusChanged(base({ distanceKm: 1.001 }), base({ distanceKm: 1.004 }))).toBe(false);
    expect(statusChanged(base({ paceSecPerKm: 330.2 }), base({ paceSecPerKm: 330.4 }))).toBe(false);
    expect(statusChanged(base({ distanceKm: 1.0 }), base({ distanceKm: 1.02 }))).toBe(true);
  });
  it('a pause, a round and a cheer all count as changes', () => {
    expect(statusChanged(base(), base({ state: 'paused' }))).toBe(true);
    expect(statusChanged(base({ kind: 'amrap', roundsDone: 1 }), base({ kind: 'amrap', roundsDone: 2 }))).toBe(true);
    expect(statusChanged(base(), base({ cheersSent: { b: 1 } }))).toBe(true);
  });
});

describe('presence order', () => {
  const now = 100_000;
  it('me first, then live by progress, then done, then stale', () => {
    const list = orderParticipants([
      entry({ uid: 'stale', name: 'ס', distanceKm: 9, serverMs: now - 120_000, clientMs: now - 120_000 }),
      entry({ uid: 'done', name: 'ד', distanceKm: 5, state: 'done', serverMs: now - 300_000 }),
      entry({ uid: 'slow', name: 'ל', distanceKm: 1, serverMs: now - 1000 }),
      entry({ uid: 'me', name: 'אני', distanceKm: 0.5, serverMs: now }),
      entry({ uid: 'fast', name: 'מ', distanceKm: 3, serverMs: now - 2000 }),
    ], 'me', now);
    expect(list.map((p) => p.uid)).toEqual(['me', 'fast', 'slow', 'done', 'stale']);
    expect(list.find((p) => p.uid === 'stale')?.freshness).toBe('stale');
    expect(list.find((p) => p.uid === 'done')?.freshness).toBe('live');
    expect(list.find((p) => p.uid === 'fast')?.rank).toBe(1);
    expect(list.find((p) => p.uid === 'stale')?.rank).toBe(0);
  });
  it('is stable on ties (name then uid) and compares per kind', () => {
    const list = orderParticipants([
      entry({ uid: 'b', name: 'ב', kind: 'amrap', roundsDone: 2, serverMs: now }),
      entry({ uid: 'a', name: 'א', kind: 'amrap', roundsDone: 2, serverMs: now }),
      entry({ uid: 'c', name: 'ג', kind: 'amrap', roundsDone: 4, serverMs: now }),
    ], null, now);
    expect(list.map((p) => p.uid)).toEqual(['c', 'a', 'b']);
  });
  it('reports seconds since last seen', () => {
    const [p] = orderParticipants([entry({ serverMs: now - 61_000 })], null, now);
    expect(p.lastSeenSec).toBe(61);
  });
});

describe('level similarity', () => {
  it('levels within the spread train the same workout', () => {
    expect(decideByLevel([3, 4, 3], 1)).toMatchObject({ mode: 'same', basis: 'level', spread: 1, low: 3, high: 4 });
  });
  it('a wide spread splits into each-at-own-level', () => {
    expect(decideByLevel([2, 5], 1)).toMatchObject({ mode: 'each', spread: 3 });
  });
  it('unknown / single data defaults to same, basis unknown', () => {
    expect(decideByLevel([null, 4]).basis).toBe('unknown');
    expect(decideByLevel([]).mode).toBe('same');
  });
  it('paces: ratio threshold', () => {
    expect(decideByPace([300, 340], 1.2).mode).toBe('same');
    expect(decideByPace([300, 400], 1.2)).toMatchObject({ mode: 'each', low: 300, high: 400 });
    expect(decideByPace([300, 0, null]).basis).toBe('unknown');
  });
  it('dispatches by kind and explains', () => {
    expect(decideTogetherMode('run', [{ paceSecPerKm: 300 }, { paceSecPerKm: 420 }]).mode).toBe('each');
    expect(decideTogetherMode('amrap', [{ level: 3 }, { level: 3 }]).mode).toBe('same');
    expect(explainDecision(decideByLevel([3, 3])).key).toBe('lobby.explain.sameLevel');
    expect(explainDecision(decideByLevel([1, 6]))).toEqual({ key: 'lobby.explain.eachLevel', params: { low: 1, high: 6 } });
    expect(explainDecision(decideByPace([300, 500])).key).toBe('lobby.explain.eachPace');
    expect(explainDecision(decideByPace([300, 310])).key).toBe('lobby.explain.same');
    expect(explainDecision(decideByLevel([])).key).toBe('lobby.explain.unknown');
  });
});

describe('countdown sync', () => {
  it('estimates the offset from a round trip', () => {
    // sent at 1000, back at 1200 → midpoint 1100; server said 5100 → server is 4000 ahead
    expect(estimateClockOffset(5100, 1000, 1200)).toBe(4000);
  });
  it('keeps the lowest-RTT sample', () => {
    const a = betterOffset(null, 5100, 1000, 1200);
    const b = betterOffset(a, 9999, 2000, 2800);
    expect(b).toBe(a);
    const c = betterOffset(a, 5050, 1000, 1040);
    expect(c.rttMs).toBe(40);
  });
  it('two devices with different clocks hit GO at the same server instant', () => {
    const startAt = planStartAt(1_000_000);
    expect(startAt).toBe(1_004_500);
    // device A clock = server − 40 s, device B = server + 7 s
    const offA = 40_000, offB = -7_000;
    const view = (serverNow: number, off: number) => countdownAt(startAt, serverNow - off, off);
    for (const t of [1_000_000, 1_001_600, 1_003_999]) {
      expect(view(t, offA)).toEqual(view(t, offB));
    }
    expect(view(1_004_500, offA)).toEqual({ phase: 'go' });
    expect(view(1_004_499, offB).phase).toBe('counting');
  });
  it('shows 3-2-1 and holds the 3 during the lead', () => {
    const startAt = 10_000;
    expect(countdownAt(null, 0, 0)).toEqual({ phase: 'waiting' });
    expect(countdownAt(startAt, 5_000, 0)).toMatchObject({ phase: 'counting', digit: 3 });
    expect(countdownAt(startAt, 7_500, 0)).toMatchObject({ phase: 'counting', digit: 3, msToNext: 500 });
    expect(countdownAt(startAt, 8_100, 0)).toMatchObject({ phase: 'counting', digit: 2 });
    expect(countdownAt(startAt, 9_100, 0)).toMatchObject({ phase: 'counting', digit: 1 });
    expect(countdownAt(startAt, 10_000, 0)).toEqual({ phase: 'go' });
  });
  it('samples the offset from my own server-stamped entry only', () => {
    expect(sampleOffset(null, undefined, 5)).toBeNull();
    expect(sampleOffset(null, entry({ serverMs: null }), 5)).toBeNull();
    expect(sampleOffset(null, entry({ serverMs: 5100, clientMs: 1000 }), 1200)).toEqual({ offsetMs: 4000, rttMs: 200 });
  });
});

describe('cheers', () => {
  it('addCheer is cumulative per recipient', () => {
    expect(addCheer(addCheer(undefined, 'x'), 'x')).toEqual({ x: 2 });
    expect(addCheer({ y: 1 }, 'x')).toEqual({ y: 1, x: 1 });
  });
  it('sums cheers received and ignores self-cheers', () => {
    expect(cheersReceived([
      entry({ uid: 'a', cheersSent: { b: 2, a: 5 } }),
      entry({ uid: 'b', cheersSent: { a: 1, c: 3 } }),
    ])).toEqual({ b: 2, a: 1, c: 3 });
  });
  it('the first snapshot never replays history', () => {
    expect(diffTogetherEvents(null, [entry({ uid: 'a', cheersSent: { me: 4 } })], 'me')).toEqual([]);
  });
  it('emits cheer-to-me, round and done events once', () => {
    const prev = [entry({ uid: 'a', name: 'דני', kind: 'amrap', roundsDone: 1 }), entry({ uid: 'me', kind: 'amrap' })];
    const next = [
      entry({ uid: 'a', name: 'דני', kind: 'amrap', roundsDone: 2, cheersSent: { me: 1, z: 1 }, state: 'done' }),
      entry({ uid: 'me', kind: 'amrap', roundsDone: 3 }),
    ];
    const ev = diffTogetherEvents(prev, next, 'me');
    expect(ev.map((e) => e.type).sort()).toEqual(['cheer', 'done', 'round']);
    expect(ev.find((e) => e.type === 'cheer')).toMatchObject({ fromName: 'דני', count: 1 });
    expect(diffTogetherEvents(next, next, 'me')).toEqual([]);
  });
});

import { eventCopy, mergeCheers } from '../core/cheers';
describe('cheers extras', () => {
  it('merge keeps the larger counter per recipient', () => {
    expect(mergeCheers({ a: 3, b: 1 }, { a: 2, c: 4 })).toEqual({ a: 3, b: 1, c: 4 });
    expect(mergeCheers({}, undefined)).toEqual({});
  });
  it('event copy keys', () => {
    expect(eventCopy({ type: 'cheer', id: 'i', fromUid: 'a', fromName: 'דני', toUid: 'm', count: 1 }).key).toBe('cheer.toast');
    expect(eventCopy({ type: 'cheer', id: 'i', fromUid: 'a', fromName: 'דני', toUid: 'm', count: 3 })).toEqual({ key: 'cheer.toastMany', params: { name: 'דני', count: 3 } });
    expect(eventCopy({ type: 'round', id: 'r', uid: 'a', name: 'דני', round: 2 }).key).toBe('event.round');
    expect(eventCopy({ type: 'done', id: 'd', uid: 'a', name: 'דני' }).key).toBe('event.done');
  });
});
