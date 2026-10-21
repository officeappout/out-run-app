/**
 * How a screen score and a finding's screen id are stored (pure). Both ride on the existing
 * Finding shape, so qaRunnerReport's `finding` op and its sanitiser accept them unchanged:
 *   - a score is a Finding with rule DESIGN-SCORE, the four numbers encoded in `actual`;
 *   - the screen id is the last repro step `{ name: 'screen', screen: '<id>' }` (repro keys and
 *     string values pass the sanitiser as is).
 */
import { fingerprint, type Finding, type ReproStep } from '../findings';
import { encodeScores, decodeScores, lowDimensions, overallScore, DIMENSION_HE, SCORE_RULE_ID, type Scores } from './dimensions';

export const SCREEN_STEP = 'screen';

export function withScreen(repro: readonly ReproStep[], screen: string | null, max = 25): ReproStep[] {
  const base = repro.filter((r) => r.name !== SCREEN_STEP);
  return screen ? [...base.slice(-(max - 1)), { name: SCREEN_STEP, screen }] : base.slice(-max);
}

/** The screen id a finding belongs to (its repro marker), else null. */
export function screenOfFinding(f: Pick<Finding, 'repro'>): string | null {
  for (let i = f.repro.length - 1; i >= 0; i--) {
    const r = f.repro[i];
    if (r.name === SCREEN_STEP && typeof r.screen === 'string') return r.screen;
  }
  return null;
}

/** The grouping key: screen id when the tester gave one, else the route pattern. */
export function screenKey(f: Pick<Finding, 'repro' | 'route'>): string {
  return screenOfFinding(f) ?? f.route;
}

export function isScoreFinding(f: Pick<Finding, 'rule'>): boolean {
  return f.rule === SCORE_RULE_ID;
}

export type FindingBase = Omit<Finding, 'id' | 'fingerprint' | 'category' | 'severity' | 'rule' | 'title' | 'expected' | 'actual' | 'screenshot' | 'confidence' | 'source'>;

/** A score record (one per mission × screen × run; repeats only bump the count). */
export function buildScoreFinding(base: FindingBase, screen: string, scores: Scores, notes: string): Finding {
  return {
    ...base,
    repro: withScreen(base.repro, screen),
    id: '',
    fingerprint: fingerprint(base.route, SCORE_RULE_ID, `${base.mission}:${screen}`),
    category: 'design-rule',
    severity: 'P3',
    rule: SCORE_RULE_ID,
    title: `ציון עיצוב: ${screen} — ${overallScore(scores).toFixed(1)}/5`,
    expected: `מסך ${screen} לפי שפת העיצוב v2`,
    actual: encodeScores(scores, notes),
    screenshot: null,
    confidence: 1,
    source: 'llm',
  };
}

export function scoresOf(f: Pick<Finding, 'rule' | 'actual'>): Scores | null {
  return isScoreFinding(f) ? (decodeScores(f.actual)?.scores ?? null) : null;
}

/** The tool_result text the model gets back — reminds it of the ≤ 3 → finding contract. */
export function scoreAck(screen: string, scores: Scores): string {
  const low = lowDimensions(scores);
  if (!low.length) return `score recorded for ${screen}`;
  return `score recorded for ${screen}. Now report_finding (screen "${screen}", a rule id) for each low dimension: ${low.join(', ')} (${low.map((d) => DIMENSION_HE[d]).join(', ')}).`;
}
