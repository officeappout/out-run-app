/**
 * Splits a run's findings into product issues (clustered + counted) and screen-score records
 * (DESIGN-SCORE — not issues; they feed the design report only). Pure.
 */
import { isScoreFinding } from '../design/score-finding';
import type { Finding } from '../findings';

export function splitFindings(all: readonly Finding[]): { issues: Finding[]; scores: Finding[] } {
  const issues: Finding[] = [];
  const scores: Finding[] = [];
  for (const f of all) (isScoreFinding(f) ? scores : issues).push(f);
  return { issues, scores };
}
