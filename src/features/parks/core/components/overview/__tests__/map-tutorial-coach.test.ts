import { describe, it, expect } from 'vitest';
import { DRAWER_COACH, tagDrawerCoach } from '../map-tutorial-coach';
import { routeWhy } from '../../hybrid/route-why';

/** enable_map_tutorial_v1 — the workout drawer's tour targets (M7) and the "why this route" rows (M5). */

describe('tagDrawerCoach', () => {
  it('marks only the first walk block and the first strength block', () => {
    const out = tagDrawerCoach([
      { key: 't', kind: 'transport', seconds: 120 },
      { key: 'a', kind: 'aerobic', subtype: 'walking', seconds: 600 },
      { key: 's', kind: 'strength', seconds: 480 },
      { key: 'b', kind: 'aerobic', subtype: 'walking', seconds: 600 },
      { key: 's2', kind: 'strength', seconds: 300 },
    ]);
    expect(out.map((i) => i.coach)).toEqual([undefined, DRAWER_COACH.walk, DRAWER_COACH.strength, undefined, undefined]);
  });
  it('a run block counts as the walk block; no strength → no strength target', () => {
    const out = tagDrawerCoach([{ key: 'r', kind: 'repeat', subtype: 'running', label: '6 × 400 מ׳' }]);
    expect(out[0].coach).toBe(DRAWER_COACH.walk);
  });
});

describe('routeWhy', () => {
  it('walk + strength with a known stop count + the slot reason', () => {
    const w = routeWhy({ reason: ' חלק מהתוכנית ', total: { min: 30, includesWalk: true, stations: 2 }, walks: true, hasStrength: true });
    expect(w.rows.map((r) => r.key)).toEqual(['mapTutorial.why.steps', 'mapTutorial.why.near', 'mapTutorial.why.strength.many']);
    expect(w.rows[2].values).toEqual({ n: '2' });
    expect(w.reason).toBe('חלק מהתוכנית');
  });
  it('no invented numbers: unknown stops, a run, no reason', () => {
    const w = routeWhy({ total: null, walks: false, hasStrength: true });
    expect(w.rows.map((r) => r.key)).toEqual(['mapTutorial.why.near', 'mapTutorial.why.strength.unknown']);
    expect(w.reason).toBeNull();
  });
  it('one stop', () => {
    const w = routeWhy({ total: { min: 20, includesWalk: true, stations: 1 }, walks: true, hasStrength: true });
    expect(w.rows.at(-1)?.key).toBe('mapTutorial.why.strength.one');
  });
});
