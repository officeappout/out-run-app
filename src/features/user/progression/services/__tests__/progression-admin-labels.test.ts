import { describe, it, expect } from 'vitest';
import {
  adminRuleBadge,
  adminRuleHeaderLabel,
  adminRuleValuesLine,
  countAdminRuleSources,
} from '../progression-admin-labels';
import { resolveAdminRule, type AdminLevelSettingsData, type AdminRuleDocData, type AdminRuleInputs } from '../progression-admin-rules';

const inputs = (rules: Record<number, AdminRuleDocData>, settings: Record<number, AdminLevelSettingsData>): AdminRuleInputs => ({
  rules: new Map(Object.entries(rules).map(([k, v]) => [Number(k), v])),
  settings: new Map(Object.entries(settings).map(([k, v]) => [Number(k), v])),
});

describe('progression manager labels', () => {
  it('skill program with only programLevelSettings: no "0 רמות" + "בשימוש" mix — counted as settings', () => {
    const inp = inputs({}, { 1: { baseGain: 6 }, 2: { baseGain: 5 } });
    const c = countAdminRuleSources([1, 2, 3, 4], inp);
    expect(c).toEqual({ custom: 0, settings: 2, carried: 2, defaults: 0 });
    expect(adminRuleHeaderLabel(c)).toBe('0 כללים מותאמים · 2 רמות עם הגדרות · 0 על ברירת מחדל · 2 ממשיכות מרמה קודמת');
  });

  it('badges per source', () => {
    const inp = inputs({ 1: { baseGain: 7 } }, { 2: { baseGain: 5 } });
    expect(adminRuleBadge(resolveAdminRule(1, inp)).label).toBe('כלל מותאם');
    // A progression_rules doc beats settings and carries upward.
    expect(adminRuleBadge(resolveAdminRule(3, inp)).label).toBe('ממשיך מרמה 1');
    expect(adminRuleBadge(resolveAdminRule(1, inputs({}, {}))).label).toBe('ברירת מחדל');
    expect(adminRuleBadge(resolveAdminRule(2, inputs({}, { 2: { baseGain: 5 } }))).label).toBe('מהגדרות הרמה');
  });

  it('the values line prints what the engine resolves (settings values, not the static defaults)', () => {
    const r = resolveAdminRule(2, inputs({}, { 2: { baseGain: 4.5, bonusPercent: 2, requiredSets: 9, firstSessionBonus: 3, maxSets: 20 } }));
    expect(adminRuleValuesLine(r)).toBe('4.5% בסיס | 2% בונוס | 9 סטים | אימון ראשון +3% | תקרה 20 סטים');
  });

  it('header with no config at all', () => {
    expect(adminRuleHeaderLabel(countAdminRuleSources([1, 2, 3], inputs({}, {})))).toBe('0 כללים מותאמים · 0 רמות עם הגדרות · 3 על ברירת מחדל');
  });
});
