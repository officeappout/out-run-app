import { describe, it, expect, vi } from 'vitest';

const flag = vi.hoisted(() => ({ mapOverview: true, assessmentPrompt: true }));
vi.mock('@/config/feature-flags', () => ({
  get MAP_OVERVIEW_CHROME_V1() { return flag.mapOverview; },
  get STRENGTH_ASSESSMENT_PROMPT_CARD_V1() { return flag.assessmentPrompt; },
}));

import { resolveSlots, presetToIntent, HYBRID_PRESETS, type SlotEnv, type HybridSlot } from '../../hybrid-slots';
import { resolveSmartSlots } from '../resolve-smart-slots';
import { rankHybridCards } from '../rank-hybrid-cards';
import { sessionTypesForRoute } from '../route-session-types';
import type { HybridSituation } from '../situation.types';

const env = (over: Partial<SlotEnv> = {}): SlotEnv => ({
  hasGps: true, nearbyParkCount: 1, aerobicKind: 'walking',
  hasEquippedPark: true, hasStrengthProgram: true,
  enableHybridSlots: true, enableFullParkWorkout: true, enableRouteStops: true, enableRecommendedHybrid: true,
  ...over,
});
const sit = (over: Partial<HybridSituation> = {}): HybridSituation => ({
  hasGps: true, aerobicKind: 'walking', gender: 'female',
  nearestEquippedPark: { id: 'p1', name: 'ספורטק', distanceM: 350 },
  routesWithStops: [{ routeId: 'r9', name: 'טיילת', distanceFromUserM: 100, focused: false, stopCount: 2, strengthStopCount: 1, sessionTypes: sessionTypesForRoute({ stopCount: 2, strengthStopCount: 1 }) }],
  steps: { stepsRemaining: 4000, stepGoal: 8000 },
  strength: { weeklyBudget: 40, totalSetsCompleted: 34 },
  todayScheduled: 'none', hasStrengthProgram: true, hour: 10, weatherFlag: null,
  flags: { walkStrength: true, fullPark: true, routeStops: true },
  ...over,
});
const ids = (slots: HybridSlot[]) => slots.map((s) => s.id);

describe('resolveSmartSlots', () => {
  it('retires the old one-station recommended card; walk_strength takes its place', () => {
    const slots = resolveSmartSlots(env(), rankHybridCards(sit()));
    expect(ids(slots)).not.toContain('recommended');
    expect(ids(slots)).toContain('walk_strength');
    expect(ids(slots)[slots.length - 1]).toBe('aerobic_quick');
  });

  it('walk_strength carries the situation sizing into the intent (smart mode, park, km, sets)', () => {
    const slot = resolveSmartSlots(env(), rankHybridCards(sit())).find((s) => s.id === 'walk_strength')!;
    expect(slot.kind).toBe('hybrid');
    if (slot.kind !== 'hybrid') return;
    const intent = presetToIntent(slot.preset, slot.timeBudgetMin);
    expect(intent.mode).toBe('smart_walk_strength');
    expect(intent.smart).toMatchObject({ targetKm: 3, parkId: 'p1', strengthSets: 6, strengthMin: 9 });
    expect(intent.timeBudgetMin).toBe(45);
    expect(intent.aerobicShare).toBe(slot.preset.aerobicShare);
    expect(slot.subtitle).toBe('3 ק״מ דרך ספורטק');
    expect(slot.reason).toBe('נשארו לך 4,000 צעדים ו־6 סטים של כוח');
    expect(slot.cacheKeySuffix).toBe('|p:p1|km:3|s:6');
  });

  it('no equipped park nearby → no walk_strength and no full park card', () => {
    const slots = resolveSmartSlots(env(), rankHybridCards(sit({ nearestEquippedPark: null })));
    expect(ids(slots)).toEqual(['route_stops', 'aerobic_quick']);
  });

  it('route_stops carries the route id + reason, and the top card gets the badge', () => {
    const slots = resolveSmartSlots(env(), rankHybridCards(sit({
      routesWithStops: [{ routeId: 'r9', name: 'טיילת', distanceFromUserM: 900, focused: true, stopCount: 2, strengthStopCount: 1, sessionTypes: sessionTypesForRoute({ stopCount: 2, strengthStopCount: 1 }) }],
    })));
    const rs = slots[0];
    expect(rs.id).toBe('route_stops');
    expect(rs.recommended).toBe(true);
    if (rs.kind !== 'hybrid') throw new Error('expected hybrid');
    expect(presetToIntent(rs.preset, rs.timeBudgetMin).smart).toEqual({ routeId: 'r9' });
    expect(rs.subtitle).toBe('טיילת · 2 עצירות');
    expect(slots.filter((s) => s.recommended)).toHaveLength(1);
  });

  it('a hidden ranked card never shows even if resolveSlots would offer it', () => {
    const slots = resolveSmartSlots(env(), rankHybridCards(sit({ routesWithStops: [] })));
    expect(ids(slots)).not.toContain('route_stops');
  });

  it('master switch off → []', () => {
    expect(resolveSmartSlots(env({ enableHybridSlots: false }), rankHybridCards(sit()))).toEqual([]);
  });

  it('still loading (no ranking yet) → only the free walk', () => {
    expect(ids(resolveSmartSlots(env(), []))).toEqual(['aerobic_quick']);
  });

  it('no strength assessment → the assessment prompt stays in the full park position', () => {
    const slots = resolveSmartSlots(env({ hasStrengthProgram: false }), rankHybridCards(sit({ hasStrengthProgram: false })));
    expect(ids(slots)).toContain('assessment_prompt');
    expect(ids(slots)).not.toContain('full_park');
  });
});

describe('flag-off parity (enable_hybrid_cards_v2 off never reaches smart-cards)', () => {
  it('registry presets → presetToIntent output is unchanged (no smart / no new keys)', () => {
    for (const p of Object.values(HYBRID_PRESETS)) {
      const intent = presetToIntent(p, 30);
      expect(intent).not.toHaveProperty('smart');
      expect(Object.keys(intent).sort()).toEqual(
        ['aerobicKind', 'aerobicShare', 'difficulty', 'emphasis', 'timeBudgetMin', ...(p.mode ? ['mode'] : [])].sort());
    }
    expect(presetToIntent(HYBRID_PRESETS.walk_balanced, 30)).toEqual({
      timeBudgetMin: 30, aerobicShare: 0.55, emphasis: 'balanced', aerobicKind: 'walking', difficulty: 2,
    });
  });

  it('resolveSlots still returns the old recommended card with no reason / key suffix', () => {
    const slots = resolveSlots(env());
    expect(ids(slots)[0]).toBe('recommended');
    for (const s of slots) {
      expect(s).not.toHaveProperty('reason');
      expect(s).not.toHaveProperty('cacheKeySuffix');
    }
  });
});
