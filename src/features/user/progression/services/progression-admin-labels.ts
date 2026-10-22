/**
 * Admin progression manager — honest labels for what the engine resolves per level.
 * Pure (no React): the header counts, the per-level source badge and the values line
 * all come from resolveAdminRule, the same function the engine pays with, so the
 * panel can never show one source in the badge and another source's numbers below it.
 */
import { resolveAdminRule, type AdminRuleInputs, type ResolvedAdminRule } from './progression-admin-rules';

export interface AdminRuleSourceCounts {
  /** Levels paid by their own progression_rules doc. */
  custom: number;
  /** Levels paid by their own programLevelSettings gain fields. */
  settings: number;
  /** Levels above the last configured one, carrying it forward. */
  carried: number;
  /** Levels on the hard-coded engine defaults. */
  defaults: number;
}

export function countAdminRuleSources(levels: readonly number[], inputs: AdminRuleInputs): AdminRuleSourceCounts {
  const out: AdminRuleSourceCounts = { custom: 0, settings: 0, carried: 0, defaults: 0 };
  for (const level of levels) {
    const r = resolveAdminRule(level, inputs);
    if (r.source === 'default') out.defaults++;
    else if (r.carriedFromLevel != null) out.carried++;
    else if (r.source === 'progression_rules') out.custom++;
    else out.settings++;
  }
  return out;
}

/** "X כללים מותאמים · Y רמות עם הגדרות · Z על ברירת מחדל" (+ "· W ממשיכות מרמה קודמת" when any). */
export function adminRuleHeaderLabel(c: AdminRuleSourceCounts): string {
  const parts = [`${c.custom} כללים מותאמים`, `${c.settings} רמות עם הגדרות`, `${c.defaults} על ברירת מחדל`];
  if (c.carried > 0) parts.push(`${c.carried} ממשיכות מרמה קודמת`);
  return parts.join(' · ');
}

export type AdminRuleBadgeKind = 'custom' | 'settings' | 'carried' | 'default';

export function adminRuleBadge(r: ResolvedAdminRule): { kind: AdminRuleBadgeKind; label: string } {
  if (r.source === 'default') return { kind: 'default', label: 'ברירת מחדל' };
  if (r.carriedFromLevel != null) return { kind: 'carried', label: `ממשיך מרמה ${r.carriedFromLevel}` };
  if (r.source === 'progression_rules') return { kind: 'custom', label: 'כלל מותאם' };
  return { kind: 'settings', label: 'מהגדרות הרמה' };
}

/** Shown next to a non-default badge while the panel switch is off. */
export const ADMIN_RULE_SWITCH_OFF_NOTE = 'ייכנס לשימוש כשהמתג יופעל';

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** The values actually in effect at the level — always the resolved ones. */
export function adminRuleValuesLine(r: ResolvedAdminRule): string {
  const parts = [
    `${fmt(r.baseSessionGain)}% בסיס`,
    `${fmt(r.bonusPercent)}% בונוס`,
    `${r.requiredSetsForFullGain} סטים`,
  ];
  if (r.firstSessionBonus) parts.push(`אימון ראשון +${fmt(r.firstSessionBonus)}%`);
  if (r.maxSets) parts.push(`תקרה ${r.maxSets} סטים`);
  if (r.persistenceBonusConfig) parts.push('בונוס התמדה');
  if (r.rpeBonusConfig) parts.push('בונוס RPE');
  return parts.join(' | ');
}
