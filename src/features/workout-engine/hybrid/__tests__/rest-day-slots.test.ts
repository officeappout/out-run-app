import { describe, expect, it } from 'vitest';
import { resolveSlots, type HybridSlot, type SlotEnv } from '../hybrid-slots';
import { isMapRestDay, REST_DAY_WALK_REASON, restDaySlots } from '../rest-day-slots';

const env: SlotEnv = {
  hasGps: true, nearbyParkCount: 2, aerobicKind: 'walking', hasEquippedPark: true, hasStrengthProgram: true,
  enableHybridSlots: true, enableFullParkWorkout: true, enableRouteStops: true, enableRecommendedHybrid: true,
} as SlotEnv;
const ids = (s: HybridSlot[]) => s.map((x) => x.id);

describe('isMapRestDay', () => {
  const base = { hasStrengthProgram: true, hasRunningPlan: false, strengthToday: false, runToday: false, walkToday: false };
  it('a plan and nothing planned today → rest day', () => {
    expect(isMapRestDay(base)).toBe(true);
  });
  it('anything planned today, or no plan at all → not a rest day', () => {
    expect(isMapRestDay({ ...base, strengthToday: true })).toBe(false);
    expect(isMapRestDay({ ...base, runToday: true })).toBe(false);
    expect(isMapRestDay({ ...base, walkToday: true })).toBe(false);
    expect(isMapRestDay({ ...base, hasStrengthProgram: false })).toBe(false);
  });
});

describe('restDaySlots (audit ש4)', () => {
  const slots = resolveSlots(env);
  it('not a rest day → unchanged', () => {
    expect(restDaySlots(slots, false, 4000)).toEqual(slots);
  });
  it('rest day → the strength cards drop; walk + strength stays light while steps are missing', () => {
    const out = restDaySlots(slots, true, 4000);
    expect(ids(out)).not.toContain('full_park');
    expect(ids(out)).not.toContain('route_stops');
    expect(ids(out)).not.toContain('assessment_prompt');
    const ws = out.find((s) => s.id === 'recommended');
    expect(ws?.bolts).toBe(1);
    expect(ws?.kind === 'hybrid' && ws.preset.bolts).toBe(1);
    expect(ws?.reason).toBe(REST_DAY_WALK_REASON);
    expect(ids(out)).toContain('aerobic_quick');
  });
  it('rest day with the steps done → no walk + strength either, the free walk stays', () => {
    expect(ids(restDaySlots(slots, true, 0))).toEqual(['aerobic_quick']);
  });
  it('unknown steps → kept (light)', () => {
    expect(ids(restDaySlots(slots, true, null))).toEqual(['recommended', 'aerobic_quick']);
  });
  it('the plan cards (planned walk / run) are never touched', () => {
    const planned = { kind: 'planned_run', id: 'planned_run', title: 'r', subtitle: '', bolts: 1, recommended: false, accent: '#000', href: '/x' } as HybridSlot;
    expect(ids(restDaySlots([planned, ...slots], true, 0))).toEqual(['planned_run', 'aerobic_quick']);
  });
});
