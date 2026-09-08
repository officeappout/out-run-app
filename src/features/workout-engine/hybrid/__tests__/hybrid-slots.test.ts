import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Togglable flag mock — live getters so each resolveSlots() call reads the CURRENT
// values. Only the flags that STAY compile-time imports (MAP_OVERVIEW_CHROME_V1,
// STRENGTH_ASSESSMENT_PROMPT_CARD_V1) are mocked here. enableHybridSlots/
// enableFullParkWorkout/enableRouteStops are now SlotEnv fields (wave 1, 08.09.2026,
// replacing HYBRID_SLOTS_ENABLED/HYBRID_FULL_PARK_WORKOUT_ENABLED/MAP_ROUTE_STOPS_V1) —
// passed directly via env() below, never mocked.
const flag = vi.hoisted(() => ({ mapOverview: false, assessmentPrompt: false }));
vi.mock('@/config/feature-flags', () => ({
  get MAP_OVERVIEW_CHROME_V1() {
    return flag.mapOverview;
  },
  get STRENGTH_ASSESSMENT_PROMPT_CARD_V1() {
    return flag.assessmentPrompt;
  },
}));

import { resolveSlots, presetToIntent, HYBRID_PRESETS, type SlotEnv } from '../hybrid-slots';

// Defaults ON for all 3 hybrid-slot flags — matches today's production state (all `true`)
// so every pre-existing test in this file keeps its original meaning unchanged; tests that
// specifically exercise an OFF state override explicitly.
const env = (over: Partial<SlotEnv> = {}): SlotEnv => ({
  hasGps: true,
  nearbyParkCount: 1,
  aerobicKind: 'walking',
  enableHybridSlots: true,
  enableFullParkWorkout: true,
  enableRouteStops: true,
  ...over,
});
const ids = (slots: ReturnType<typeof resolveSlots>) => slots.map((s) => s.id);

describe('resolveSlots — master switch (enableHybridSlots)', () => {
  it('returns [] when off, regardless of every other flag/gate', () => {
    const slots = resolveSlots(env({
      enableHybridSlots: false,
      enableFullParkWorkout: true,
      enableRouteStops: true,
      hasEquippedPark: true,
      hasStrengthProgram: true,
    }));
    expect(slots).toEqual([]);
  });

  it('returns the normal slot set when on (baseline)', () => {
    const slots = resolveSlots(env());
    expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
  });

  // Full combination coverage of the 3 flags (2^3 = 8), per the wave-1 verification plan.
  const combos = [
    [true, true, true], [true, true, false], [true, false, true], [true, false, false],
    [false, true, true], [false, true, false], [false, false, true], [false, false, false],
  ] as const;

  it.each(combos)(
    'enableHybridSlots=%s enableFullParkWorkout=%s enableRouteStops=%s → hierarchy holds',
    (enableHybridSlots, enableFullParkWorkout, enableRouteStops) => {
      const slots = resolveSlots(env({
        enableHybridSlots, enableFullParkWorkout, enableRouteStops,
        hasEquippedPark: true, hasStrengthProgram: true,
      }));
      if (!enableHybridSlots) {
        expect(slots).toEqual([]);
        return;
      }
      expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
      expect(ids(slots).includes('full_park')).toBe(enableFullParkWorkout);
      expect(ids(slots).includes('route_stops')).toBe(enableRouteStops);
    },
  );
});

describe('resolveSlots — full-park gate', () => {
  it('adds the full_park card when flag ON + equipped park + strength program', () => {
    const slots = resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: true }));
    expect(ids(slots)).toContain('full_park');
    const fp = slots.find((s) => s.id === 'full_park')!;
    expect(fp.kind).toBe('hybrid');
    expect(fp.title).toBe('אימון מלא בפארק');
    if (fp.kind === 'hybrid') {
      // preset carries the compose-branch marker + follows the active activity.
      expect(fp.preset.mode).toBe('full_park_workout');
      expect(fp.preset.aerobicKind).toBe('walking');
    }
  });

  it('follows the active activity (running)', () => {
    const slots = resolveSlots(env({ aerobicKind: 'running', hasEquippedPark: true, hasStrengthProgram: true }));
    const fp = slots.find((s) => s.id === 'full_park');
    expect(fp?.kind === 'hybrid' && fp.preset.aerobicKind).toBe('running');
  });

  it('is absent without an equipped park', () => {
    expect(ids(resolveSlots(env({ hasEquippedPark: false, hasStrengthProgram: true })))).not.toContain('full_park');
  });

  it('is absent without a strength program', () => {
    expect(ids(resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: false })))).not.toContain('full_park');
  });

  it('is absent when the gate signals are not provided (existing callers unchanged)', () => {
    expect(ids(resolveSlots(env()))).not.toContain('full_park');
  });

  it('is absent when enableFullParkWorkout is OFF, even with the gate open', () => {
    expect(ids(resolveSlots(env({ enableFullParkWorkout: false, hasEquippedPark: true, hasStrengthProgram: true })))).not.toContain('full_park');
  });

  it('never disturbs the existing recommended + aerobic_quick slots', () => {
    const slots = resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: true }));
    expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
  });
});

describe('resolveSlots — route_stops (enableRouteStops)', () => {
  it('is absent when the flag is OFF (slot layer byte-identical)', () => {
    expect(ids(resolveSlots(env({ enableRouteStops: false })))).not.toContain('route_stops');
  });

  it('adds the route_stops card when flag ON + GPS', () => {
    const slots = resolveSlots(env({ enableRouteStops: true, hasGps: true }));
    expect(ids(slots)).toContain('route_stops');
    const rs = slots.find((s) => s.id === 'route_stops')!;
    expect(rs.kind).toBe('hybrid');
    expect(rs.title).toBe('מסלול + עצירות');
    if (rs.kind === 'hybrid') {
      expect(rs.preset.mode).toBe('route_stops');
      expect(rs.preset.aerobicKind).toBe('walking'); // follows env
    }
  });

  it('is absent without GPS even when the flag is ON', () => {
    expect(ids(resolveSlots(env({ enableRouteStops: true, hasGps: false })))).not.toContain('route_stops');
  });

  it('never disturbs the existing recommended + aerobic_quick slots', () => {
    const slots = resolveSlots(env({ enableRouteStops: true, hasGps: true }));
    expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
  });
});

describe('resolveSlots — assessment-prompt substitution (STRENGTH_ASSESSMENT_PROMPT_CARD_V1)', () => {
  beforeEach(() => {
    // MAP_OVERVIEW_CHROME_V1 = true is the exact scenario that defeats the
    // hasStrengthProgram check — the substitution is only reachable there.
    flag.mapOverview = true;
  });
  afterEach(() => {
    flag.mapOverview = false;
    flag.assessmentPrompt = false;
  });

  it('flag OFF: full_park still shows for a user with no strength program (pre-existing, byte-identical)', () => {
    const slots = resolveSlots(env({ hasStrengthProgram: false }));
    expect(ids(slots)).toContain('full_park');
    expect(ids(slots)).not.toContain('assessment_prompt');
  });

  it('flag ON + no strength program: assessment_prompt REPLACES full_park (not alongside)', () => {
    flag.assessmentPrompt = true;
    const slots = resolveSlots(env({ hasStrengthProgram: false }));
    expect(ids(slots)).toContain('assessment_prompt');
    expect(ids(slots)).not.toContain('full_park');
    const ap = slots.find((s) => s.id === 'assessment_prompt')!;
    expect(ap.kind).toBe('assessment_prompt');
  });

  it('flag ON + HAS a strength program: full_park is unaffected', () => {
    flag.assessmentPrompt = true;
    const slots = resolveSlots(env({ hasStrengthProgram: true }));
    expect(ids(slots)).toContain('full_park');
    expect(ids(slots)).not.toContain('assessment_prompt');
  });

  it('flag ON: never disturbs the existing recommended + aerobic_quick slots', () => {
    flag.assessmentPrompt = true;
    const slots = resolveSlots(env({ hasStrengthProgram: false }));
    expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
  });
});

describe('presetToIntent — mode threading', () => {
  it('threads mode: full_park_workout for the full_park preset', () => {
    const intent = presetToIntent(HYBRID_PRESETS.full_park, 30);
    expect(intent.mode).toBe('full_park_workout');
    expect(intent.aerobicKind).toBe(HYBRID_PRESETS.full_park.aerobicKind);
    expect(intent.difficulty).toBe(2); // bolts 2
    expect(intent.timeBudgetMin).toBe(30);
  });

  it('threads mode: route_stops for the route_stops preset', () => {
    const intent = presetToIntent(HYBRID_PRESETS.route_stops, 35);
    expect(intent.mode).toBe('route_stops');
    expect(intent.emphasis).toBe('balanced');
    expect(intent.timeBudgetMin).toBe(35);
  });

  it('omits mode for budget-split presets — intents stay byte-identical', () => {
    const intent = presetToIntent(HYBRID_PRESETS.walk_balanced, 30);
    expect(intent.mode).toBeUndefined();
    expect('mode' in intent).toBe(false);
  });
});
