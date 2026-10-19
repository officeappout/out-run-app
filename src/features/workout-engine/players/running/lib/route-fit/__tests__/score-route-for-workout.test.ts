import { describe, expect, it } from 'vitest';
import { scoreRouteForWorkout, workoutFitForRoute } from '../score-route-for-workout';
import type { WorkoutRouteNeeds } from '../types';
import { ORIGIN, lineNorth, makeRoute, profileWithClimb, qs, squareLoop } from './fixtures';

const base: WorkoutRouteNeeds = { kind: 'easy', category: 'easy_run', targetKm: 5, durationMin: 32, hill: null, afterDark: false };
const hillRun: WorkoutRouteNeeds = {
  ...base, kind: 'interval', category: 'hill_short', targetKm: 6, hill: { repLengthM: 300, minGradePct: 5, reps: 6 },
};

describe('scoreRouteForWorkout — hills', () => {
  const hilly = makeRoute({ id: 'hilly', distance: 3, path: squareLoop(3000), elevationProfile: profileWithClimb(3000, 30, 1200, 330, 6) });
  const flat = makeRoute({ id: 'flat', distance: 3, path: squareLoop(3000), elevationProfile: { stepM: 30, elevationsM: Array(101).fill(5) } });

  it('prefers the route with a climb that meets the rep spec, and says where', () => {
    const a = scoreRouteForWorkout(hilly, hillRun, { origin: ORIGIN });
    const b = scoreRouteForWorkout(flat, hillRun, { origin: ORIGIN });
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons[0]).toMatch(/^עלייה של 6% באורך 3[0-9]0 מ׳ בק״מ 1\.2$/);
    expect(a.reasons).toContain('2 סיבובים');
  });

  it('a flat profile says there is no climb (not "no data")', () => {
    const b = scoreRouteForWorkout(flat, hillRun);
    expect(b.climb).toMatchObject({ source: 'profile', meetsSpec: false });
    expect(b.cautions).toContain('אין עלייה מתאימה לחזרות');
    expect(b.score).toBeLessThanOrEqual(50);
  });

  it('no elevation data at all says so', () => {
    const b = scoreRouteForWorkout(makeRoute({ id: 'nodata', distance: 3, path: squareLoop(3000) }), hillRun);
    expect(b.climb).toBeNull();
    expect(b.cautions).toContain('אין נתוני גובה למסלול');
  });
});

describe('scoreRouteForWorkout — intervals / tempo / easy', () => {
  const goodTrack = makeRoute({
    id: 'track', distance: 2, path: squareLoop(2000),
    elevationGain: 4, maxGrade: 1,
    qualitySignals: qs({
      composition: { sidewalkPct: 0, genuinePct: 90, ordinaryPct: 10, otherPct: 0 },
      lighting: { status: 'computed', litCoveragePct: 90, isLit: true },
      amenities: { status: 'computed', counts: { crossing: 1 }, has: {}, sourceStatuses: ['published'], computedAt: null, source: 'osm_amenities_join_v1' },
    }) as never,
  });
  const busyStreet = makeRoute({
    id: 'street', distance: 2, path: squareLoop(2000),
    elevationGain: 60, maxGrade: 8,
    qualitySignals: qs({
      composition: { sidewalkPct: 90, genuinePct: 5, ordinaryPct: 5, otherPct: 0 },
      lighting: { status: 'computed', litCoveragePct: 10, isLit: false },
      amenities: { status: 'computed', counts: { crossing: 14 }, has: {}, sourceStatuses: ['published'], computedAt: null, source: 'osm_amenities_join_v1' },
    }) as never,
  });
  const intervals: WorkoutRouteNeeds = { ...base, kind: 'interval', category: 'short_intervals', targetKm: 6 };

  it('intervals: flat, lit, dedicated, few crossings wins with reasons', () => {
    const a = scoreRouteForWorkout(goodTrack, intervals);
    const b = scoreRouteForWorkout(busyStreet, intervals);
    expect(a.score).toBeGreaterThan(b.score + 20);
    expect(a.reasons).toEqual(expect.arrayContaining(['3 סיבובים', 'מואר', 'מישורי', 'שביל ייעודי', 'מעט מעברי חצייה']));
    expect(b.cautions).toContain('הרבה מעברי חצייה');
  });

  it('after dark: lit beats unlit; unlit is flagged', () => {
    const dark = { ...base, afterDark: true, targetKm: 2 };
    const a = scoreRouteForWorkout(goodTrack, dark);
    const b = scoreRouteForWorkout(busyStreet, dark);
    expect(a.reasons).toContain('מואר');
    expect(b.cautions).toContain('לא מואר');
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('tempo: continuous route gets "רציף, מעט עצירות"', () => {
    const tempo = { ...base, kind: 'tempo' as const, category: 'tempo' as const, targetKm: 4 };
    expect(scoreRouteForWorkout(goodTrack, tempo).reasons).toContain('רציף, מעט עצירות');
    expect(scoreRouteForWorkout(busyStreet, tempo).reasons).not.toContain('רציף, מעט עצירות');
  });

  it('easy: comfort (water) shows up, access reason from origin', () => {
    const r = makeRoute({ id: 'park', distance: 5, path: squareLoop(5000, 400), featureTags: ['water_fountain', 'shaded'] });
    const s = scoreRouteForWorkout(r, base, { origin: ORIGIN });
    expect(s.reasons).toEqual(expect.arrayContaining(['ברזייה בדרך', 'מוצל', '400 מ׳ ממך']));
  });

  it('a route that does not fit is capped low', () => {
    const long = makeRoute({ id: 'long', distance: 15, path: squareLoop(15000) });
    expect(scoreRouteForWorkout(long, base).score).toBeLessThanOrEqual(30);
  });

  it('official beats an otherwise identical generated route', () => {
    const r = makeRoute({ id: 'x' });
    expect(scoreRouteForWorkout(r, base).score).toBeGreaterThan(scoreRouteForWorkout(r, base, { isGenerated: true }).score);
  });
});

describe('workoutFitForRoute (Discover)', () => {
  it('"מתאים" for one lap', () => {
    expect(workoutFitForRoute(makeRoute({ id: 'a', distance: 5 }), base)).toMatchObject({ fits: true, label: 'מתאים' });
  });

  it('"מתאים ב-2 סיבובים" for a half-length loop', () => {
    const v = workoutFitForRoute(makeRoute({ id: 'a', distance: 2.5, path: squareLoop(2500) }), base);
    expect(v).toMatchObject({ fits: true, label: 'מתאים ב-2 סיבובים' });
  });

  it('point-to-point: "מתאים" with a turnaround reason', () => {
    const v = workoutFitForRoute(makeRoute({ id: 'p', distance: 4, routeShape: 'point_to_point', path: lineNorth(4000) }), base);
    expect(v.fits).toBe(true);
    expect(v.reasons[0]).toBe('הלוך-חזור · סיבוב בק״מ 2.5');
  });

  it('too long → not today', () => {
    expect(workoutFitForRoute(makeRoute({ id: 'l', distance: 20, path: squareLoop(20000) }), base)).toMatchObject({
      fits: false, label: 'לא מתאים לאימון של היום',
    });
  });

  it('hill workout on a proven-flat route → not today', () => {
    const r = makeRoute({ id: 'f', distance: 3, path: squareLoop(3000), elevationProfile: profileWithClimb(3000, 30, 1000, 100, 2) });
    expect(workoutFitForRoute(r, hillRun)).toMatchObject({ fits: false, label: 'לא מתאים לאימון של היום' });
  });

  it('unknown distance → no label', () => {
    expect(workoutFitForRoute(makeRoute({ id: 'a' }), { ...base, targetKm: null }).label).toBeNull();
  });
});
