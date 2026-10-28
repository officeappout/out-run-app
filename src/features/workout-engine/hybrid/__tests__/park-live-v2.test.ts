import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import {
  applyStationDifficulty, planStationDifficulty, stationIntroView, walkCardView, stationMessageM, isWalkingLeg,
  DEFAULT_STATION_DIFFICULTY, nextMachineIndex, isMachineTabataSegment, messageRowKind,
} from '../park-live-v2';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import type { SequencerView } from '../../engines/hybrid/sequencer.selectors';

const machine = (id: string, muscles: string[]) => ({
  id, name: `מכשיר ${id}`, imageUrl: `https://img/${id}.jpg`, muscleGroups: muscles, restSeconds: 30, duration: '30 שנ׳',
});

function plan(): WorkoutPlan {
  return {
    id: 'p', name: 'גינה', totalDuration: 480, difficulty: 'medium', trainingType: 'strength', workoutLocation: 'park',
    segments: [
      { id: 'warm', type: 'station', title: 'חימום', icon: '', target: { type: 'reps', value: 12 }, isCompleted: false, exercises: [] },
      {
        id: 't0', type: 'station', title: 'גינה', icon: '', isCompleted: false, protocol: 'tabata',
        target: { type: 'time', value: 240 },
        protocolConfig: { workSec: 30, restSec: 30, rounds: 8, orderMode: 'exercise-major' },
        exercises: [machine('a', ['chest', 'shoulders']), machine('b', ['triceps', 'chest']), machine('c', ['back']), machine('d', [])],
      },
      {
        id: 'core', type: 'station', title: 'ליבה', icon: '', isCompleted: false, protocol: 'tabata',
        target: { type: 'time', value: 160 },
        protocolConfig: { workSec: 20, restSec: 10, rounds: 8 },
        exercises: [machine('e', ['core'])],
      },
    ],
  } as unknown as WorkoutPlan;
}

describe('station difficulty (M11)', () => {
  it('defaults to easy', () => expect(DEFAULT_STATION_DIFFICULTY).toBe('easy'));

  it('reads the composed difficulty from the machine tabata', () => {
    expect(planStationDifficulty(plan())).toBe('medium');
    expect(planStationDifficulty(null)).toBeNull();
  });

  it('rewrites only machine-tabata work/rest; rounds and length stay', () => {
    const p = plan();
    const out = applyStationDifficulty(p, 'easy');
    const t0 = out.segments[1];
    expect(t0.protocolConfig).toEqual({ workSec: 20, restSec: 40, rounds: 8, orderMode: 'exercise-major' });
    expect(t0.target.value).toBe(160);
    expect((t0.exercises?.[0] as { restSeconds?: number }).restSeconds).toBe(40);
    expect((t0.exercises?.[0] as { duration?: string }).duration).toBe('20 שנ׳');
    // core tabata (20/10) untouched, by identity
    expect(out.segments[2]).toBe(p.segments[2]);
    expect(out.segments[0]).toBe(p.segments[0]);
    // input not mutated
    expect(p.segments[1].protocolConfig).toMatchObject({ workSec: 30, restSec: 30 });
  });

  it('returns the same plan when nothing changes', () => {
    const p = plan();
    expect(applyStationDifficulty(p, 'medium')).toBe(p);
  });
});

describe('stationIntroView (M10, M13)', () => {
  it('lists the machines and the union of their muscles', () => {
    const v = stationIntroView(plan())!;
    expect(v.machines.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(v.muscles).toEqual(['chest', 'shoulders', 'triceps', 'back']);
    expect(v.roundsPerMachine).toBe(2);
    expect(v.workSec).toBe(30);
    expect(v.totalMin).toBe(8);
  });

  it('is null without machine tabata', () => {
    const p = plan();
    expect(stationIntroView({ ...p, segments: [p.segments[0], p.segments[2]] })).toBeNull();
  });
});

const view = (over: Partial<SequencerView>): SequencerView => ({
  phase: 'run', cursor: 0, segment: { kind: 'aerobic', aerobicType: 'walking' } as never, upcomingStation: null,
  leg: { coveredM: 620, elapsedSec: 462, targetM: 1000, targetSec: null, remainingM: 380, remainingSec: null } as never,
  distanceToStationM: 450, approaching: false, canArriveManually: true, transitionRemainingMs: null, paused: false,
  stationNumber: 1, stationTotal: 2, ...over,
});

describe('walk card + station message (M2, M22)', () => {
  it('walk card: time, km, GPS distance to the station', () => {
    expect(walkCardView(view({}))).toEqual({ elapsedSec: 462, km: 0.62, toStationM: 450 });
  });

  it('falls back to the leg remainder, and null with no station ahead', () => {
    expect(walkCardView(view({ distanceToStationM: null }))?.toStationM).toBe(380);
    expect(walkCardView(view({ canArriveManually: false }))?.toStationM).toBeNull();
    expect(walkCardView(view({ leg: null }))).toBeNull();
  });

  it('station message only within 300 m, rounded to 10 m', () => {
    expect(stationMessageM(view({}))).toBeNull();
    expect(stationMessageM(view({ distanceToStationM: 196 }))).toBe(200);
    expect(stationMessageM(view({ distanceToStationM: 196, phase: 'station' }))).toBeNull();
    expect(stationMessageM(view({ distanceToStationM: 196, canArriveManually: false }))).toBeNull();
  });

  it('walking legs only', () => {
    expect(isWalkingLeg(view({}))).toBe(true);
    expect(isWalkingLeg(view({ segment: { kind: 'aerobic', aerobicType: 'running' } as never }))).toBe(false);
    expect(isWalkingLeg(null)).toBe(false);
  });
});

describe('rest: find the next machine (M19)', () => {
  const names = ['א', 'ב', 'ג'];
  it('points at the next machine, not at round 2 of the same one', () => {
    expect(nextMachineIndex(names, 0, 'ב')).toBe(1);
    expect(nextMachineIndex(names, 0, 'א')).toBeNull();
    expect(nextMachineIndex(names, 2, null)).toBeNull();
    expect(nextMachineIndex(names, 2, 'א')).toBe(0);
  });

  it('machine tabata only', () => {
    const p = plan();
    expect(isMachineTabataSegment(p.segments[1])).toBe(true);
    expect(isMachineTabataSegment(p.segments[2])).toBe(false);
    expect(isMachineTabataSegment(null)).toBe(false);
  });
});

describe('message row priority (M2)', () => {
  it('imminent turn > station > turn', () => {
    expect(messageRowKind({ imminent: true }, 200)).toBe('turnWide');
    expect(messageRowKind({ imminent: false }, 200)).toBe('station');
    expect(messageRowKind({ imminent: false }, null)).toBe('turn');
    expect(messageRowKind(null, 200)).toBe('station');
    expect(messageRowKind(null, null)).toBeNull();
  });
});
