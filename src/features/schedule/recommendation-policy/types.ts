/**
 * Recommendation policy (enable_home_v2, owner 20.10.2026) — public shapes.
 *
 * The POLICY is plain JSON-safe data (no functions, no Dates): today it lives in
 * policy.config.ts; later the same object can come from a Firestore config doc
 * (or be edited by admin / chat) and be passed to the resolver unchanged.
 * The resolver (resolve.ts) is pure: signals + policy → a recommendation.
 */
import type { SessionType, LevelTier } from '@/features/workout-engine/services/split-decision/split-decision.types';
import type { TimeWindow } from '../engine-v2/types';

/** Strength level band — the workout generator's own tiers (getLevelTier: 1–5 / 6–13 / 14+). */
export type StrengthBand = LevelTier;
/** Running ability band (from the ability tier / goal path / pace). */
export type RunBand = 'beginner' | 'intermediate' | 'advanced';
/** Which tracks the user trains (after this signup). */
export type TrackMix = 'strength' | 'running' | 'both';

/**
 * Normalized goal ids — the onboarding / profile ids mapped into one small set
 * (signals.ts holds the mapping; the policy only ever sees these).
 */
export type PolicyGoal = 'fat_loss' | 'core_abs' | 'skills' | 'muscle' | 'health' | 'performance';

/** Normalized audience — personas / age mapped (signals.ts). */
export type PolicyAudience = 'senior' | 'athlete' | 'general';

export interface PolicySignals {
  tracks: TrackMix;
  /**
   * The level the split is chosen by: the AVERAGE of push / pull / legs, rounded
   * down (owner 20.10.2026; strengthLevelOf). null = no level yet (treated as beginner).
   */
  strengthLevel: number | null;
  runBand: RunBand | null;
  goals: PolicyGoal[];
  audience: PolicyAudience;
  /** Hard skills the user picked (handstand excluded) — drives the skill minimum. */
  hardSkillCount: number;
  /** Days the user can train; null = not asked yet (the policy's default pool is used). */
  availableDays: number | null;
  /** Run target distance ('3k' | '5k' | '10k' | 'maintenance' …), when running. */
  targetDistance?: string | null;
}

/** A condition: every listed field must match (an omitted field matches anything). */
export interface PolicyWhen {
  tracks?: TrackMix[];
  strengthBands?: StrengthBand[];
  runBands?: RunBand[];
  /** Matches when the user has ANY of these goals. */
  goalsAny?: PolicyGoal[];
  /** Matches only when the user has NONE of these goals. */
  goalsNone?: PolicyGoal[];
  audiences?: PolicyAudience[];
  /** Matches when hardSkillCount ≥ / ≤ this. */
  minHardSkills?: number;
  maxHardSkills?: number;
  /** Matches when availableDays (or the default pool) ≥ / ≤ this. */
  minAvailableDays?: number;
  maxAvailableDays?: number;
  targetDistances?: string[];
}

export type AddOnKind = 'core' | 'mobility' | 'movement';

/** A short extra session on top of the main week (shown with the recommendation). */
export interface PolicyAddOn {
  kind: AddOnKind;
  minutes: number;
  perWeek: number;
  window?: TimeWindow;
  /** "ליבה 10′ ×2 בערב" — `{k}` is filled with perWeek. */
  labelHe: string;
  /**
   * Fill the free days: perWeek = available days − the week's sessions (dropped when
   * none are left). E.g. a beginner's light movement / walk days next to 3 strength.
   */
  fillsFreeDays?: boolean;
}

export interface PolicyEffect {
  /** Set the number (strength sessions a week). */
  strengthFrequency?: number;
  /** Add to the number (may be negative). */
  strengthDelta?: number;
  /** Never above / below these. */
  strengthMax?: number;
  strengthMin?: number;
  runFrequency?: number;
  runDelta?: number;
  runMax?: number;
  runMin?: number;
  addOns?: PolicyAddOn[];
  /** One short Hebrew reason, shown when this rule fired. */
  reasonHe?: string;
}

export interface PolicyRule {
  /** Stable id (for tuning / analytics / admin). */
  id: string;
  /** Owner-facing note — what this rule is for. */
  note?: string;
  when: PolicyWhen;
  then: PolicyEffect;
}

export interface RecommendationPolicy {
  version: number;
  /** Shabbat: Saturday is never a default training day unless the user marks it. */
  saturdayDefaultOff: boolean;
  /** Days assumed free before the user picks (Sun–Fri = 6). */
  defaultAvailableDays: number;
  strength: {
    base: Record<StrengthBand, { frequency: number; reasonHe: string }>;
    bounds: { min: number; max: number };
    /** Hard-skill count → minimum strength days (the existing ERR_DAYS_MIN table). */
    skillMinDays: Record<string, number>;
    skillMinReasonHe: string;
    /**
     * The split by level × sessions a week ('1'…'6'), owner-approved 20.10.2026:
     * 3 → full body (every level), 4 → upper / lower (intermediate+). The cells the
     * owner didn't change keep the generator's SPLIT_MATRIX value.
     */
    splits: Record<StrengthBand, Record<string, SessionType>>;
  };
  running: {
    base: Record<RunBand, { frequency: number; reasonHe: string }>;
    bounds: { min: number; max: number };
  };
  /** Applied in order after the base; later rules see earlier results. */
  rules: PolicyRule[];
  /** Hebrew names of the split session types. */
  splitNamesHe: Record<SessionType, string>;
  /** Name shown instead when the user trains hard skills (the generator's skill-dominance days). */
  skillSplitNameHe: string;
  /** Reason when the available days cut the number. */
  availableDaysReasonHe: string;
}

export interface StrengthRecommendation {
  frequency: number;
  /** The split the workout generator will actually run at this frequency × level. */
  split: SessionType;
  splitHe: string;
  band: StrengthBand;
}

export interface RunRecommendation {
  frequency: number;
  band: RunBand;
}

export interface PolicyRecommendation {
  strength: StrengthRecommendation | null;
  running: RunRecommendation | null;
  addOns: PolicyAddOn[];
  /** Short Hebrew reasons, most important first (base reason first). */
  reasonsHe: string[];
  /** Ids of the rules that fired (debug / analytics). */
  firedRuleIds: string[];
}
