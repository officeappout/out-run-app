'use client';

/**
 * What the workout engine actually pays for this program — computed with the SAME
 * pure functions the engine uses (progression-admin-rules.ts), so the panel cannot drift:
 *   RuleLiveBadge   — per level: כלל מותאם / מהגדרות הרמה / ממשיך מרמה N / ברירת מחדל
 *   RuleValuesLine  — the values in effect at the level
 *   RuleSourcesSummary — header counts by source
 *   GainPreview     — "אימון של 12 סטים ברמה 3 → +X%"
 *   AdminRulesBanner — whether the switch "התקדמות לפי הגדרות הפאנל" is on
 */
import React, { useEffect, useMemo, useState } from 'react';
import { readFeatureFlagOnce } from '@/lib/feature-flag-once';
import type { ProgramLevelSettings } from '@/features/content/programs/core/program.types';
import type { ProgressionRule } from '@/features/user/core/types/progression.types';
import {
  computeAdminSessionGain,
  resolveAdminRule,
  type AdminLevelSettingsData,
  type AdminRuleDocData,
  type AdminRuleInputs,
} from '@/features/user/progression/services/progression-admin-rules';
import {
  ADMIN_RULE_SWITCH_OFF_NOTE,
  adminRuleBadge,
  adminRuleHeaderLabel,
  adminRuleValuesLine,
  countAdminRuleSources,
  type AdminRuleBadgeKind,
} from '@/features/user/progression/services/progression-admin-labels';

export function buildAdminRuleInputs(
  rules: ProgressionRule[],
  levelSettingsMap: Record<number, ProgramLevelSettings>,
): AdminRuleInputs {
  const ruleMap = new Map<number, AdminRuleDocData>();
  for (const r of rules) ruleMap.set(r.level, r as unknown as AdminRuleDocData);
  const settings = new Map<number, AdminLevelSettingsData>();
  for (const [lvl, s] of Object.entries(levelSettingsMap)) settings.set(Number(lvl), s as unknown as AdminLevelSettingsData);
  return { rules: ruleMap, settings };
}

/** The panel switch as stored (super admins get it ON on their own workouts regardless). */
export function useAdminRulesSwitch(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    readFeatureFlagOnce('progression_rules_from_admin').then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

export function AdminRulesBanner({ on }: { on: boolean | null }) {
  if (on == null) return null;
  return (
    <div className={`rounded-xl px-4 py-2 text-sm border ${on ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
      {on
        ? 'המתג "התקדמות לפי הגדרות הפאנל" פעיל — המשתמשים מקבלים את הערכים שמוצגים מתחת לכל רמה.'
        : 'המתג "התקדמות לפי הגדרות הפאנל" כבוי (הגדרות מערכת) — כרגע כל המשתמשים מקבלים ברירות מחדל. מנהל-על כבר רואה את ההגדרות האלה באימונים שלו. התגיות מראות מה ייכנס לשימוש כשהמתג יופעל.'}
    </div>
  );
}

const BADGE_CLASS: Record<AdminRuleBadgeKind, string> = {
  custom: 'bg-violet-100 text-violet-700',
  settings: 'bg-emerald-100 text-emerald-700',
  carried: 'bg-sky-100 text-sky-700',
  default: 'bg-gray-100 text-gray-600',
};

/**
 * Where the engine takes this level's numbers from: "כלל מותאם" / "מהגדרות הרמה" /
 * "ממשיך מרמה N" / "ברירת מחדל". While the panel switch is off (switchOn === false)
 * a non-default badge also says it only takes effect once the switch is on.
 */
export function RuleLiveBadge({ level, inputs, switchOn }: { level: number; inputs: AdminRuleInputs; switchOn?: boolean | null }) {
  const r = useMemo(() => resolveAdminRule(level, inputs), [level, inputs]);
  const b = adminRuleBadge(r);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${BADGE_CLASS[b.kind]}`} title={adminRuleValuesLine(r)}>
        {b.label}
      </span>
      {switchOn === false && b.kind !== 'default' && (
        <span className="text-[11px] font-normal text-amber-700">· {ADMIN_RULE_SWITCH_OFF_NOTE}</span>
      )}
    </span>
  );
}

/** The values in effect at the level (resolved), never the static defaults unless that is the source. */
export function RuleValuesLine({ level, inputs, className }: { level: number; inputs: AdminRuleInputs; className?: string }) {
  const r = useMemo(() => resolveAdminRule(level, inputs), [level, inputs]);
  return <p className={className ?? 'text-sm text-gray-500'}>{adminRuleValuesLine(r)}</p>;
}

/** Header chip: "X כללים מותאמים · Y רמות עם הגדרות · Z על ברירת מחדל". */
export function RuleSourcesSummary({ levels, inputs }: { levels: readonly number[]; inputs: AdminRuleInputs }) {
  const label = useMemo(() => adminRuleHeaderLabel(countAdminRuleSources(levels, inputs)), [levels, inputs]);
  return <span className="bg-white/20 px-3 py-1 rounded-full">{label}</span>;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function GainPreview({ inputs, maxLevel }: { inputs: AdminRuleInputs; maxLevel: number }) {
  const [sets, setSets] = useState(12);
  const [level, setLevel] = useState(3);
  const rule = useMemo(() => resolveAdminRule(level, inputs), [level, inputs]);
  // A regular session: on target, not the first at the level, not a persistence milestone, no RPE.
  const g = computeAdminSessionGain({
    rule,
    setsPerformed: sets,
    performanceRatio: 1,
    track: { levelSessions: 1 },
    completedAt: new Date(),
  });
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));
  return (
    <div className="bg-white rounded-xl border border-violet-200 p-4 text-sm text-gray-800 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span>אימון של</span>
        <input type="number" value={sets} min={0} max={60} onChange={(e) => setSets(num(e.target.value, 0, 60))}
          className="w-16 border rounded-lg px-2 py-1 text-center" aria-label="סטים" />
        <span>סטים ברמה</span>
        <input type="number" value={level} min={1} max={maxLevel} onChange={(e) => setLevel(num(e.target.value, 1, maxLevel))}
          className="w-16 border rounded-lg px-2 py-1 text-center" aria-label="רמה" />
        <span>→</span>
        <strong className="text-violet-700 text-base">+{fmt(g.totalGain)}%</strong>
        <RuleLiveBadge level={level} inputs={inputs} />
      </div>
      <div className="text-xs text-gray-500">
        נספרים {g.countedSets}/{rule.requiredSetsForFullGain} סטים{rule.maxSets ? ` (תקרה ${rule.maxSets})` : ''} · בסיס {fmt(rule.baseSessionGain)}%
        {rule.firstSessionBonus ? ` · אימון ראשון ברמה +${fmt(rule.firstSessionBonus)}%` : ''}
        {rule.persistenceBonusConfig ? ' · התמדה לפי מספר האימון בחודש' : ''}
        {rule.rpeBonusConfig ? ' · RPE כשנרשם' : ''}
        {' · '}בונוס יעד: פעם אחת לכל יעד ברמה
      </div>
    </div>
  );
}
