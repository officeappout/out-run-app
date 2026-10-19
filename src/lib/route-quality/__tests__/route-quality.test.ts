import { describe, expect, it } from 'vitest';
import {
  compactness, computeRouteQualityMetrics, countSelfIntersections, crossingControlFromTags, detectUTurns,
  evaluateLoopQuality, majorRoadCrossings, majorRoadShare, parseOverpassLayer, pathLengthM, retracedFraction, trimSpurs,
  type OsmRoadLayer,
} from '..';
import { FIGURE_EIGHT, LOLLIPOP, OUT_AND_BACK, SQUARE, SQUARE_WITH_SPUR, m } from './fixtures';

describe('route-quality metrics', () => {
  it('a clean square loop has no U-turns, no retrace, no self-crossing and square compactness', () => {
    expect(detectUTurns(SQUARE)).toHaveLength(0);
    expect(retracedFraction(SQUARE)).toBeLessThan(0.01);
    expect(countSelfIntersections(SQUARE)).toBe(0);
    expect(compactness(SQUARE)).toBeCloseTo(Math.PI / 4, 2);
    expect(pathLengthM(SQUARE)).toBeCloseTo(2000, -1);
  });

  it('a dead-end spur is detected as one spur and its second pass is retrace', () => {
    const u = detectUTurns(SQUARE_WITH_SPUR);
    expect(u).toHaveLength(1);
    expect(u[0].kind).toBe('spur');
    expect(u[0].depthM).toBeGreaterThan(80);
    // 100 m re-walked out of 2200 m ≈ 4.5 %
    expect(retracedFraction(SQUARE_WITH_SPUR)).toBeGreaterThan(0.035);
    expect(retracedFraction(SQUARE_WITH_SPUR)).toBeLessThan(0.06);
  });

  it('an out-and-back is half retrace, one spur at the far end and ~zero compactness', () => {
    expect(retracedFraction(OUT_AND_BACK)).toBeGreaterThan(0.45);
    expect(retracedFraction(OUT_AND_BACK)).toBeLessThan(0.52);
    const u = detectUTurns(OUT_AND_BACK);
    expect(u).toHaveLength(1);
    expect(u[0].kind).toBe('spur');
    expect(compactness(OUT_AND_BACK)).toBeLessThan(0.01);
  });

  it('a lollipop stick is retrace but not a U-turn', () => {
    expect(detectUTurns(LOLLIPOP)).toHaveLength(0);
    const r = retracedFraction(LOLLIPOP);
    expect(r).toBeGreaterThan(0.08); // 200 of 2000 m
    expect(r).toBeLessThan(0.12);
  });

  it('counts a figure eight as one self-crossing', () => {
    expect(countSelfIntersections(FIGURE_EIGHT)).toBe(1);
  });

  it('distance error is relative to the target', () => {
    expect(computeRouteQualityMetrics(SQUARE, { targetKm: 2.5 }).distanceErrorPct).toBeCloseTo(-0.2, 2);
    expect(computeRouteQualityMetrics(SQUARE).distanceErrorPct).toBeNull();
  });
});

describe('major roads and crossings', () => {
  // A tertiary road running east-west through the middle of the square (y = 250),
  // with a signal on the west crossing and nothing on the east one.
  const layer: OsmRoadLayer = {
    bbox: { south: 0, west: 0, north: 0, east: 0 },
    roads: [{ id: 1, highway: 'tertiary', name: 'Main', coords: m([[-300, 250], [900, 250]]) }],
    crossings: [{ id: 9, coord: m([[0, 255]])[0], control: 'signalled' }],
  };

  it('finds both crossings and classifies them by the nearest crossing node', () => {
    const c = majorRoadCrossings(SQUARE, layer);
    expect(c).toHaveLength(2);
    expect(c.map(x => x.control).sort()).toEqual(['signalled', 'unmarked']);
    const met = computeRouteQualityMetrics(SQUARE, { osm: layer });
    expect(met.crossings?.unmarked).toBe(1);
    expect(met.crossings?.perKm).toBeCloseTo(1, 1);
  });

  it('does not count walking along the road as crossing it, but counts it as major-road share', () => {
    const along = m([[0, 250], [100, 250], [200, 250], [300, 250], [300, 400]]);
    expect(majorRoadCrossings(along, layer)).toHaveLength(0);
    expect(majorRoadShare(along, layer)).toBeGreaterThan(0.6);
    expect(majorRoadShare(SQUARE, layer)).toBeLessThan(0.02);
  });

  it('maps OSM crossing tags', () => {
    expect(crossingControlFromTags({ highway: 'traffic_signals' })).toBe('signalled');
    expect(crossingControlFromTags({ highway: 'crossing', crossing: 'traffic_signals' })).toBe('signalled');
    expect(crossingControlFromTags({ highway: 'crossing', crossing: 'zebra' })).toBe('marked');
    expect(crossingControlFromTags({ highway: 'crossing' })).toBe('marked');
    expect(crossingControlFromTags({ highway: 'crossing', crossing: 'unmarked' })).toBe('unmarked');
  });

  it('parses an Overpass response into roads and crossing nodes', () => {
    const l = parseOverpassLayer({
      elements: [
        { type: 'way', id: 1, tags: { highway: 'secondary', name: 'X' }, geometry: [{ lat: 32, lon: 34.7 }, { lat: 32.001, lon: 34.7 }] },
        { type: 'way', id: 2, tags: { highway: 'residential' }, geometry: [{ lat: 32, lon: 34.7 }, { lat: 32.001, lon: 34.7 }] },
        { type: 'node', id: 3, lat: 32, lon: 34.7, tags: { highway: 'crossing', crossing: 'unmarked' } },
      ],
    }, { south: 0, west: 0, north: 1, east: 1 });
    expect(l.roads).toHaveLength(1);
    expect(l.crossings).toEqual([{ id: 3, coord: [34.7, 32], control: 'unmarked' }]);
  });
});

describe('acceptance + spur trimming', () => {
  it('passes a clean square and rejects an out-and-back for retrace, U-turn and compactness', () => {
    expect(evaluateLoopQuality(computeRouteQualityMetrics(SQUARE)).pass).toBe(true);
    const v = evaluateLoopQuality(computeRouteQualityMetrics(OUT_AND_BACK));
    expect(v.pass).toBe(false);
    expect(v.reasons).toEqual(expect.arrayContaining(['retrace', 'uturn', 'compactness']));
  });

  it('rejects a loop with a spur, and the trimmed loop passes', () => {
    expect(evaluateLoopQuality(computeRouteQualityMetrics(SQUARE_WITH_SPUR)).reasons).toContain('uturn');
    const t = trimSpurs(SQUARE_WITH_SPUR);
    expect(t.spursTrimmed).toBe(1);
    expect(t.trimmedM).toBeGreaterThan(180);
    expect(t.trimmedM).toBeLessThan(220);
    expect(t.path[0]).toEqual(SQUARE_WITH_SPUR[0]);
    expect(t.path[t.path.length - 1]).toEqual(SQUARE_WITH_SPUR[SQUARE_WITH_SPUR.length - 1]);
    const after = computeRouteQualityMetrics(t.path);
    expect(after.uTurnCount + after.spurCount).toBe(0);
    expect(after.retracedPct).toBeLessThan(0.01);
    expect(evaluateLoopQuality(after).pass).toBe(true);
  });

  it('leaves a clean loop untouched', () => {
    const t = trimSpurs(SQUARE);
    expect(t.spursTrimmed).toBe(0);
    expect(t.path).toBe(SQUARE);
  });

  it('flags unmarked crossings only when an OSM layer was available', () => {
    const met = computeRouteQualityMetrics(SQUARE);
    expect(met.crossings).toBeNull();
    const withMany = { ...met, crossings: { total: 4, perKm: 2, signalled: 0, marked: 0, unmarked: 4, unmarkedPerKm: 2, marks: [] } };
    expect(evaluateLoopQuality(withMany).reasons).toContain('unmarked_crossings');
  });
});
