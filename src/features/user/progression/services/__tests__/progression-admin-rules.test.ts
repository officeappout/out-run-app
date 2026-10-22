import { describe, it, expect } from 'vitest';
import {
  computeAdminSessionGain,
  defaultRuleForLevel,
  isFirstSessionAtLevel,
  monthKeyOf,
  nextAdminTrackCounters,
  persistenceBonusFor,
  pickConfiguredLevel,
  resolveAdminRule,
  rpeBonusFor,
  type AdminLevelSettingsData,
  type AdminRuleDocData,
} from '../progression-admin-rules';

const inputs = (
  rules: Record<number, AdminRuleDocData> = {},
  settings: Record<number, AdminLevelSettingsData> = {},
) => ({
  rules: new Map(Object.entries(rules).map(([k, v]) => [Number(k), v])),
  settings: new Map(Object.entries(settings).map(([k, v]) => [Number(k), v])),
});

describe('resolveAdminRule — which rule a level gets', () => {
  it('progression_rules doc at the level wins', () => {
    const r = resolveAdminRule(3, inputs({ 3: { baseSessionGain: 6, bonusPercent: 4, requiredSetsForFullGain: 10 } }));
    expect(r).toMatchObject({ baseSessionGain: 6, bonusPercent: 4, requiredSetsForFullGain: 10, source: 'progression_rules' });
    expect(r.carriedFromLevel).toBeUndefined();
  });

  it('accepts legacy field names (baseGain / requiredSets)', () => {
    const r = resolveAdminRule(2, inputs({ 2: { baseGain: 9, bonusPercent: 3, requiredSets: 7 } }));
    expect(r).toMatchObject({ baseSessionGain: 9, requiredSetsForFullGain: 7 });
  });

  it('no rule doc → programLevelSettings with a base gain', () => {
    const r = resolveAdminRule(4, inputs({}, { 4: { baseGain: 6, maxSets: 24 } }));
    expect(r).toMatchObject({ baseSessionGain: 6, source: 'programLevelSettings', maxSets: 24 });
    // bonus% / required sets not in the settings doc → level defaults
    expect(r.bonusPercent).toBe(defaultRuleForLevel(4).bonusPercent);
    expect(r.requiredSetsForFullGain).toBe(4);
  });

  it('a settings doc WITHOUT a base gain does not replace the defaults (but its bonuses apply)', () => {
    const r = resolveAdminRule(5, inputs({}, { 5: { firstSessionBonus: 3 } }));
    expect(r.source).toBe('default');
    expect(r.baseSessionGain).toBe(defaultRuleForLevel(5).baseSessionGain);
    expect(r.firstSessionBonus).toBe(3);
  });

  it('nothing configured → today\'s defaults', () => {
    expect(resolveAdminRule(7, inputs())).toEqual(defaultRuleForLevel(7));
    expect(defaultRuleForLevel(7)).toMatchObject({ baseSessionGain: 6, bonusPercent: 12, requiredSetsForFullGain: 6 });
  });

  it('level above the last configured level carries the last one (rule + bonuses)', () => {
    const r = resolveAdminRule(
      14,
      inputs({ 1: { baseSessionGain: 8 }, 10: { baseSessionGain: 3, bonusPercent: 2, requiredSetsForFullGain: 9 } },
        { 10: { firstSessionBonus: 1.5, maxSets: 30 } }),
    );
    expect(r).toMatchObject({ baseSessionGain: 3, requiredSetsForFullGain: 9, carriedFromLevel: 10, firstSessionBonus: 1.5, maxSets: 30 });
  });

  it('a gap BELOW the last configured level is not filled (defaults)', () => {
    const r = resolveAdminRule(5, inputs({ 1: { baseSessionGain: 8 }, 10: { baseSessionGain: 3 } }));
    expect(r.source).toBe('default');
  });

  it('pickConfiguredLevel', () => {
    expect(pickConfiguredLevel(3, [1, 3, 5])).toBe(3);
    expect(pickConfiguredLevel(9, [1, 3, 5])).toBe(5);
    expect(pickConfiguredLevel(4, [1, 3, 5])).toBeNull();
    expect(pickConfiguredLevel(4, [])).toBeNull();
  });
});

describe('bonus lookups', () => {
  const P = { '2': 1, '5': 2, '7': 3 };
  it('persistence: exact session number, none between, highest past the last key', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => persistenceBonusFor(P, n))).toEqual([0, 1, 0, 0, 2, 0, 3, 3, 3]);
    expect(persistenceBonusFor(undefined, 5)).toBe(0);
  });
  it('RPE: by rounded RPE, nothing when not logged', () => {
    const R = { '5': 2, '7': 1, '9': 0 };
    expect(rpeBonusFor(R, 5)).toBe(2);
    expect(rpeBonusFor(R, 6.6)).toBe(1);
    expect(rpeBonusFor(R, 9)).toBe(0);
    expect(rpeBonusFor(R, undefined)).toBe(0);
    expect(rpeBonusFor(undefined, 5)).toBe(0);
  });
  it('first session at the level', () => {
    expect(isFirstSessionAtLevel({ levelSessions: 0 })).toBe(true);
    expect(isFirstSessionAtLevel({ levelSessions: 2 })).toBe(false);
    expect(isFirstSessionAtLevel({})).toBe(true); // brand-new track
    expect(isFirstSessionAtLevel({ totalWorkoutsCompleted: 6 })).toBe(false); // track predates the counter
  });
  it('counters: level resets on level-up, month counts within the calendar month', () => {
    const d = new Date(2026, 9, 22);
    const key = monthKeyOf(d);
    expect(key).toBe('2026-10');
    expect(nextAdminTrackCounters({ levelSessions: 2, monthKey: key, monthSessions: 4 }, d, false))
      .toEqual({ levelSessions: 3, monthKey: key, monthSessions: 5 });
    expect(nextAdminTrackCounters({ levelSessions: 2, monthKey: '2026-09', monthSessions: 9 }, d, true))
      .toEqual({ levelSessions: 0, monthKey: key, monthSessions: 1 });
  });
});

describe('computeAdminSessionGain', () => {
  // Today's inline formula (progression.service.ts leaf + master child flows).
  const today = (rule: { baseSessionGain: number; bonusPercent: number; requiredSetsForFullGain: number }, sets: number, perf: number) => {
    const volumeRatio = Math.min(1, sets / rule.requiredSetsForFullGain);
    const base = volumeRatio * rule.baseSessionGain;
    const bonus = perf > 1 ? Math.min((perf - 1) * 100 * (rule.bonusPercent / 100), rule.bonusPercent) * volumeRatio : 0;
    return base + bonus;
  };
  const d = new Date(2026, 9, 22);

  it('no admin extras configured → exactly today\'s base + over-target bonus', () => {
    for (const level of [1, 3, 7, 12, 20]) {
      const rule = defaultRuleForLevel(level);
      for (const sets of [0, 1, 3, 6, 12, 40]) {
        for (const perf of [0.5, 1, 1.2, 3]) {
          const g = computeAdminSessionGain({ rule, setsPerformed: sets, performanceRatio: perf, track: { levelSessions: 3 }, completedAt: d });
          expect(g.totalGain).toBeCloseTo(today(rule, sets, perf), 10);
          expect(g.extrasGain).toBe(0);
        }
      }
    }
  });

  it('maxSets caps the counted sets', () => {
    const rule = { baseSessionGain: 10, bonusPercent: 0, requiredSetsForFullGain: 20, maxSets: 12 };
    const g = computeAdminSessionGain({ rule, setsPerformed: 18, performanceRatio: 1, track: { levelSessions: 1 }, completedAt: d });
    expect(g.countedSets).toBe(12);
    expect(g.baseGain).toBeCloseTo(6);
  });

  it('first session + persistence + RPE add flat % — only when a set counted', () => {
    const rule = {
      baseSessionGain: 6, bonusPercent: 5, requiredSetsForFullGain: 6,
      firstSessionBonus: 3, persistenceBonusConfig: { '2': 1 }, rpeBonusConfig: { '6': 1 },
    };
    const track = { levelSessions: 0, monthKey: '2026-10', monthSessions: 1 };
    const g = computeAdminSessionGain({ rule, setsPerformed: 6, performanceRatio: 1, track, completedAt: d, sessionRpe: 6 });
    expect(g).toMatchObject({ baseGain: 6, firstSessionBonus: 3, persistenceBonus: 1, rpeBonus: 1, extrasGain: 5, totalGain: 11 });
    const none = computeAdminSessionGain({ rule, setsPerformed: 0, performanceRatio: 1, track, completedAt: d, sessionRpe: 6 });
    expect(none.totalGain).toBe(0);
  });

  it('preview example: 12 sets at level 3 with a 10%/10-set rule → +10%', () => {
    const rule = resolveAdminRule(3, inputs({ 3: { baseSessionGain: 10, bonusPercent: 5, requiredSetsForFullGain: 10 } }));
    const g = computeAdminSessionGain({ rule, setsPerformed: 12, performanceRatio: 1, track: { levelSessions: 1 }, completedAt: d });
    expect(g.totalGain).toBe(10);
  });
});
