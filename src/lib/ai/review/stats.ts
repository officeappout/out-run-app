/**
 * AI coach review — daily counters (ai_coach_review_stats/{day}) and the panel's summary.
 * Pure: the server turns a StatsDelta into FieldValue.increment writes; the panel sums days.
 */
import { ISSUE_CATEGORIES, ROOT_CAUSES, type IssueCategory, type ReviewDoc, type RootCause } from './review-types';

export interface StatsDelta {
  reviews: number;
  turns: number;
  issues: number;
  flaggedTurns: number;
  scoreSum: number;
  scoreCount: number;
  costUsd: number;
  graderErrors: number;
  byCategory: Partial<Record<IssueCategory, number>>;
  byRootCause: Partial<Record<RootCause, number>>;
  bySeverity: Partial<Record<'1' | '2' | '3', number>>;
  /** Kelly phase 2 (ai_coach_phase2): question topics. Absent while the flag is off. */
  byTopic?: Partial<Record<string, number>>;
}

export function emptyDelta(): StatsDelta {
  return {
    reviews: 0,
    turns: 0,
    issues: 0,
    flaggedTurns: 0,
    scoreSum: 0,
    scoreCount: 0,
    costUsd: 0,
    graderErrors: 0,
    byCategory: {},
    byRootCause: {},
    bySeverity: {},
  };
}

const bump = <K extends string>(m: Partial<Record<K, number>>, k: K, n = 1) => {
  m[k] = (m[k] ?? 0) + n;
};

/** What one stored review adds to its day. */
export function deltaForReview(r: Pick<ReviewDoc, 'turns' | 'issues' | 'score' | 'costUsd' | 'graderError'> & Pick<Partial<ReviewDoc>, 'topics'>): StatsDelta {
  const d = emptyDelta();
  d.reviews = 1;
  d.turns = r.turns.length;
  d.issues = r.issues.length;
  d.flaggedTurns = new Set(r.issues.map((i) => i.turnIndex)).size;
  if (typeof r.score === 'number') {
    d.scoreSum = r.score;
    d.scoreCount = 1;
  }
  d.costUsd = r.costUsd;
  d.graderErrors = r.graderError ? 1 : 0;
  for (const i of r.issues) {
    bump(d.byCategory, i.category);
    bump(d.byRootCause, i.likelyRootCause);
    bump(d.bySeverity, String(i.severity) as '1' | '2' | '3');
  }
  if (r.topics) {
    d.byTopic = {};
    for (const t of r.topics) bump(d.byTopic, t.topic);
  }
  return d;
}

/** Sums deltas (or stored day docs, which have the same shape). Unknown keys are ignored. */
export function sumDeltas(rows: Array<Partial<StatsDelta> | null | undefined>): StatsDelta {
  const out = emptyDelta();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const r of rows) {
    if (!r) continue;
    out.reviews += num(r.reviews);
    out.turns += num(r.turns);
    out.issues += num(r.issues);
    out.flaggedTurns += num(r.flaggedTurns);
    out.scoreSum += num(r.scoreSum);
    out.scoreCount += num(r.scoreCount);
    out.costUsd += num(r.costUsd);
    out.graderErrors += num(r.graderErrors);
    for (const c of ISSUE_CATEGORIES) if (num(r.byCategory?.[c])) bump(out.byCategory, c, num(r.byCategory?.[c]));
    for (const c of ROOT_CAUSES) if (num(r.byRootCause?.[c])) bump(out.byRootCause, c, num(r.byRootCause?.[c]));
    for (const s of ['1', '2', '3'] as const) if (num(r.bySeverity?.[s])) bump(out.bySeverity, s, num(r.bySeverity?.[s]));
    if (r.byTopic && typeof r.byTopic === 'object') {
      out.byTopic ??= {};
      for (const [k, v] of Object.entries(r.byTopic)) if (num(v)) bump(out.byTopic, k, num(v));
    }
  }
  return out;
}

export function averageScore(d: Pick<StatsDelta, 'scoreSum' | 'scoreCount'>): number | null {
  return d.scoreCount > 0 ? Math.round((d.scoreSum / d.scoreCount) * 100) / 100 : null;
}

/** Largest first, zeros dropped, ties by name for a stable order. */
export function topEntries<K extends string>(m: Partial<Record<K, number>>, n = 5): Array<{ key: K; count: number }> {
  return (Object.entries(m) as Array<[K, number]>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

export interface DayPoint {
  day: string;
  avgScore: number | null;
  reviews: number;
  issues: number;
  costUsd: number;
}

/** Day docs → an oldest-first trend for the chart. */
export function trend(days: Array<{ day: string } & Partial<StatsDelta>>): DayPoint[] {
  return [...days]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => {
      const s = sumDeltas([d]);
      return { day: d.day, avgScore: averageScore(s), reviews: s.reviews, issues: s.issues, costUsd: Math.round(s.costUsd * 10000) / 10000 };
    });
}
