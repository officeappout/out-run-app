import { describe, expect, it } from 'vitest';
import { RULES, RULE_IDS, runInvariants, type RuleId } from '../invariants';
import { activityMismatch } from '../invariants/activity-mismatch';
import { duplicateExercises } from '../invariants/duplicate-exercises';
import { durationMismatch } from '../invariants/duration-mismatch';
import { equipmentMismatch } from '../invariants/equipment-mismatch';
import { hybridNoStrengthStop } from '../invariants/hybrid-no-strength-stop';
import { levelGap } from '../invariants/level-gap';
import { missingMedia } from '../invariants/missing-media';
import { routeMissesStationPark } from '../invariants/route-misses-station-park';
import { routeQuality } from '../invariants/route-quality';
import { strengthSinglePattern } from '../invariants/strength-single-pattern';
import { zeroMinuteLeg } from '../invariants/zero-minute-leg';
import { patternGroup } from '../invariants/helpers';
import {
  cleanWalkStrength,
  cyclingBecomesRun,
  ex,
  routeStopsNoStrength,
  spurLoop,
  walkStrengthMissesPark,
  walkStrengthPushOnly,
  type Fixture,
} from './fixtures';

const ids = (f: Fixture): RuleId[] => Array.from(new Set(runInvariants(f).map((x) => x.ruleId)));
const home = (exercises: Fixture['output']['exercises'], input: Fixture['input'] = {}): Fixture => ({
  name: 'home',
  type: 'home_strength',
  input: { location: 'home', ...input },
  output: { totalMinutes: 30, exercises, legs: [], stations: [], route: null },
});

describe('registry', () => {
  it('has every rule id exactly once, with Hebrew text', () => {
    expect(RULES.map((r) => r.id).sort()).toEqual([...RULE_IDS].sort());
    for (const r of RULES) {
      expect(r.titleHe).toMatch(/[א-ת]/);
      expect(r.descriptionHe).toMatch(/[א-ת]/);
    }
  });
  it('a clean session has no findings', () => {
    expect(runInvariants(cleanWalkStrength)).toEqual([]);
  });
  it('a throwing rule does not break the run', () => {
    const broken = { ...cleanWalkStrength, output: { ...cleanWalkStrength.output, legs: null as never } };
    expect(() => runInvariants(broken)).not.toThrow();
  });
});

describe('owner fixtures', () => {
  it('walk+strength loop that misses its park → ROUTE_MISSES_STATION_PARK', () => {
    expect(ids(walkStrengthMissesPark)).toContain('ROUTE_MISSES_STATION_PARK');
  });
  it('route+stops with no strength stop → HYBRID_NO_STRENGTH_STOP', () => {
    expect(ids(routeStopsNoStrength)).toContain('HYBRID_NO_STRENGTH_STOP');
  });
  it('push-only walk+strength block → STRENGTH_SINGLE_PATTERN', () => {
    expect(ids(walkStrengthPushOnly)).toContain('STRENGTH_SINGLE_PATTERN');
  });
  it('cycling → "ריצה + כוח" with 0-minute legs → ACTIVITY_MISMATCH + ZERO_MINUTE_LEG + DURATION_MISMATCH', () => {
    const got = ids(cyclingBecomesRun);
    expect(got).toEqual(expect.arrayContaining(['ACTIVITY_MISMATCH', 'ZERO_MINUTE_LEG', 'DURATION_MISMATCH']));
  });
  it('loop with a spur + unmarked crossings → ROUTE_QUALITY (spur, unmarked_crossings)', () => {
    const subs = runInvariants(spurLoop).filter((f) => f.ruleId === 'ROUTE_QUALITY').map((f) => f.data?.sub);
    expect(subs).toEqual(expect.arrayContaining(['spur', 'unmarked_crossings']));
  });
});

describe('ROUTE_MISSES_STATION_PARK', () => {
  it('passes a park on the line', () => {
    expect(routeMissesStationPark.check(walkStrengthPushOnly)).toEqual([]);
  });
  it('reports the distance', () => {
    const [f] = routeMissesStationPark.check(walkStrengthMissesPark);
    expect(f.data?.distanceM).toBeGreaterThan(250);
    expect(f.severity).toBe(3);
  });
  it('falls back to the stored line when no distance was measured', () => {
    const st = walkStrengthPushOnly.output.stations.map((s) => ({ ...s, distanceToRouteM: null, lat: s.lat + 0.0006 }));
    const f = routeMissesStationPark.check({ ...walkStrengthPushOnly, output: { ...walkStrengthPushOnly.output, stations: st } });
    expect(f).toHaveLength(1);
    expect(f[0].data?.distanceM).toBeGreaterThan(50);
  });
});

describe('HYBRID_NO_STRENGTH_STOP', () => {
  it('ignores non-hybrid types', () => {
    expect(hybridNoStrengthStop.check({ ...routeStopsNoStrength, type: 'route_loop' })).toEqual([]);
  });
  it('flags strength legs with no exercises', () => {
    const s = { ...routeStopsNoStrength, output: { ...routeStopsNoStrength.output, legs: [{ activity: 'strength' as const, distanceM: null, minutes: 10, exercises: [] }] } };
    expect(hybridNoStrengthStop.check(s)[0].messageHe).toContain('אין בהן תרגילים');
  });
  it('a full park with top-level exercises is fine', () => {
    expect(hybridNoStrengthStop.check({ ...routeStopsNoStrength, type: 'hybrid_full_park', output: { ...routeStopsNoStrength.output, exercises: [ex('a', 'squat')] } })).toEqual([]);
  });
});

describe('STRENGTH_SINGLE_PATTERN', () => {
  it('exempts a requested focus', () => {
    expect(strengthSinglePattern.check({ ...walkStrengthPushOnly, input: { focus: 'push' } })).toEqual([]);
  });
  it('needs at least 3 non-core exercises', () => {
    expect(strengthSinglePattern.check(home([ex('a', 'horizontal_push'), ex('b', 'vertical_push'), ex('c', 'core')]))).toEqual([]);
  });
  it('balanced is fine', () => {
    expect(strengthSinglePattern.check(home([ex('a', 'push'), ex('b', 'pull'), ex('c', 'legs')]))).toEqual([]);
  });
  it('normalizes pattern spellings', () => {
    expect(patternGroup('vertical_pull')).toBe('pull');
    expect(patternGroup('hinge')).toBe('legs');
    expect(patternGroup('core_flexion')).toBe('core');
    expect(patternGroup('flexibility')).toBe('other');
    expect(patternGroup(null)).toBeNull();
  });
});

describe('ACTIVITY_MISMATCH', () => {
  it('no request → nothing', () => {
    expect(activityMismatch.check({ ...cyclingBecomesRun, input: {} })).toEqual([]);
  });
  it('reads the label when planActivity is missing', () => {
    const s = { ...cyclingBecomesRun, output: { ...cyclingBecomesRun.output, planActivity: null, legs: [] } };
    expect(activityMismatch.check(s)).toHaveLength(1);
  });
  it('matching activity is fine', () => {
    expect(activityMismatch.check(cleanWalkStrength)).toEqual([]);
  });
});

describe('ZERO_MINUTE_LEG', () => {
  it('flags each empty leg', () => {
    expect(zeroMinuteLeg.check(cyclingBecomesRun)).toHaveLength(2);
  });
  it('unknown minutes are not zero', () => {
    const s = { ...cleanWalkStrength, output: { ...cleanWalkStrength.output, legs: [{ activity: 'walk' as const, distanceM: null, minutes: null }] } };
    expect(zeroMinuteLeg.check(s)).toEqual([]);
  });
});

describe('DURATION_MISMATCH', () => {
  it('within ±25% is fine', () => {
    expect(durationMismatch.check(home([], { targetMinutes: 40 }))).toEqual([]); // 30 vs 40 = -25%
  });
  it('flags beyond 25%, severity 3 beyond 60%', () => {
    const f = durationMismatch.check({ ...home([], { targetMinutes: 100 }) });
    expect(f[0].severity).toBe(3);
  });
});

describe('LEVEL_GAP', () => {
  it('flags far above and far below, skips unknown levels', () => {
    const s = home([ex('hard', 'pull', { level: 12 }), ex('easy', 'push', { level: 1 }), ex('ok', 'legs', { level: 6 }), ex('nolevel', 'legs')], { levels: { push: 7, pull: 5, legs: 5 } });
    const got = levelGap.check(s).map((f) => [f.data?.exerciseId, f.severity]);
    expect(got).toEqual([['hard', 3], ['easy', 2]]);
  });
  it('no user levels → nothing', () => {
    expect(levelGap.check(home([ex('hard', 'pull', { level: 20 })]))).toEqual([]);
  });
});

describe('EQUIPMENT_MISMATCH', () => {
  it('flags a station exercise the park cannot host', () => {
    const s: Fixture = {
      ...cleanWalkStrength,
      output: {
        ...cleanWalkStrength.output,
        legs: [{ activity: 'strength', distanceM: null, minutes: 10, parkId: 'park_on', exercises: [ex('rings_row', 'pull', { equipment: ['rings'] })] }],
      },
    };
    expect(equipmentMismatch.check(s)[0].data?.missing).toBe('rings');
  });
  it('flags home exercises that need gear the user lacks; bodyweight is fine', () => {
    const s = home([ex('pullup', 'pull', { equipment: ['pullUpBar'] }), ex('pushup', 'push', { equipment: ['none'] })], { equipment: [] });
    expect(equipmentMismatch.check(s)).toHaveLength(1);
  });
  it('unknown home equipment → nothing', () => {
    expect(equipmentMismatch.check(home([ex('pullup', 'pull', { equipment: ['pullUpBar'] })], { equipment: null }))).toEqual([]);
  });
});

describe('ROUTE_QUALITY', () => {
  it('clean loop → nothing', () => {
    expect(routeQuality.check(cleanWalkStrength)).toEqual([]);
  });
  it('distance error beyond 25%', () => {
    const r = cleanWalkStrength.output.route!;
    const s = { ...cleanWalkStrength, output: { ...cleanWalkStrength.output, route: { ...r, metrics: { ...r.metrics, distanceErrorPct: -0.4 } } } };
    expect(routeQuality.check(s).map((f) => f.data?.sub)).toEqual(['distance']);
  });
});

describe('DUPLICATE_EXERCISES', () => {
  it('same id twice in one block', () => {
    expect(duplicateExercises.check(home([ex('a', 'push'), ex('a', 'push'), ex('b', 'pull')]))).toHaveLength(1);
  });
  it('same id in two different stations is fine', () => {
    expect(duplicateExercises.check(cyclingBecomesRun)).toEqual([]);
  });
});

describe('MISSING_MEDIA', () => {
  it('one finding listing the exercises; unknown media is not missing', () => {
    const f = missingMedia.check(home([ex('a', 'push', { hasMedia: false }), ex('b', 'pull', { hasMedia: false }), ex('c', 'legs')]));
    expect(f).toHaveLength(1);
    expect(f[0].data?.count).toBe(2);
  });
});
