import { describe, expect, it } from 'vitest';
import { fitDistance, lapsLabel, routeRunShape } from '../distance-fit';
import { lineNorth, makeRoute, squareLoop } from './fixtures';

describe('fitDistance', () => {
  it('one lap of a loop that matches the target fits, ends at start', () => {
    const f = fitDistance(makeRoute({ id: 'a', distance: 5, path: squareLoop(5000) }), 5.2);
    expect(f).toMatchObject({ verdict: 'fits', laps: 1, endsAtStart: true, reason: null });
  });

  it('a short loop fits in whole laps', () => {
    const f = fitDistance(makeRoute({ id: 'a', distance: 2.5, path: squareLoop(2500) }), 5);
    expect(f).toMatchObject({ verdict: 'laps', laps: 2, endsAtStart: true, reason: '2 סיבובים' });
  });

  it('falls back to half laps, which end on the far side', () => {
    const f = fitDistance(makeRoute({ id: 'a', distance: 2, path: squareLoop(2000) }), 5);
    expect(f.verdict).toBe('laps');
    expect(f.laps).toBe(2.5);
    expect(f.endsAtStart).toBe(false);
    expect(f.reason).toBe('2.5 סיבובים');
    expect(f.caution).toBe('מסיים בצד השני של הלולאה');
  });

  it('a loop much longer than the run does not fit', () => {
    const f = fitDistance(makeRoute({ id: 'a', distance: 12, path: squareLoop(12000) }), 5);
    expect(f.verdict).toBe('no');
    expect(f.caution).toContain('ארוך מהאימון');
  });

  it('a tiny loop for a long run is too short', () => {
    expect(fitDistance(makeRoute({ id: 'a', distance: 0.4, path: squareLoop(400) }), 10).verdict).toBe('no');
  });

  it('a point-to-point route runs as out-and-back with a turnaround', () => {
    const r = makeRoute({ id: 'p', distance: 4, routeShape: 'point_to_point', path: lineNorth(4000) });
    expect(routeRunShape(r)).toBe('line');
    const f = fitDistance(r, 5);
    expect(f).toMatchObject({ verdict: 'fits', laps: 1, endsAtStart: true, turnaroundKm: 2.5 });
    expect(f.reason).toBe('הלוך-חזור · סיבוב בק״מ 2.5');
  });

  it('a stored out-and-back repeats for a longer run', () => {
    const r = makeRoute({ id: 'o', distance: 3, routeShape: 'out_and_back', path: lineNorth(1500) });
    const f = fitDistance(r, 6);
    expect(f).toMatchObject({ verdict: 'laps', laps: 2, endsAtStart: true });
  });

  it('unknown target → unknown, neutral', () => {
    expect(fitDistance(makeRoute({ id: 'a' }), null)).toMatchObject({ verdict: 'unknown', score: 0.5 });
  });

  it('labels laps in Hebrew', () => {
    expect(lapsLabel(1)).toBe('סיבוב אחד');
    expect(lapsLabel(3)).toBe('3 סיבובים');
  });
});
