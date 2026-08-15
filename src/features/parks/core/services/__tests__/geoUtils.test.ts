import { describe, it, expect } from 'vitest';
import {
  bearingBetween,
  destinationPoint,
  isOutAndBackPath,
  buildLaneOffsetPath,
  buildOutAndBackPath,
  computeRouteTurns,
  pathLengthMeters,
  pointAtDistanceAlongPath,
  buildDirectionMarkers,
  haversineMeters,
} from '../geoUtils';

describe('destinationPoint — inverse of bearingBetween (15.08.2026, route-styling batch)', () => {
  it('moving north (bearing 0) increases latitude, leaves longitude ~unchanged', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 100, 0);
    expect(lat).toBeGreaterThan(32.05);
    expect(lng).toBeCloseTo(34.77, 3);
  });

  it('moving east (bearing 90) increases longitude, leaves latitude ~unchanged', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 100, 90);
    expect(lng).toBeGreaterThan(34.77);
    expect(lat).toBeCloseTo(32.05, 3);
  });

  it('zero distance returns the same point', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 0, 123);
    expect(lat).toBeCloseTo(32.05, 9);
    expect(lng).toBeCloseTo(34.77, 9);
  });

  it('round-trips with bearingBetween: the bearing FROM the origin TO the destination matches the input bearing', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 50, 45);
    const backBearing = bearingBetween(32.05, 34.77, lat, lng);
    expect(backBearing).toBeCloseTo(45, 1);
  });
});

describe('isOutAndBackPath — structural palindrome detection (15.08.2026)', () => {
  it('detects a real buildOutAndBackPath output', () => {
    const outbound: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    const path = buildOutAndBackPath(outbound);
    expect(isOutAndBackPath(path)).toBe(true);
  });

  it('rejects a plain one-way path (not mirrored)', () => {
    const path: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('rejects a loop (returns near the start but via different geometry, not a literal mirror)', () => {
    const path: [number, number][] = [
      [34.77, 32.05], [34.78, 32.06], [34.79, 32.06], [34.78, 32.05], [34.77, 32.05],
    ];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('rejects paths shorter than 3 points', () => {
    expect(isOutAndBackPath([[34.77, 32.05], [34.78, 32.06]])).toBe(false);
    expect(isOutAndBackPath([[34.77, 32.05]])).toBe(false);
    expect(isOutAndBackPath([])).toBe(false);
  });

  it('rejects even-length paths (an out-and-back mirror is always odd-length, 2n-1)', () => {
    const path: [number, number][] = [[0, 0], [1, 1], [2, 2], [1, 1]];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('a single-point outbound ([A] → [A]) is too short to be a real out-and-back (needs length >= 3)', () => {
    expect(isOutAndBackPath(buildOutAndBackPath([[34.77, 32.05]]))).toBe(false);
  });
});

describe('buildLaneOffsetPath — display-only out-and-back lane separation (15.08.2026)', () => {
  const outbound: [number, number][] = [
    [34.77, 32.05], [34.78, 32.06], [34.79, 32.07], [34.80, 32.08],
  ];
  const oabPath = buildOutAndBackPath(outbound);

  it('is a no-op for a non-out-and-back path', () => {
    const oneWay: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    expect(buildLaneOffsetPath(oneWay)).toEqual(oneWay);
  });

  it('preserves path length', () => {
    expect(buildLaneOffsetPath(oabPath).length).toBe(oabPath.length);
  });

  it('leaves the true start point unchanged (ramp = 0 there)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    expect(offset[0][0]).toBeCloseTo(oabPath[0][0], 9);
    expect(offset[0][1]).toBeCloseTo(oabPath[0][1], 9);
  });

  it('leaves the true end point unchanged (same physical point as start, ramp = 0 there too)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    const last = offset.length - 1;
    expect(offset[last][0]).toBeCloseTo(oabPath[last][0], 9);
    expect(offset[last][1]).toBeCloseTo(oabPath[last][1], 9);
  });

  it('leaves the true turnaround vertex unchanged (ramp = 0 there — no seam/jump between the two lanes)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    const turnaroundIdx = (oabPath.length - 1) / 2;
    expect(offset[turnaroundIdx][0]).toBeCloseTo(oabPath[turnaroundIdx][0], 9);
    expect(offset[turnaroundIdx][1]).toBeCloseTo(oabPath[turnaroundIdx][1], 9);
  });

  it('actually separates the outbound and return legs by a REAL, meaningful distance in the middle of each leg (not sub-meter spherical noise)', () => {
    const laneOffsetMeters = 5;
    const offset = buildLaneOffsetPath(oabPath, laneOffsetMeters);
    // Middle of the outbound leg (index 1, between start=0 and turnaround=3)
    // vs. the corresponding point on the return leg — same original
    // coordinate (oabPath is symmetric), should now differ after offsetting.
    const outboundMidIdx = 1;
    const returnMidIdx = oabPath.length - 1 - outboundMidIdx; // mirror index
    expect(oabPath[outboundMidIdx]).toEqual(oabPath[returnMidIdx]); // same original point
    // Each lane is offset laneOffsetMeters * ramp(t) from the shared center
    // point, in OPPOSITE perpendicular directions — so the two lanes should
    // be ~2 * laneOffsetMeters * ramp apart, not just "nonzero" (which,
    // pre-fix, was satisfied by sub-meter spherical float noise).
    const turnaroundIdx = (oabPath.length - 1) / 2;
    const t = outboundMidIdx / turnaroundIdx;
    const ramp = 4 * t * (1 - t);
    const expectedGap = 2 * laneOffsetMeters * ramp;
    const distApart = haversineMeters(
      offset[outboundMidIdx][1], offset[outboundMidIdx][0],
      offset[returnMidIdx][1], offset[returnMidIdx][0],
    );
    expect(distApart).toBeGreaterThan(laneOffsetMeters); // a real separation, not float noise
    expect(distApart).toBeCloseTo(expectedGap, 0);
  });
});

describe('computeRouteTurns — turnaround detection (15.08.2026, fixes U-turn mislabeled as "turn left")', () => {
  it('flags a genuine ~180° reversal as isTurnaround with the turnaround label, not an ordinary sharp turn', () => {
    const outbound: [number, number][] = [[34.77, 32.05], [34.78, 32.05], [34.79, 32.05]];
    const path = buildOutAndBackPath(outbound); // straight out, straight back — 180° at the turnaround
    const turns = computeRouteTurns(path);
    const turnaround = turns.find(t => t.isTurnaround);
    expect(turnaround).toBeDefined();
    expect(turnaround?.instruction).toBe('פנה לאחור');
  });

  it('an ordinary ~90° turn is NOT flagged as a turnaround and keeps its normal label', () => {
    // North then east — a clean 90° right turn, nowhere near a reversal.
    const path: [number, number][] = [[34.77, 32.05], [34.77, 32.06], [34.78, 32.06]];
    const turns = computeRouteTurns(path);
    expect(turns.length).toBeGreaterThan(0);
    for (const t of turns) {
      expect(t.isTurnaround).toBeFalsy();
      expect(t.instruction).not.toBe('פנה לאחור');
    }
  });
});

/** Straight due-north path: `segments` equal `hopMeters` hops from (startLat,startLng). */
function straightPath(segments: number, hopMeters: number, startLat = 32.0, startLng = 34.8): [number, number][] {
  const path: [number, number][] = [[startLng, startLat]];
  let lng = startLng;
  let lat = startLat;
  for (let i = 0; i < segments; i++) {
    const [nLng, nLat] = destinationPoint(lat, lng, hopMeters, 0);
    path.push([nLng, nLat]);
    lng = nLng;
    lat = nLat;
  }
  return path;
}

describe('pathLengthMeters (15.08.2026, direction-marker redesign)', () => {
  it('returns 0 for paths shorter than 2 points', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([[34.8, 32.0]])).toBe(0);
  });

  it('matches the sum of consecutive haversine distances', () => {
    const path = straightPath(4, 100);
    let expected = 0;
    for (let i = 0; i < path.length - 1; i++) {
      expected += haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    }
    expect(pathLengthMeters(path)).toBeCloseTo(expected, 3);
  });
});

describe('pointAtDistanceAlongPath (15.08.2026)', () => {
  const path = straightPath(4, 100); // 400m total, due north

  it('returns null for paths shorter than 2 points', () => {
    expect(pointAtDistanceAlongPath([], 10)).toBeNull();
    expect(pointAtDistanceAlongPath([[34.8, 32.0]], 10)).toBeNull();
  });

  it('returns the true start at distance <= 0', () => {
    const p = pointAtDistanceAlongPath(path, 0);
    expect(p![0]).toBeCloseTo(path[0][0], 9);
    expect(p![1]).toBeCloseTo(path[0][1], 9);
  });

  it('returns the true end at distance >= total length', () => {
    const p = pointAtDistanceAlongPath(path, 10000);
    const last = path[path.length - 1];
    expect(p![0]).toBeCloseTo(last[0], 9);
    expect(p![1]).toBeCloseTo(last[1], 9);
  });

  it('lands at the correct real-world distance partway through', () => {
    const p = pointAtDistanceAlongPath(path, 250);
    const distFromStart = haversineMeters(path[0][1], path[0][0], p![1], p![0]);
    expect(distFromStart).toBeCloseTo(250, 0);
  });
});

describe('buildDirectionMarkers (15.08.2026, route-direction-marker redesign)', () => {
  it('returns [] for paths shorter than 2 points', () => {
    expect(buildDirectionMarkers([])).toEqual([]);
    expect(buildDirectionMarkers([[34.8, 32.0]])).toEqual([]);
  });

  it('a very short route clamps to the minimum count (not crowded)', () => {
    const path = straightPath(2, 50); // 100m total — far below any spacing target
    const markers = buildDirectionMarkers(path, { minCount: 3, maxCount: 7, targetSpacingMeters: 500 });
    expect(markers.length).toBe(3);
  });

  it('a long route caps at the maximum count (constant density, not scaling with length)', () => {
    const path = straightPath(100, 200); // 20km — far above any spacing target
    const markers = buildDirectionMarkers(path, { minCount: 3, maxCount: 7, targetSpacingMeters: 500 });
    expect(markers.length).toBe(7);
  });

  it('a mid-length route lands inside the target range, roughly per the spacing formula', () => {
    const path = straightPath(60, 50); // 3000m total; 3000/500 = 6
    const markers = buildDirectionMarkers(path, { minCount: 3, maxCount: 7, targetSpacingMeters: 500 });
    expect(markers.length).toBe(6);
  });

  it('markers are evenly spaced by real distance along the path', () => {
    const path = straightPath(70, 50); // 3500m
    const markers = buildDirectionMarkers(path, { minCount: 3, maxCount: 7, targetSpacingMeters: 500 });
    const totalLength = pathLengthMeters(path);
    const distances = markers.map((m) => haversineMeters(path[0][1], path[0][0], m.lat, m.lng));
    const expectedStep = totalLength / (markers.length + 1);
    for (let i = 0; i < distances.length; i++) {
      expect(distances[i]).toBeCloseTo(expectedStep * (i + 1), -1); // within ~a few meters
    }
  });

  it('bearing reads as the net travel direction on a straight path (due north ≈ 0°)', () => {
    const path = straightPath(60, 50);
    const markers = buildDirectionMarkers(path);
    for (const m of markers) {
      expect(m.bearing).toBeCloseTo(0, 0);
    }
  });

  it('out-and-back: markers on the outbound lane point outbound, markers on the return lane point ~180° opposite, and the two lanes sit at different positions (lane-offset fix preserved)', () => {
    const outbound = straightPath(30, 50); // 1500m one-way, due north
    const oab = buildOutAndBackPath(outbound);
    const laneOffset = buildLaneOffsetPath(oab, 3);
    const markers = buildDirectionMarkers(laneOffset, { minCount: 4, maxCount: 4, targetSpacingMeters: 500 });
    expect(markers.length).toBe(4);

    // Circular comparison — a bearing of 359.7° is ~0.3° off true north, not
    // "far from 0" the way a plain numeric toBeCloseTo would read it.
    const angularDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    const outboundMarkers = markers.slice(0, 2);
    const returnMarkers = markers.slice(2);
    for (const m of outboundMarkers) expect(angularDiff(m.bearing, 0)).toBeLessThan(1); // heading north
    for (const m of returnMarkers) expect(angularDiff(m.bearing, 180)).toBeLessThan(1); // heading south

    // Confirm the two lanes are laterally separated, not literally coincident.
    // In the RAW (un-offset) out-and-back path, the point at total-distance d
    // along the outbound leg and the point at total-distance (totalLength-d)
    // along the return leg are the SAME physical street coordinate (that's
    // what makes it a mirror). After lane-offsetting, they should now sit a
    // few meters apart, not on top of each other.
    const totalLength = pathLengthMeters(laneOffset);
    const outboundPoint = pointAtDistanceAlongPath(laneOffset, 600)!;
    const returnPoint = pointAtDistanceAlongPath(laneOffset, totalLength - 600)!;
    const lateralGap = haversineMeters(outboundPoint[1], outboundPoint[0], returnPoint[1], returnPoint[0]);
    expect(lateralGap).toBeGreaterThan(1); // meters — genuinely separated, not overlapping
  });

  it('seamDistances: a marker forced to land exactly at the out-and-back turnaround still gets a sensible bearing (the approach direction), not a near-perpendicular one from straddling the reversal', () => {
    const outbound = straightPath(30, 50); // 1500m one-way, due north; turnaround at 1500m
    const oab = buildOutAndBackPath(outbound);
    const laneOffset = buildLaneOffsetPath(oab, 3);
    const totalLength = pathLengthMeters(laneOffset);
    const turnaroundIdx = (laneOffset.length - 1) / 2;
    const seamDistances = [pathLengthMeters(laneOffset.slice(0, turnaroundIdx + 1))];

    // Odd count (3) forces the middle marker to land at exactly
    // totalLength/2 — i.e. right on the seam. Without seamDistances, this
    // is the exact bug found live: the windowed before/after points sample
    // opposite lanes near the reversal, producing a ~perpendicular bearing.
    const withoutSeamFix = buildDirectionMarkers(laneOffset, { minCount: 3, maxCount: 3, targetSpacingMeters: 500 });
    const middleBroken = withoutSeamFix[1]; // fraction 2/4 = exactly totalLength/2
    const angularDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    expect(angularDiff(middleBroken.bearing, 0)).toBeGreaterThan(45); // confirms the bug reproduces without the fix

    const withSeamFix = buildDirectionMarkers(laneOffset, { minCount: 3, maxCount: 3, targetSpacingMeters: 500, seamDistances });
    const middleFixed = withSeamFix[1];
    // One-sided fallback (approach direction) — still reads as "heading
    // outbound/north", not the degenerate perpendicular bearing.
    expect(angularDiff(middleFixed.bearing, 0)).toBeLessThan(5);
    void totalLength;
  });
});
