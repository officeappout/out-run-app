/**
 * DIAGNOSTIC — David's item 4 (22.09.2026, field-test doc 13): proves the
 * skip-station reducer/controller changes end-to-end against the REAL
 * (unmocked) createHybridSessionController + finalizeHybridRun. Pure logic,
 * no I/O, no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import { createHybridSessionController } from '../hybrid-session-controller';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';

function sandwichPlan(): HybridPlannedSegment[] {
  return [
    { index: 0, kind: 'aerobic', estCalories: 80, aerobicType: 'walking', zone: 'jogging',
      targetPaceSecPerKm: { min: 360, max: 420 }, durationSec: 600, distanceKm: 1.0, fromKm: 0, toKm: 1.0 } as any,
    { index: 1, kind: 'strength', estCalories: 60, stopId: 'stop-A', parkId: 'park-A',
      locationKind: 'gym', activityType: 'strength', domainFocus: 'pull',
      content: { exercises: [{}], estimatedDurationSec: 540, totalPlannedSets: 9, isEmpty: false, log: [] } as any,
      durationSec: 540 } as any,
    { index: 2, kind: 'aerobic', estCalories: 80, aerobicType: 'walking', zone: 'recovery',
      targetPaceSecPerKm: { min: 420, max: 480 }, durationSec: 600, distanceKm: 1.0, fromKm: 1.0, toKm: 2.0 } as any,
  ];
}

describe('skipStation — real controller + reducer, no mocking needed', () => {
  it('closes the station unrecorded and resumes the next leg', () => {
    const c = createHybridSessionController(sandwichPlan());
    c.start(1_000_000);
    c.tick(1.0, 600);
    c.arrive(1.0, 600, 1_600_000);
    expect(c.getPhase()).toBe('station');
    expect(c.getActiveStation()?.stopId).toBe('stop-A');

    c.skipStation(1_601_000); // declined almost immediately — occupied equipment, say

    expect(c.getPhase()).toBe('aerobic'); // resumed the next leg, not stuck
  });

  it('finalize: the skipped station carries skipped:true, no sets/exerciseLog, and does not count toward completedStrengthSegments', () => {
    const c = createHybridSessionController(sandwichPlan());
    c.start(1_000_000);
    c.tick(1.0, 600);
    c.arrive(1.0, 600, 1_600_000);
    c.skipStation(1_601_000);
    c.finish(2.0, 1200, 2_201_000);

    const result = c.finalize();
    console.log('[VERIFY] finalize() after a skipped station:', JSON.stringify(result, null, 2));

    expect(result.segments).toHaveLength(3);
    const stationRecord = result.segments[1];
    expect(stationRecord.kind).toBe('strength');
    expect(stationRecord.skipped).toBe(true);
    expect(stationRecord.actual?.sets).toBe(0); // explicitly zero, not "as if it happened"
    expect(stationRecord.actual?.exerciseLog).toBeUndefined();

    // The key anti-exploit property: a skipped station must NOT read as a
    // completed one anywhere in the summary — same guarantee the (untouched)
    // "zero stops" / "never reached" case already had.
    expect(result.summary.completedStrengthSegments).toBe(0);
    expect(result.summary.totalStrengthSets).toBe(0);
    expect(result.summary.bothHalvesCompleted).toBe(false); // strength half was NOT completed
    expect(result.summary.completedAerobicSegments).toBe(2); // both walks still count
  });

  it('control: completing (not skipping) the same station records it normally, for comparison', () => {
    const c = createHybridSessionController(sandwichPlan());
    c.start(1_000_000);
    c.tick(1.0, 600);
    c.arrive(1.0, 600, 1_600_000);
    c.completeStation(9, 540, 2_140_000);
    c.finish(2.0, 1140, 2_680_000);

    const result = c.finalize();
    const stationRecord = result.segments[1];
    expect(stationRecord.skipped).toBeUndefined(); // absent entirely, not false
    expect(stationRecord.actual?.sets).toBe(9);
    expect(result.summary.completedStrengthSegments).toBe(1);
    expect(result.summary.bothHalvesCompleted).toBe(true);
  });
});
