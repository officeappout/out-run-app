import { describe, expect, it } from 'vitest';
import { DEFAULT_RAIL_PLACEMENT, formatPace, parsePlacement, placementTopPx, railStatus, resolveDrop, toggleSelected } from '../core/rail-logic';
import type { OrderedParticipant } from '../core/presence-order';

const P = (o: Partial<OrderedParticipant>): OrderedParticipant => ({
  uid: 'u', name: 'ד', kind: 'run', state: 'active', clientMs: 0, seq: 1, serverMs: 1,
  isMe: false, freshness: 'live', lastSeenSec: 1, rank: 1, ...o,
});

describe('rail status', () => {
  it('formats pace', () => {
    expect(formatPace(330)).toBe('5:30');
    expect(formatPace(305.4)).toBe('5:05');
    expect(formatPace(0)).toBe('');
  });
  it('run: km + pace, km only without pace', () => {
    expect(railStatus(P({ distanceKm: 2.46, paceSecPerKm: 330 }))).toEqual({ key: 'rail.status.run', params: { km: '2.5', pace: '5:30' } });
    expect(railStatus(P({ distanceKm: 0.2 })).key).toBe('rail.status.runKm');
  });
  it('strength / amrap / emom', () => {
    expect(railStatus(P({ kind: 'strength', set: 3, totalSets: 5 }))).toEqual({ key: 'rail.status.set', params: { set: 3, total: 5 } });
    expect(railStatus(P({ kind: 'strength', set: 3 })).key).toBe('rail.status.setOnly');
    expect(railStatus(P({ kind: 'strength' })).key).toBe('rail.status.here');
    expect(railStatus(P({ kind: 'amrap', roundsDone: 3 }))).toEqual({ key: 'rail.status.round', params: { round: 4 } });
    expect(railStatus(P({ kind: 'emom', minute: 7 }))).toEqual({ key: 'rail.status.minute', params: { minute: 7 } });
  });
  it('done beats stale; stale shows last seen; paused', () => {
    expect(railStatus(P({ state: 'done', freshness: 'stale' })).key).toBe('rail.status.done');
    expect(railStatus(P({ freshness: 'stale', lastSeenSec: 60 }))).toEqual({ key: 'rail.status.seenAgo', params: { sec: 60 } });
    expect(railStatus(P({ freshness: 'stale', lastSeenSec: 180 }))).toEqual({ key: 'rail.status.seenAgoMin', params: { min: 3 } });
    expect(railStatus(P({ state: 'paused' })).key).toBe('rail.status.paused');
  });
});

describe('rail placement', () => {
  it('parses defensively', () => {
    expect(parsePlacement(null)).toEqual(DEFAULT_RAIL_PLACEMENT);
    expect(parsePlacement('{bad')).toEqual(DEFAULT_RAIL_PLACEMENT);
    expect(parsePlacement('{"side":"right","topFrac":4,"collapsed":true}')).toEqual({ side: 'right', topFrac: 1, collapsed: true });
    expect(parsePlacement('{"side":"x","topFrac":"a"}')).toEqual(DEFAULT_RAIL_PLACEMENT);
  });
  it('drop picks the nearer side and clamps the vertical fraction', () => {
    expect(resolveDrop({ x: 300, y: 400, viewW: 390, freeTop: 100, freeHeight: 600 })).toEqual({ side: 'right', topFrac: 0.5, collapsed: false });
    expect(resolveDrop({ x: 10, y: 20, viewW: 390, freeTop: 100, freeHeight: 600 })).toMatchObject({ side: 'left', topFrac: 0 });
    expect(resolveDrop({ x: 10, y: 9000, viewW: 390, freeTop: 100, freeHeight: 600 }).topFrac).toBe(1);
  });
  it('top px stays inside the free area', () => {
    expect(placementTopPx(0, 100, 600, 200)).toBe(100);
    expect(placementTopPx(1, 100, 600, 200)).toBe(500);
    expect(placementTopPx(1, 100, 100, 200)).toBe(100);
  });
  it('tap picks, tap again clears, tap another switches', () => {
    expect(toggleSelected(null, 'a')).toBe('a');
    expect(toggleSelected('a', 'a')).toBeNull();
    expect(toggleSelected('a', 'b')).toBe('b');
  });
});

import { computeRace } from '../core/race';
describe('race bar maths', () => {
  it('who leads and by how much', () => {
    expect(computeRace({ distanceKm: 3 }, { distanceKm: 2.5, })).toMatchObject({ leader: 'me', meFrac: 1, themFrac: 2.5 / 3 });
    expect(computeRace({ distanceKm: 2 }, { distanceKm: 2.4 }).leader).toBe('them');
    expect(computeRace({ distanceKm: 2 }, { distanceKm: 2.005 }).leader).toBe('even');
    expect(computeRace({}, {})).toMatchObject({ leader: 'even', meFrac: 0 });
  });
  it('pace gap: negative = I am faster; null when unknown', () => {
    expect(computeRace({ distanceKm: 1, paceSecPerKm: 320 }, { distanceKm: 1, paceSecPerKm: 335 }).paceGapSec).toBe(-15);
    expect(computeRace({ distanceKm: 1 }, { distanceKm: 1, paceSecPerKm: 335 }).paceGapSec).toBeNull();
  });
});
