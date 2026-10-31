import { describe, expect, it } from 'vitest';
import { amrapWithRunAllowed, comboTimeSplit, normalizeComboRequest, type ComboRequest } from '../combo-request';
import { amrapComboConfig, comboLegMeters, emomComboConfig } from '../combo-blocks';

const req = (over: Partial<ComboRequest> = {}): ComboRequest => ({ aerobic: 'run', strength: 'amrap', order: 'inside', place: 'park', timeMin: 20, ...over });

describe('AMRAP / EMOM with a run inside: owner gate (level 8 in BOTH pull and push)', () => {
  it('both ≥ 8 → allowed; one below, or unassessed → not', () => {
    expect(amrapWithRunAllowed({ push: 8, pull: 9 })).toBe(true);
    expect(amrapWithRunAllowed({ push: 12, pull: 7 })).toBe(false);
    expect(amrapWithRunAllowed({ push: 10 })).toBe(false);
    expect(amrapWithRunAllowed({})).toBe(false);
  });
  it('below the gate the request becomes "run first, then the timed block", and says why', () => {
    const n = normalizeComboRequest(req(), { push: 5, pull: 5 });
    expect(n.request.order).toBe('aerobic_first');
    expect(n.adjustments).toContain('run_inside_needs_level');
    expect(normalizeComboRequest(req(), { push: 8, pull: 8 }).request.order).toBe('inside');
  });
});

describe('normalizeComboRequest', () => {
  it('inside needs a timed block and an aerobic part', () => {
    expect(normalizeComboRequest(req({ strength: 'tabata' }), { push: 9, pull: 9 }).adjustments).toContain('inside_needs_timed');
    expect(normalizeComboRequest(req({ aerobic: 'none' }), { push: 9, pull: 9 }).request.order).toBe('strength_first');
  });
  it('clamps the time, drops a bad second-part time, never returns an empty request', () => {
    expect(normalizeComboRequest(req({ timeMin: 200 }), {}).request.timeMin).toBe(90);
    expect(normalizeComboRequest(req({ secondPart: { strength: 'core', at: '25:00' } }), {}).request.secondPart).toBeUndefined();
    expect(normalizeComboRequest(req({ secondPart: { strength: 'core', at: '18:30' } }), {}).request.secondPart?.at).toBe('18:30');
    const empty = normalizeComboRequest(req({ aerobic: 'none', strength: 'none' }), {});
    expect(empty.request.aerobic).toBe('walk');
    expect(empty.adjustments).toContain('nothing_asked');
  });
});

describe('comboTimeSplit', () => {
  it('tabata / core are short finishers; sets take ~45%; inside is one block', () => {
    expect(comboTimeSplit(req({ order: 'aerobic_first', strength: 'tabata', timeMin: 30 }))).toEqual({ aerobicMin: 26, strengthMin: 4 });
    expect(comboTimeSplit(req({ order: 'aerobic_first', strength: 'core', timeMin: 30 }))).toEqual({ aerobicMin: 22, strengthMin: 8 });
    expect(comboTimeSplit(req({ order: 'aerobic_first', strength: 'sets', timeMin: 40 }))).toEqual({ aerobicMin: 22, strengthMin: 18 });
    expect(comboTimeSplit(req({ timeMin: 20 }))).toEqual({ aerobicMin: 0, strengthMin: 20 });
    expect(comboTimeSplit(req({ strength: 'none', timeMin: 30 }))).toEqual({ aerobicMin: 30, strengthMin: 0 });
  });
});

describe('combo blocks', () => {
  const members = [{ exerciseId: 'pushup', targetReps: 10 }, { exerciseId: 'squat', targetReps: 15 }];
  it('AMRAP round = the run, then every member once; cap clamped 8-24 min', () => {
    const c = amrapComboConfig({ legMeters: comboLegMeters('run'), members, minutes: 30 })!;
    expect(c.capSec).toBe(24 * 60);
    expect(c.roundItems).toEqual([
      { kind: 'aerobic_leg', distanceM: 400 },
      { kind: 'exercise', exerciseId: 'pushup', targetReps: 10 },
      { kind: 'exercise', exerciseId: 'squat', targetReps: 15 },
    ]);
    expect(amrapComboConfig({ legMeters: 400, members: [], minutes: 20 })).toBe(null);
  });
  it('EMOM alternates a run interval and a member interval; 2-minute intervals for 400 m', () => {
    const c = emomComboConfig({ legMeters: 400, members, minutes: 16 })!;
    expect(c.intervalSec).toBe(120);
    expect(c.totalIntervals).toBe(8);
    expect(c.targets!.map((t) => t.kind)).toEqual(['aerobic_leg', 'exercise', 'aerobic_leg', 'exercise']);
    expect(emomComboConfig({ legMeters: comboLegMeters('walk'), members, minutes: 10 })!.intervalSec).toBe(60);
  });
});
