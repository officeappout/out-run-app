import { describe, expect, it } from 'vitest';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import { freeLegSegment, hybridReduceAll, initHybridRun, finalizeHybridRun } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import { initSequencer, reduceSequencer, reduceSequencerAll } from '../hybrid/hybrid-sequencer';
import { finalizeSequencer } from '../hybrid/sequencer.selectors';
import { appendedTail } from '../hooks/useHybridSequencer';

// M25: keep walking freely after the LAST station, one workout.
const content = { exercises: [], totalPlannedSets: 3, estimatedDurationSec: 300 } as unknown as HybridPlannedSegment['content'];
const walkThenStation = (): HybridPlannedSegment[] => [
  { index: 0, kind: 'aerobic', aerobicType: 'walking', distanceKm: 1, durationSec: 600, fromKm: 0, toKm: 1, estCalories: 0 },
  { index: 1, kind: 'strength', parkId: 'p1', content, estCalories: 0 },
];

describe('orchestrator APPEND_LEG', () => {
  it('adds an open leg at the last station; STATION_DONE moves into it; FINISH records it', () => {
    const plan = walkThenStation();
    const free = freeLegSegment(2, 'walking');
    const s = hybridReduceAll(initHybridRun(plan), [
      { type: 'START', atMs: 0 },
      { type: 'ARRIVE_STATION', cumulativeKm: 1, elapsedSec: 600, atMs: 600_000 },
      { type: 'APPEND_LEG', segment: free },
      { type: 'STATION_DONE', completedSets: 3, actualDurationSec: 0, atMs: 900_000 },
    ]);
    expect(s.plan).toHaveLength(3);
    expect(s.plan[2]).toBe(free);
    expect(s.phase).toBe('aerobic');
    expect(s.cursor).toBe(2);
    const done = hybridReduceAll(s, [{ type: 'FINISH', cumulativeKm: 1.8, elapsedSec: 1200, atMs: 1_500_000 }]);
    const r = finalizeHybridRun(done);
    expect(r.segments).toHaveLength(3);
    expect(r.segments[2].actual).toEqual({ durationSec: 600, distanceKm: 0.8 });
    expect(r.summary.totalActualDistanceKm).toBe(1.8);
  });
  it('ignored anywhere but the last station', () => {
    const plan = [...walkThenStation(), { index: 2, kind: 'aerobic', aerobicType: 'walking', estCalories: 0 } as HybridPlannedSegment];
    const s = hybridReduceAll(initHybridRun(plan), [
      { type: 'START', atMs: 0 },
      { type: 'ARRIVE_STATION', cumulativeKm: 1, elapsedSec: 600, atMs: 1 },
      { type: 'APPEND_LEG', segment: freeLegSegment(3, 'walking') },
    ]);
    expect(s.plan).toHaveLength(3);
    const idle = hybridReduceAll(initHybridRun(walkThenStation()), [{ type: 'APPEND_LEG', segment: freeLegSegment(2, 'walking') }]);
    expect(idle.plan).toHaveLength(2);
  });
});

describe('sequencer APPEND_LEG', () => {
  it('station → free leg (cool-down) → finish, the walk kept in the result', () => {
    const plan = walkThenStation();
    let s = reduceSequencerAll(initSequencer(plan, { transitionSec: 0 }), [
      { type: 'START', atMs: 0 },
      { type: 'RUN_TICK', atMs: 600_000, cumulativeKm: 1, elapsedSec: 600 },
      { type: 'ARRIVE_MANUAL', atMs: 600_000 },
    ]);
    expect(s.phase).toBe('station');
    s = reduceSequencer(s, { type: 'APPEND_LEG', atMs: 900_000, segment: freeLegSegment(2, 'walking') });
    s = reduceSequencer(s, { type: 'STATION_DONE', atMs: 900_000, completedSets: 3 });
    expect(s.phase).toBe('cooldown');
    s = reduceSequencerAll(s, [
      { type: 'RUN_TICK', atMs: 1_200_000, cumulativeKm: 1.5, elapsedSec: 900 },
      { type: 'FINISH', atMs: 1_200_000 },
    ]);
    expect(s.phase).toBe('done');
    const r = finalizeSequencer(s);
    expect(r.segments.map((x) => x.kind)).toEqual(['aerobic', 'strength', 'aerobic']);
    expect(r.segments[2].actual?.distanceKm).toBe(0.5);
  });
  it('outside a station it is ignored', () => {
    const s = reduceSequencer(initSequencer(walkThenStation()), { type: 'APPEND_LEG', atMs: 0, segment: freeLegSegment(2, 'walking') });
    expect(s.inner.plan).toHaveLength(2);
  });
});

describe('appendedTail (the hook extends instead of restarting)', () => {
  it('same objects + more → the tail; anything else → null', () => {
    const plan = walkThenStation();
    const free = freeLegSegment(2, 'walking');
    expect(appendedTail(plan, [...plan, free])).toEqual([free]);
    expect(appendedTail(plan, [...plan])).toBeNull();
    expect(appendedTail(plan, [{ ...plan[0] }, plan[1], free])).toBeNull();
    expect(appendedTail(null, plan)).toBeNull();
  });
});
