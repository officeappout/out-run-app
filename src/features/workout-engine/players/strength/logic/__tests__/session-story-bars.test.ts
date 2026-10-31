import { describe, expect, it } from 'vitest';
import { sessionStoryBars, stripSegmentIndex } from '../session-story-bars';

// Pilot M21: walk leg 0 (done), station 1 (in progress), walk leg 2, station 3.
const strip = { items: [
  { key: 'leg-0', color: 'green', done: true },
  { key: 'st-1-0', color: 'cyan', done: true },
  { key: 'st-1-1', color: 'cyan', done: false },
  { key: 'leg-2', color: 'green', done: false },
  { key: 'st-3-0', color: 'cyan', done: false },
] };

describe('session story bars (M21)', () => {
  it('plan index from the strip key', () => {
    expect(stripSegmentIndex('leg-12')).toBe(12);
    expect(stripSegmentIndex('st-5-1')).toBe(5);
    expect(stripSegmentIndex('x')).toBe(-1);
  });
  it('the legs / stations around the station wrap its own exercise bars', () => {
    const inner = [{ key: '0', color: 'blue', state: 'done' as const }, { key: '1', color: 'blue', state: 'current' as const }];
    const r = sessionStoryBars(inner, strip, 1);
    expect(r.offset).toBe(1);
    expect(r.segments.map((s) => s.key)).toEqual(['s-leg-0', '0', '1', 's-leg-2', 's-st-3-0']);
    expect(r.segments.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(r.segments[3].color).toBe('green');
  });
  it('the first segment station has nothing before it', () => {
    expect(sessionStoryBars([], strip, 0).offset).toBe(0);
  });
});
