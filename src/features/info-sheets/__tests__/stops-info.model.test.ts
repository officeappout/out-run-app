import { describe, it, expect } from 'vitest';
import { buildStopsInfo, stopsPhases, type StopsSegmentInput } from '../stops/stops-info.model';
import type { OverviewLeg } from '@/features/parks/core/components/overview/overview-legs';

const aer = (key: string, title: string): OverviewLeg => ({ kind: 'aerobic', key, layout: 'destination', title, meta: [], durationSec: 600 });
const stn = (ref: number): OverviewLeg => ({ kind: 'station', key: `stn${ref}`, ref, durationSec: 540 });
const strength = (n: number, extra: Partial<NonNullable<StopsSegmentInput['content']>> = {}): StopsSegmentInput => ({
  kind: 'strength',
  content: { exercises: Array.from({ length: n }, (_, i) => ({ id: i })), ...extra },
});
const walk: StopsSegmentInput = { kind: 'aerobic' };

describe('buildStopsInfo (board StopsCard v111)', () => {
  it('walk into the station, the station, the walk back', () => {
    const legs = [aer('leg0', 'אל גן הכרמל'), stn(1), aer('leg2', 'חזרה לנקודת ההתחלה')];
    const m = buildStopsInfo(legs, [walk, strength(3), walk])!;
    expect(m.walkTo.key).toBe('leg0');
    expect(m.stationRef).toBe(1);
    expect(m.stationDurationSec).toBe(540);
    expect(m.walkBack?.key).toBe('leg2');
  });

  it('transport legs are not the walk into the station', () => {
    const legs: OverviewLeg[] = [
      { kind: 'transport', key: 'walk-there', phase: 'there', label: 'הליכה', minutes: 5 },
      aer('leg0', 'אל גן הכרמל'),
      stn(1),
      aer('leg2', 'חזרה'),
      { kind: 'transport', key: 'walk-back', phase: 'back', label: 'הליכה', minutes: 5 },
    ];
    const m = buildStopsInfo(legs, [walk, strength(2), walk])!;
    expect(m.walkTo.key).toBe('leg0');
    expect(m.walkBack?.key).toBe('leg2');
  });

  it('fallback: nothing after the station → the demo ends there', () => {
    const m = buildStopsInfo([aer('leg0', 'אל'), stn(1)], [walk, strength(2)])!;
    expect(m.walkBack).toBeNull();
    expect(stopsPhases(m, false).map((p) => p.phase)).toEqual(['walk', 'peek', 'station']);
  });

  it('a locked station (questionnaire) is skipped for the next real one', () => {
    const legs = [aer('leg0', 'a'), stn(1), aer('leg2', 'b'), stn(3), aer('leg4', 'c')];
    const m = buildStopsInfo(legs, [walk, strength(2, { needsAssessment: { fallbackHint: 'x' } }), walk, strength(2), walk])!;
    expect(m.stationRef).toBe(3);
    expect(m.walkTo.key).toBe('leg2');
  });

  it('no usable station → no "i"', () => {
    expect(buildStopsInfo([aer('leg0', 'a')], [walk])).toBeNull();
    expect(buildStopsInfo([aer('leg0', 'a'), stn(1)], [walk, strength(0)])).toBeNull();
    expect(buildStopsInfo([aer('leg0', 'a'), stn(1)], [walk, strength(2, { needsAssessment: {} })])).toBeNull();
  });

  it('no walk into the station → no "i"', () => {
    expect(buildStopsInfo([stn(0), aer('leg1', 'a')], [strength(2), walk])).toBeNull();
  });

  it('the loop is ~14s; reduced motion never drops the sheet', () => {
    const m = buildStopsInfo([aer('leg0', 'a'), stn(1), aer('leg2', 'b')], [walk, strength(2), walk])!;
    const full = stopsPhases(m, false);
    expect(full.map((p) => p.phase)).toEqual(['walk', 'peek', 'station', 'back']);
    expect(full.reduce((n, p) => n + p.ms, 0)).toBeGreaterThanOrEqual(13000);
    expect(full.reduce((n, p) => n + p.ms, 0)).toBeLessThanOrEqual(15000);
    expect(stopsPhases(m, true).map((p) => p.phase)).toEqual(['walk', 'station', 'back']);
  });
});
