/**
 * running.lastWorkoutDate is now written for done / covered runs (owner 23.10.2026). Its readers keep
 * working: a fresh date means "no gap" everywhere; a newer run only shortens calm return's daysAway.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn() }));

import { newerLastWorkoutDate } from '../planned-run-complete';
import { resolveProgramAlignment } from '../running-alignment';
import { getDaysAway } from '@/lib/calm-return/days-away';
import { resolveRunningContentSituation } from '@/features/workout-engine/services/workout-metadata.service';

const NOW = new Date('2026-10-23T18:00:00');
const program = { startDate: new Date('2026-10-01T00:00:00'), schedule: [] };

describe('newerLastWorkoutDate', () => {
  it('writes when missing or older, never moves backwards', () => {
    expect(newerLastWorkoutDate(undefined, '2026-10-23T08:00:00.000Z')).toBe('2026-10-23T08:00:00.000Z');
    expect(newerLastWorkoutDate('2026-10-01T08:00:00.000Z', '2026-10-23T08:00:00.000Z')).toBe('2026-10-23T08:00:00.000Z');
    expect(newerLastWorkoutDate('2026-10-24T08:00:00.000Z', '2026-10-23T08:00:00.000Z')).toBeNull();
    expect(newerLastWorkoutDate('2026-10-23T08:00:00.000Z', '2026-10-23T08:00:00.000Z')).toBeNull();
    expect(newerLastWorkoutDate('garbage', '2026-10-23T08:00:00.000Z')).toBe('2026-10-23T08:00:00.000Z');
    expect(newerLastWorkoutDate(undefined, 'nope')).toBeNull();
  });
});

describe('readers after a run today', () => {
  const today = '2026-10-23T08:00:00.000Z';
  it('running alignment: no realign / rebuild right after a run', () => {
    expect(resolveProgramAlignment(program, today, NOW)).toEqual({ type: 'none' });
  });
  it('running alignment after a long break: realign (7+) / rebuild (21+) — the intended calmer restart', () => {
    expect(resolveProgramAlignment(program, '2026-10-10T08:00:00.000Z', NOW).type).toBe('plan_realign');
    expect(resolveProgramAlignment(program, '2026-09-20T08:00:00.000Z', NOW).type).toBe('rebuild');
  });
  it('calm return: the LATEST date wins, so a new run only shortens daysAway', () => {
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-01' }, running: { lastWorkoutDate: today } }, NOW)).toBe(0);
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-22' }, running: { lastWorkoutDate: '2026-10-01T08:00:00.000Z' } }, NOW)).toBe(1);
  });
  it('planned-run copy: not "returning" right after a run', () => {
    expect(resolveRunningContentSituation(today, NOW)).toBeUndefined();
  });
});
