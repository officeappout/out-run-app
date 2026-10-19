import { describe, it, expect } from 'vitest';
import {
  INITIAL_OFF_ROUTE_STATE, OFF_ROUTE_DEFAULTS, isOffRoutePhase, pauseOffRoute, stepOffRoute, type OffRouteState,
} from '../off-route-detector';

/** Feed [distanceM, tMs] pairs from a fresh (or given) state. */
function run(samples: Array<[number, number]>, from: OffRouteState = INITIAL_OFF_ROUTE_STATE): OffRouteState {
  return samples.reduce((s, [d, t]) => stepOffRoute(s, d, t), from);
}

describe('off-route detector', () => {
  it('never trips before the user joined the route (walk to the route ≠ off route)', () => {
    const s = run([[120, 0], [110, 5_000], [100, 20_000], [90, 60_000]]);
    expect(s.phase).toBe('unjoined');
    expect(isOffRoutePhase(s)).toBe(false);
  });

  it('joins within 40 m', () => {
    expect(run([[60, 0], [35, 1_000]]).phase).toBe('on');
  });

  it('enters only after > 40 m for ≥ 10 s', () => {
    const joined = run([[5, 0]]);
    const s1 = run([[45, 1_000], [50, 6_000], [55, 10_999]], joined);
    expect(s1.phase).toBe('pending');
    const s2 = stepOffRoute(s1, 60, 11_000);
    expect(s2.phase).toBe('off');
    expect(s2.distanceM).toBe(60);
  });

  it('a short spike (< 10 s) back under 40 m resets the clock', () => {
    const joined = run([[5, 0]]);
    const s = run([[80, 1_000], [80, 8_000], [30, 9_000], [80, 10_000], [80, 19_000]], joined);
    expect(s.phase).toBe('pending');
    expect(s.pendingSinceMs).toBe(10_000);
    expect(stepOffRoute(s, 80, 20_000).phase).toBe('off');
  });

  it('exactly 40 m is still on the route (strictly greater to enter)', () => {
    const joined = run([[5, 0]]);
    expect(run([[40, 1_000], [40, 30_000]], joined).phase).toBe('on');
  });

  it('exit needs < 20 m — no flapping inside the 20–40 m band', () => {
    const off = run([[5, 0], [50, 1_000], [50, 12_000]]);
    expect(off.phase).toBe('off');
    expect(run([[35, 13_000], [25, 14_000], [20, 15_000]], off).phase).toBe('off');
    expect(stepOffRoute(off, 19.9, 16_000).phase).toBe('on');
  });

  it('ignores bad fixes (Infinity from a degenerate path, NaN)', () => {
    const off = run([[5, 0], [50, 1_000], [50, 12_000]]);
    expect(stepOffRoute(off, Infinity, 13_000)).toBe(off);
    expect(stepOffRoute(off, NaN, 13_000)).toBe(off);
    expect(stepOffRoute(off, 5, NaN)).toBe(off);
  });

  it('pause drops a half-finished pending stretch but keeps off as off', () => {
    const pending = run([[5, 0], [60, 1_000]]);
    expect(pending.phase).toBe('pending');
    const paused = pauseOffRoute(pending);
    expect(paused.phase).toBe('on');
    // Resumed 5 minutes later, still far: needs a fresh 10 s.
    expect(stepOffRoute(paused, 60, 300_000).phase).toBe('pending');
    const off = run([[5, 0], [60, 1_000], [60, 12_000]]);
    expect(pauseOffRoute(off)).toBe(off);
  });

  it('honours a custom config', () => {
    const cfg = { ...OFF_ROUTE_DEFAULTS, enterM: 25, enterMs: 3_000, exitM: 10 };
    let s = stepOffRoute(INITIAL_OFF_ROUTE_STATE, 5, 0, cfg);
    s = stepOffRoute(s, 30, 1_000, cfg);
    s = stepOffRoute(s, 30, 4_000, cfg);
    expect(s.phase).toBe('off');
  });
});
