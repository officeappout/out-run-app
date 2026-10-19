/**
 * Invariant rules — the vocabulary. Pure. A rule looks at one logged session (type + input +
 * output summary) and returns zero or more findings. Rules never throw on missing fields: an
 * unknown value means "can't judge", never a finding.
 */
import type { GenerationInput, GenerationOutput, GenerationType } from '../types';

/** 1 = minor, 2 = clear problem, 3 = severe (the user sees something plainly wrong). */
export type Severity = 1 | 2 | 3;

export const SEVERITY_LABEL_HE: Record<Severity, string> = { 1: 'קל', 2: 'ברור', 3: 'חמור' };

export interface SessionForCheck {
  type: GenerationType;
  input: GenerationInput;
  output: GenerationOutput;
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** Hebrew, specific to this session ("התחנה X נמצאת 120 מ׳ מהמסלול"). */
  messageHe: string;
  /** Small machine-readable detail for the panel / fixtures. */
  data?: Record<string, string | number | boolean | null>;
}

export const RULE_IDS = [
  'ROUTE_MISSES_STATION_PARK',
  'HYBRID_NO_STRENGTH_STOP',
  'STRENGTH_SINGLE_PATTERN',
  'ACTIVITY_MISMATCH',
  'ZERO_MINUTE_LEG',
  'DURATION_MISMATCH',
  'LEVEL_GAP',
  'EQUIPMENT_MISMATCH',
  'ROUTE_QUALITY',
  'DUPLICATE_EXERCISES',
  'MISSING_MEDIA',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface InvariantRule {
  id: RuleId;
  titleHe: string;
  descriptionHe: string;
  /** Default severity (a finding may carry a different one). */
  severity: Severity;
  check(s: SessionForCheck): Finding[];
}
