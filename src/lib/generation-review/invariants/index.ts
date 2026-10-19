/**
 * The invariant registry + runner. Pure. Add a rule: one file + one line in RULES.
 */
import { activityMismatch } from './activity-mismatch';
import { duplicateExercises } from './duplicate-exercises';
import { durationMismatch } from './duration-mismatch';
import { equipmentMismatch } from './equipment-mismatch';
import { hybridNoStrengthStop } from './hybrid-no-strength-stop';
import { levelGap } from './level-gap';
import { missingMedia } from './missing-media';
import { routeMissesStationPark } from './route-misses-station-park';
import { routeQuality } from './route-quality';
import { strengthSinglePattern } from './strength-single-pattern';
import { zeroMinuteLeg } from './zero-minute-leg';
import type { Finding, InvariantRule, RuleId, SessionForCheck } from './types';

export * from './types';

export const RULES: readonly InvariantRule[] = [
  routeMissesStationPark,
  hybridNoStrengthStop,
  strengthSinglePattern,
  activityMismatch,
  zeroMinuteLeg,
  durationMismatch,
  levelGap,
  equipmentMismatch,
  routeQuality,
  duplicateExercises,
  missingMedia,
];

export const RULE_BY_ID: Record<RuleId, InvariantRule> = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, InvariantRule>;

/** Every finding for one session, most severe first. A rule that throws is skipped (logged). */
export function runInvariants(s: SessionForCheck): Finding[] {
  const out: Finding[] = [];
  for (const rule of RULES) {
    try {
      out.push(...rule.check(s));
    } catch (err) {
      console.warn(`[generation-review] rule ${rule.id} failed`, err instanceof Error ? err.message : err);
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}
