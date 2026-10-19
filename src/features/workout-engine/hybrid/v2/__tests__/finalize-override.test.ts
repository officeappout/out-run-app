import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => ({
  useRunningPlayer: { getState: () => ({ finishWorkout: async () => undefined }) },
}));

import type { HybridPlan, HybridPlannedSegment } from '../../compose-hybrid-session.service';
import type { HybridFinalizeResult } from '../../hybrid-orchestrator';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { hybridRunSnapshot, setHybridFinalizeOverride, useHybridRun } from '../../useHybridRun';

const SEGMENTS: HybridPlannedSegment[] = [
  { index: 0, kind: 'aerobic', aerobicType: 'running', distanceKm: 1, durationSec: 360, fromKm: 0, toKm: 1, estCalories: 50 },
  { index: 1, kind: 'strength', parkId: 'p1', content: { exercises: [], totalPlannedSets: 3, estimatedDurationSec: 300, isEmpty: false, log: [] } as unknown as HybridPlannedSegment['content'], estCalories: 30 },
  { index: 2, kind: 'aerobic', aerobicType: 'running', distanceKm: 1, durationSec: 360, fromKm: 1, toKm: 2, estCalories: 50 },
];
const PLAN = { segments: SEGMENTS, totals: { estCalories: 130 } } as unknown as HybridPlan;

function start() {
  useHybridRun.getState().reset();
  useHybridRun.getState().startHybrid(PLAN, 'running', false, true, { p1: 'פארק' });
  useSessionStore.setState({ totalDistance: 1.2, totalDuration: 600 });
}

describe('useHybridRun — home v2 additions', () => {
  beforeEach(() => setHybridFinalizeOverride(null));

  it('exposes the running plan + station names, cleared by reset', () => {
    start();
    expect(useHybridRun.getState().plan).toBe(SEGMENTS);
    expect(useHybridRun.getState().stationNames).toEqual({ p1: 'פארק' });
    expect(hybridRunSnapshot()?.phase).toBe('aerobic');
    useHybridRun.getState().reset();
    expect(useHybridRun.getState().plan).toBeNull();
    expect(hybridRunSnapshot()).toBeNull();
  });

  it('no override → the controller result (today)', async () => {
    start();
    await useHybridRun.getState().finishHybrid();
    const r = useHybridRun.getState().lastResult;
    expect(r?.segments[0].actual?.distanceKm).toBeCloseTo(1.2);
  });

  it('override → finishHybrid saves the provider result with the session totals', async () => {
    start();
    const custom = { segments: [{ actual: { durationSec: 900 } }], summary: { totalActualDistanceKm: 3, totalStrengthSets: 4, totalActualAerobicSec: 600 } } as unknown as HybridFinalizeResult;
    const seen: Array<{ cumulativeKm: number; elapsedSec: number }> = [];
    setHybridFinalizeOverride((t) => {
      seen.push(t);
      return custom;
    });
    await useHybridRun.getState().finishHybrid();
    expect(useHybridRun.getState().lastResult).toBe(custom);
    expect(seen[0]).toMatchObject({ cumulativeKm: 1.2, elapsedSec: 600 });
  });

  it('override returning null or throwing falls back to the controller', async () => {
    start();
    setHybridFinalizeOverride(() => {
      throw new Error('boom');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await useHybridRun.getState().finishHybrid();
    expect(useHybridRun.getState().lastResult?.segments.length).toBeGreaterThan(0);
    err.mockRestore();
  });
});
