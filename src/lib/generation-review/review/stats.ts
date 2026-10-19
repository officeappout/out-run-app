/**
 * Daily counters for generation_review_stats/{day}. Pure.
 */
import type { Finding, RuleId, Severity } from '../invariants/types';
import type { GenerationType } from '../types';

export interface GenStatsDelta {
  sessions: number;
  flagged: number;
  findings: number;
  reports: number;
  llmReviewed: number;
  llmCostUsd: number;
  byRule: Partial<Record<RuleId, number>>;
  /** Sessions per generator type. */
  byType: Partial<Record<GenerationType, number>>;
  /** Flagged sessions per generator type. */
  flaggedByType: Partial<Record<GenerationType, number>>;
  bySeverity: Partial<Record<`s${Severity}`, number>>;
}

export function emptyDelta(): GenStatsDelta {
  return { sessions: 0, flagged: 0, findings: 0, reports: 0, llmReviewed: 0, llmCostUsd: 0, byRule: {}, byType: {}, flaggedByType: {}, bySeverity: {} };
}

const bump = <K extends string>(m: Partial<Record<K, number>>, k: K, n = 1) => {
  m[k] = (m[k] ?? 0) + n;
};

/**
 * One reviewed session → its delta. `firstReview` false = a re-review after a new report: only
 * the new reports count (the session and its findings were counted the first time).
 */
export function deltaForSession(type: GenerationType, findings: Finding[], opts: { firstReview: boolean; newReports: number }): GenStatsDelta {
  const d = emptyDelta();
  d.reports = opts.newReports;
  if (!opts.firstReview) return d;
  d.sessions = 1;
  bump(d.byType, type);
  if (findings.length || opts.newReports) {
    d.flagged = 1;
    bump(d.flaggedByType, type);
  }
  d.findings = findings.length;
  for (const f of findings) {
    bump(d.byRule, f.ruleId);
    bump(d.bySeverity, `s${f.severity}` as const);
  }
  return d;
}

export function sumDeltas(list: Array<Partial<GenStatsDelta>>): GenStatsDelta {
  const out = emptyDelta();
  for (const d of list) {
    out.sessions += d.sessions ?? 0;
    out.flagged += d.flagged ?? 0;
    out.findings += d.findings ?? 0;
    out.reports += d.reports ?? 0;
    out.llmReviewed += d.llmReviewed ?? 0;
    out.llmCostUsd += d.llmCostUsd ?? 0;
    for (const key of ['byRule', 'byType', 'flaggedByType', 'bySeverity'] as const) {
      const src = (d[key] ?? {}) as Record<string, number>;
      const dst = out[key] as Record<string, number>;
      for (const [k, v] of Object.entries(src)) if (typeof v === 'number') dst[k] = (dst[k] ?? 0) + v;
    }
  }
  return out;
}
