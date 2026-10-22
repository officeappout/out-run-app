/**
 * progression-admin-rules — the PURE side of "progression follows the admin panel"
 * (system-settings flag `progression_rules_from_admin`, owner decision 22.10.2026).
 *
 * No Firestore here: the service (progression.service.ts) and its loader
 * (progression-admin-rules.loader.ts) fetch the docs, this file decides.
 * The admin progression manager imports the same functions for its
 * "בשימוש / ברירת מחדל" badge and the gain preview, so the panel shows
 * exactly what the engine will pay.
 *
 *   resolveAdminRule      — which rule a (program, level) gets: progression_rules doc →
 *                           programLevelSettings doc → last configured level (carry) → defaults
 *   computeAdminSessionGain — base + over-target bonus (same formula as today) with the
 *                           admin maxSets cap, plus firstSession / persistence / RPE bonuses
 *   nextAdminTrackCounters — the per-track counters those bonuses need
 */
import {
  DEFAULT_PROGRESSION_BY_LEVEL,
  getDefaultRequiredSets,
  type DomainTrackProgress,
  type LinkedProgramConfig,
} from '../../core/types/progression.types';

/** Where a resolved rule came from — shown in the admin panel. */
export type AdminRuleSource = 'progression_rules' | 'programLevelSettings' | 'default';

/** Raw `progression_rules/{id}` doc data (admin "מנהל התקדמות"). */
export interface AdminRuleDocData {
  baseSessionGain?: number;
  baseGain?: number;
  bonusPercent?: number;
  requiredSetsForFullGain?: number;
  requiredSets?: number;
  linkedPrograms?: LinkedProgramConfig[];
  [key: string]: unknown;
}

/** Raw `programLevelSettings/{id}` doc data — the bonus fields the engine now reads. */
export interface AdminLevelSettingsData {
  baseGain?: number;
  baseSessionGain?: number;
  bonusPercent?: number;
  requiredSetsForFullGain?: number;
  requiredSets?: number;
  firstSessionBonus?: number;
  persistenceBonusConfig?: Record<string, number>;
  rpeBonusConfig?: Record<string, number>;
  maxSets?: number;
  [key: string]: unknown;
}

export interface ResolvedAdminRule {
  baseSessionGain: number;
  bonusPercent: number;
  requiredSetsForFullGain: number;
  linkedPrograms: LinkedProgramConfig[];
  /** Where base/bonus/requiredSets came from. */
  source: AdminRuleSource;
  /** Set when the level is above the last configured one and that level's rule is used. */
  carriedFromLevel?: number;
  /** programLevelSettings bonus fields (undefined = not configured → not paid). */
  firstSessionBonus?: number;
  persistenceBonusConfig?: Record<string, number>;
  rpeBonusConfig?: Record<string, number>;
  maxSets?: number;
}

export interface AdminRuleInputs {
  /** progression_rules docs of this program, by level. */
  rules: ReadonlyMap<number, AdminRuleDocData>;
  /** programLevelSettings docs of this program, by level. */
  settings: ReadonlyMap<number, AdminLevelSettingsData>;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;

/** The engine's hard-coded fallback for a level (today's behaviour for everyone). */
export function defaultRuleForLevel(level: number): ResolvedAdminRule {
  const d = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];
  return {
    baseSessionGain: d.baseGain,
    bonusPercent: d.bonusPercent,
    requiredSetsForFullGain: getDefaultRequiredSets(level),
    linkedPrograms: [],
    source: 'default',
  };
}

/** The level whose doc applies: the exact level, or — above the last configured level — the last one. */
export function pickConfiguredLevel(level: number, configured: readonly number[]): number | null {
  let max = -Infinity;
  for (const l of configured) {
    if (l === level) return level;
    if (l > max) max = l;
  }
  return Number.isFinite(max) && level > max ? max : null;
}

const hasGain = (s: AdminLevelSettingsData | undefined) =>
  !!s && (num(s.baseSessionGain) != null || num(s.baseGain) != null);

/**
 * Rule for (program, level), in order:
 *   1. progression_rules doc at the level (or, above the last configured level, the last one)
 *   2. programLevelSettings doc with a base gain at the level (same carry)
 *   3. DEFAULT_PROGRESSION_BY_LEVEL
 * The programLevelSettings bonus fields (firstSessionBonus / persistence / RPE / maxSets)
 * are read from the settings doc at the level (same carry), whichever source won 1–3.
 */
export function resolveAdminRule(level: number, inputs: AdminRuleInputs): ResolvedAdminRule {
  const defaults = defaultRuleForLevel(level);
  let out: ResolvedAdminRule = defaults;

  const ruleLevel = pickConfiguredLevel(level, Array.from(inputs.rules.keys()));
  const gainLevels = Array.from(inputs.settings.entries()).filter(([, s]) => hasGain(s)).map(([l]) => l);
  const plsGainLevel = pickConfiguredLevel(level, gainLevels);

  const from = (data: AdminRuleDocData | AdminLevelSettingsData, atLevel: number, source: AdminRuleSource): ResolvedAdminRule => ({
    baseSessionGain: num(data.baseGain) ?? num(data.baseSessionGain) ?? defaults.baseSessionGain,
    bonusPercent: num(data.bonusPercent) ?? defaults.bonusPercent,
    requiredSetsForFullGain:
      num(data.requiredSetsForFullGain) ?? num(data.requiredSets) ?? getDefaultRequiredSets(atLevel),
    linkedPrograms: Array.isArray((data as AdminRuleDocData).linkedPrograms)
      ? ((data as AdminRuleDocData).linkedPrograms as LinkedProgramConfig[])
      : [],
    source,
    ...(atLevel !== level ? { carriedFromLevel: atLevel } : {}),
  });

  if (ruleLevel != null) out = from(inputs.rules.get(ruleLevel)!, ruleLevel, 'progression_rules');
  else if (plsGainLevel != null) out = from(inputs.settings.get(plsGainLevel)!, plsGainLevel, 'programLevelSettings');

  const bonusLevel = pickConfiguredLevel(level, Array.from(inputs.settings.keys()));
  const s = bonusLevel != null ? inputs.settings.get(bonusLevel) : undefined;
  if (s) {
    const fsb = num(s.firstSessionBonus);
    const maxSets = num(s.maxSets ?? (s as { hardCap?: unknown }).hardCap);
    if (fsb != null) out.firstSessionBonus = fsb;
    if (s.persistenceBonusConfig && typeof s.persistenceBonusConfig === 'object') out.persistenceBonusConfig = s.persistenceBonusConfig;
    if (s.rpeBonusConfig && typeof s.rpeBonusConfig === 'object') out.rpeBonusConfig = s.rpeBonusConfig;
    if (maxSets != null && maxSets > 0) out.maxSets = maxSets;
  }
  return out;
}

/**
 * Persistence config lookup: `{ "2": 1, "5": 2, "7": 3 }` = session #2 of the month +1%,
 * #5 +2%, #7 +3%; sessions with no key get 0, sessions past the highest key keep
 * the highest key's value (the admin defaults list 7–10 all at +3%).
 */
export function persistenceBonusFor(config: Record<string, number> | undefined, sessionNumber: number): number {
  if (!config) return 0;
  const entries = Object.entries(config)
    .map(([k, v]) => [Number(k), num(v)] as const)
    .filter((e): e is readonly [number, number] => Number.isFinite(e[0]) && e[1] != null);
  if (entries.length === 0) return 0;
  const exact = entries.find(([k]) => k === sessionNumber);
  if (exact) return exact[1];
  const [maxKey, maxVal] = entries.reduce((a, b) => (b[0] > a[0] ? b : a));
  return sessionNumber > maxKey ? maxVal : 0;
}

/** RPE config lookup: `{ "6": 1, "7": 1 }` keyed by the session RPE (rounded, 1–10). No RPE → 0. */
export function rpeBonusFor(config: Record<string, number> | undefined, rpe: number | undefined): number {
  if (!config || rpe == null || !Number.isFinite(rpe)) return 0;
  const key = String(Math.min(10, Math.max(1, Math.round(rpe))));
  return num(config[key]) ?? 0;
}

/** Calendar month key (local time) for the persistence counter. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type TrackCounters = Pick<DomainTrackProgress, 'totalWorkoutsCompleted' | 'levelSessions' | 'monthKey' | 'monthSessions'>;

/** First session at this level: counter says 0, or (track predates the counter) no workout yet. */
export function isFirstSessionAtLevel(track: TrackCounters): boolean {
  if (typeof track.levelSessions === 'number') return track.levelSessions === 0;
  return !track.totalWorkoutsCompleted;
}

/** This session's number within the calendar month for this program (1-based). */
export function monthSessionNumber(track: TrackCounters, completedAt: Date): number {
  return (track.monthKey === monthKeyOf(completedAt) ? track.monthSessions ?? 0 : 0) + 1;
}

/** Counters to store on the track after this session (levelSessions resets on level-up). */
export function nextAdminTrackCounters(
  track: TrackCounters,
  completedAt: Date,
  leveledUp: boolean,
): Required<Pick<DomainTrackProgress, 'levelSessions' | 'monthKey' | 'monthSessions'>> {
  const levelSessions = leveledUp
    ? 0
    : (typeof track.levelSessions === 'number' ? track.levelSessions : track.totalWorkoutsCompleted ? 1 : 0) + 1;
  return { levelSessions, monthKey: monthKeyOf(completedAt), monthSessions: monthSessionNumber(track, completedAt) };
}

export interface AdminSessionGain {
  /** Sets that counted (capped by the admin maxSets). */
  countedSets: number;
  volumeRatio: number;
  baseGain: number;
  /** Over-target-reps bonus (same formula as today). */
  bonusGain: number;
  firstSessionBonus: number;
  persistenceBonus: number;
  rpeBonus: number;
  /** firstSession + persistence + RPE. */
  extrasGain: number;
  totalGain: number;
}

/**
 * One program's gain from one session under the admin rules.
 * Base/bonus = today's pay-as-you-go formula, but counted sets are capped at the
 * level's maxSets. Extras are flat % and only paid when at least one set counted.
 */
export function computeAdminSessionGain(params: {
  rule: Pick<ResolvedAdminRule, 'baseSessionGain' | 'bonusPercent' | 'requiredSetsForFullGain' | 'firstSessionBonus' | 'persistenceBonusConfig' | 'rpeBonusConfig' | 'maxSets'>;
  setsPerformed: number;
  /** Actual reps ÷ target reps (1 = on target). */
  performanceRatio: number;
  track: TrackCounters;
  completedAt: Date;
  sessionRpe?: number;
}): AdminSessionGain {
  const { rule, performanceRatio, track, completedAt, sessionRpe } = params;
  const countedSets = rule.maxSets != null && rule.maxSets > 0 ? Math.min(params.setsPerformed, rule.maxSets) : params.setsPerformed;
  const volumeRatio = rule.requiredSetsForFullGain > 0 ? Math.min(1, countedSets / rule.requiredSetsForFullGain) : 0;
  const baseGain = volumeRatio * rule.baseSessionGain;
  let bonusGain = 0;
  if (performanceRatio > 1) {
    const excessPercent = (performanceRatio - 1) * 100;
    bonusGain = Math.min(excessPercent * (rule.bonusPercent / 100), rule.bonusPercent) * volumeRatio;
  }
  const active = countedSets > 0;
  const firstSessionBonus = active && isFirstSessionAtLevel(track) ? rule.firstSessionBonus ?? 0 : 0;
  const persistenceBonus = active ? persistenceBonusFor(rule.persistenceBonusConfig, monthSessionNumber(track, completedAt)) : 0;
  const rpeBonus = active ? rpeBonusFor(rule.rpeBonusConfig, sessionRpe) : 0;
  const extrasGain = firstSessionBonus + persistenceBonus + rpeBonus;
  return {
    countedSets,
    volumeRatio,
    baseGain,
    bonusGain,
    firstSessionBonus,
    persistenceBonus,
    rpeBonus,
    extrasGain,
    totalGain: baseGain + bonusGain + extrasGain,
  };
}
