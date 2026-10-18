/**
 * AI coach review — the panel's flagged-turn list: flatten reviews into one row per issue,
 * then filter / sort. Pure (shared by the API route and the page).
 */
import type {
  IssueCategory,
  IssueStatus,
  ReviewCardSummary,
  ReviewIssue,
  ReviewToolCall,
  RootCause,
} from './review-types';

export interface FlaggedRow {
  /** `${reviewDocId}:${issueId}` */
  key: string;
  reviewDocId: string;
  day: string;
  createdAtMs: number;
  firstName: string;
  score: number | null;
  turnIndex: number;
  userText: string;
  assistantText: string;
  cards: ReviewCardSummary[];
  toolCalls: ReviewToolCall[] | null;
  issue: ReviewIssue;
  status: IssueStatus;
  caseId: string | null;
}

/** The minimum of a stored review the list needs. */
export interface ReviewForList {
  id: string;
  day: string;
  createdAtMs: number;
  firstName: string;
  score: number | null;
  turns: Array<{
    turnIndex: number;
    userText: string;
    assistantText: string;
    cards: ReviewCardSummary[];
    toolCalls: ReviewToolCall[] | null;
  }>;
  issues: ReviewIssue[];
  issueStatus?: Record<string, { status: IssueStatus; caseId?: string } | undefined>;
}

export function flattenFlagged(reviews: ReviewForList[]): FlaggedRow[] {
  const rows: FlaggedRow[] = [];
  for (const r of reviews) {
    for (const issue of r.issues ?? []) {
      const turn = r.turns?.find((t) => t.turnIndex === issue.turnIndex);
      const st = r.issueStatus?.[issue.id];
      rows.push({
        key: `${r.id}:${issue.id}`,
        reviewDocId: r.id,
        day: r.day,
        createdAtMs: r.createdAtMs,
        firstName: r.firstName,
        score: r.score,
        turnIndex: issue.turnIndex,
        userText: turn?.userText ?? '',
        assistantText: turn?.assistantText ?? '',
        cards: turn?.cards ?? [],
        toolCalls: turn?.toolCalls ?? null,
        issue,
        status: st?.status ?? 'open',
        caseId: st?.caseId ?? null,
      });
    }
  }
  return rows;
}

export interface RowFilter {
  category?: IssueCategory | 'all';
  /** Minimum severity (1 = everything). */
  minSeverity?: 1 | 2 | 3;
  rootCause?: RootCause | 'all';
  status?: IssueStatus | 'all' | 'not_fixed';
  source?: 'precheck' | 'llm' | 'all';
}

export function filterRows(rows: FlaggedRow[], f: RowFilter): FlaggedRow[] {
  return rows
    .filter((r) => !f.category || f.category === 'all' || r.issue.category === f.category)
    .filter((r) => !f.minSeverity || r.issue.severity >= f.minSeverity)
    .filter((r) => !f.rootCause || f.rootCause === 'all' || r.issue.likelyRootCause === f.rootCause)
    .filter((r) => {
      if (!f.status || f.status === 'all') return true;
      if (f.status === 'not_fixed') return r.status !== 'fixed';
      return r.status === f.status;
    })
    .filter((r) => !f.source || f.source === 'all' || r.issue.source === f.source)
    .sort((a, b) => b.issue.severity - a.issue.severity || b.createdAtMs - a.createdAtMs || a.key.localeCompare(b.key));
}
