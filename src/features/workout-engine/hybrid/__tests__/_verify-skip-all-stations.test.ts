/**
 * DIAGNOSTIC — merge-checklist item 6 (22.09.2026): David asked what happens
 * if a resident skips EVERY station on a route_stops walk — does the workout
 * end cleanly, get stuck, or crash? The single-skip proof already existed
 * (_verify-skip-station.test.ts, one station in a 3-segment sandwich). This
 * extends it to a 2-station route_stops-shaped plan (aerobic-station-aerobic-
 * station-aerobic) with BOTH stations skipped, against the real (unmocked)
 * createHybridSessionController + finalizeHybridRun.
 */
import { describe, it, expect } from 'vitest';
import { createHybridSessionController } from '../hybrid-session-controller';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';

function routeStopsShapedPlan(): HybridPlannedSegment[] {
  return [
    { index: 0, kind: 'aerobic', estCalories: 60, aerobicType: 'walking', zone: 'jogging',
      targetPaceSecPerKm: { min: 360, max: 420 }, durationSec: 480, distanceKm: 0.8, fromKm: 0, toKm: 0.8 } as any,
    { index: 1, kind: 'strength', estCalories: 50, stopId: 'stop-A', parkId: 'park-A',
      locationKind: 'gym', activityType: 'strength', domainFocus: 'pull',
      content: { exercises: [{}], estimatedDurationSec: 420, totalPlannedSets: 8, isEmpty: false, log: [] } as any,
      durationSec: 420 } as any,
    { index: 2, kind: 'aerobic', estCalories: 60, aerobicType: 'walking', zone: 'jogging',
      targetPaceSecPerKm: { min: 360, max: 420 }, durationSec: 480, distanceKm: 0.8, fromKm: 0.8, toKm: 1.6 } as any,
    { index: 3, kind: 'strength', estCalories: 40, stopId: 'stop-B', parkId: 'park-B',
      locationKind: 'gym', activityType: 'core', domainFocus: 'legs_core',
      content: { exercises: [{}], estimatedDurationSec: 300, totalPlannedSets: 6, isEmpty: false, log: [] } as any,
      durationSec: 300 } as any,
    { index: 4, kind: 'aerobic', estCalories: 80, aerobicType: 'walking', zone: 'recovery',
      targetPaceSecPerKm: { min: 420, max: 480 }, durationSec: 600, distanceKm: 1.0, fromKm: 1.6, toKm: 2.6 } as any,
  ];
}

describe('skipping EVERY station on a route_stops-shaped walk — real controller, no mocking', () => {
  it('skipping both stations advances cleanly through all 5 segments — never stuck', () => {
    const c = createHybridSessionController(routeStopsShapedPlan());
    c.start(1_000_000);

    c.tick(0.8, 480);
    c.arrive(0.8, 480, 1_480_000);
    expect(c.getPhase()).toBe('station');
    expect(c.getActiveStation()?.stopId).toBe('stop-A');
    c.skipStation(1_481_000);
    expect(c.getPhase()).toBe('aerobic'); // resumed leg 2, not stuck at station 1

    c.tick(1.6, 960);
    c.arrive(1.6, 960, 1_961_000);
    expect(c.getPhase()).toBe('station');
    expect(c.getActiveStation()?.stopId).toBe('stop-B');
    c.skipStation(1_962_000);
    expect(c.getPhase()).toBe('aerobic'); // resumed leg 3 (final), not stuck at station 2

    c.tick(2.6, 1560);
    c.finish(2.6, 1560, 2_562_000);

    const result = c.finalize();
    console.log('[VERIFY] finalize() after skipping every station:', JSON.stringify(result.summary, null, 2));

    // Clean finish, not stuck/crashed: all 5 planned segments are present.
    expect(result.segments).toHaveLength(5);

    // Both stations recorded as skipped, zero sets, zero exercise log.
    const stationRecords = result.segments.filter((s) => s.kind === 'strength');
    expect(stationRecords).toHaveLength(2);
    for (const rec of stationRecords) {
      expect(rec.skipped).toBe(true);
      expect(rec.actual?.sets).toBe(0);
      expect(rec.actual?.exerciseLog).toBeUndefined();
    }

    // Anti-exploit guarantee generalizes from 1-skip to all-skip: zero
    // strength credit anywhere in the summary.
    expect(result.summary.completedStrengthSegments).toBe(0);
    expect(result.summary.totalStrengthSets).toBe(0);
    expect(result.summary.bothHalvesCompleted).toBe(false);

    // The walked/run legs still count normally — skipping stations doesn't
    // zero out the aerobic half too.
    expect(result.summary.completedAerobicSegments).toBe(3);
    expect(result.summary.totalActualDistanceKm).toBeGreaterThan(0);
  });

  it('a station that happens to be the LAST plan segment still finishes cleanly when skipped (no dangling FINISH needed)', () => {
    const stationLastPlan: HybridPlannedSegment[] = [
      { index: 0, kind: 'aerobic', estCalories: 60, aerobicType: 'walking', zone: 'jogging',
        targetPaceSecPerKm: { min: 360, max: 420 }, durationSec: 480, distanceKm: 0.8, fromKm: 0, toKm: 0.8 } as any,
      { index: 1, kind: 'strength', estCalories: 50, stopId: 'stop-A', parkId: 'park-A',
        locationKind: 'gym', activityType: 'strength', domainFocus: 'pull',
        content: { exercises: [{}], estimatedDurationSec: 420, totalPlannedSets: 8, isEmpty: false, log: [] } as any,
        durationSec: 420 } as any,
    ];
    const c = createHybridSessionController(stationLastPlan);
    c.start(1_000_000);
    c.tick(0.8, 480);
    c.arrive(0.8, 480, 1_480_000);
    expect(c.getPhase()).toBe('station');
    c.skipStation(1_481_000);

    // No FINISH event needed/possible here (FINISH requires phase 'aerobic') —
    // the reducer's own "no next segment" branch closes the run directly.
    const result = c.finalize();
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].skipped).toBe(true);
    expect(result.summary.bothHalvesCompleted).toBe(false);
    expect(result.summary.completedAerobicSegments).toBe(1);
  });
});
