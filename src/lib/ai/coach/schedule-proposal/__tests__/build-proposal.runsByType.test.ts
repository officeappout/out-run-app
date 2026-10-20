/**
 * enable_home_v2 (AdvisorInput.runsByType): Kelly's proposals protect the long-run day home
 * shows (by slot type, running.longRunDay), not the 2nd run day. Off: unchanged.
 */
import { describe, it, expect } from 'vitest';
import { input, runningPart, strengthProfile } from '@/features/schedule/advisor/__tests__/fixtures';
import type { RunEntry } from '@/features/schedule/advisor/__tests__/fixtures';
import { buildScheduleProposal } from '../build-proposal';

// Runs Sun / Tue / Thu stored Q1 → L → Q2; the user's long-run day is Sunday.
const SCHEDULE: RunEntry[] = Array.from({ length: 8 }, (_, i) => i + 1).flatMap((wk) => [
  { week: wk, day: 1, category: 'short_intervals', slotType: 'quality_primary', isQualityWorkout: true },
  { week: wk, day: 2, category: 'long_run', slotType: 'long_run', isQualityWorkout: false },
  { week: wk, day: 3, category: 'tempo', slotType: 'quality_secondary', isQualityWorkout: true },
]);
const profile = () =>
  strengthProfile({ ב: ['push'], ו: ['pull'] }, { running: { ...runningPart(['א', 'ג', 'ה'], SCHEDULE), longRunDay: 0 } });

describe('buildScheduleProposal — long-run day by type', () => {
  it('on: strength can not move onto Sunday (the long run home shows)', () => {
    const r = buildScheduleProposal(input(profile(), { runsByType: true }), { scope: 'from_now', moves: [{ from: 'monday', to: 'sunday' }] });
    expect(r).toMatchObject({ ok: false, reason: 'long_run_day', day: 'ראשון' });
  });

  it('on: Tuesday is no longer the long-run day', () => {
    const r = buildScheduleProposal(input(profile(), { runsByType: true }), { scope: 'from_now', moves: [{ from: 'monday', to: 'tuesday' }] });
    expect(r.ok || r.reason !== 'long_run_day').toBe(true);
  });

  it('off: unchanged — Tuesday (the 2nd run day) is the long-run day', () => {
    const r = buildScheduleProposal(input(profile()), { scope: 'from_now', moves: [{ from: 'monday', to: 'tuesday' }] });
    expect(r).toMatchObject({ ok: false, reason: 'long_run_day', day: 'שלישי' });
    expect(buildScheduleProposal(input(profile(), { runsByType: false }), { scope: 'from_now', moves: [{ from: 'monday', to: 'tuesday' }] })).toEqual(r);
  });
});
