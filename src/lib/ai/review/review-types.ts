/**
 * AI coach review — shared vocabulary for the daily conversation review agent. Pure.
 *
 *   ai_coach_reviews/{uid}_{reviewId}   one reviewed batch of new turns of one thread
 *   ai_coach_review_stats/{day}         daily counters (Israel day) by category / root cause
 *   ai_coach_review_cursors/{uid}       { reviewedUntil } — how far the thread was reviewed
 *   ai_coach_eval_cases/{id}            regression cases converted from flagged turns
 *
 * All four are server-only (Admin SDK); the panel reads them through super-admin API routes.
 * Nothing here ever changes the coach itself: the reviewer PROPOSES fixes, a human applies
 * them (prompt / tool mapping / generator / content) in a normal PR, and the regression case
 * keeps the bug from coming back (scripts/ai-coach-evals.ts).
 */
import { z } from 'zod';

export const AI_COACH_REVIEWS = 'ai_coach_reviews';
export const AI_COACH_REVIEW_STATS = 'ai_coach_review_stats';
export const AI_COACH_REVIEW_CURSORS = 'ai_coach_review_cursors';
export const AI_COACH_EVAL_CASES = 'ai_coach_eval_cases';

/** Reviews (and their transcript excerpts) expire 90 days after creation (TTL on expireAt). */
export const AI_REVIEW_RETENTION_DAYS = 90;
/** Hard cap of threads reviewed per daily run. */
export const AI_REVIEW_MAX_THREADS_PER_RUN = 200;
/** At most this many new messages of one thread go into one review (oldest first). */
export const AI_REVIEW_MAX_MESSAGES_PER_THREAD = 40;
/** The `feature` tag on the AI usage ledger. */
export const AI_REVIEW_FEATURE = 'ai_coach_review';
/** The ledger "uid" the review spend is booked under (no real user). */
export const AI_REVIEW_LEDGER_UID = '_system_ai_coach_review';

export const ISSUE_CATEGORIES = [
  'hallucination',
  'request_mismatch',
  'wrong_location_or_gear',
  'wrong_domain',
  'too_few_exercises',
  'safety_overtrigger',
  'safety_miss',
  'tone_gender',
  'language_english',
  'title_mismatch',
  'tool_error',
  'unhelpful',
  'other',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ROOT_CAUSES = ['prompt', 'tool_mapping', 'generator', 'content', 'ui', 'unknown'] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export const SEVERITIES = [1, 2, 3] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORY_LABEL_HE: Record<IssueCategory, string> = {
  hallucination: 'המצאה',
  request_mismatch: 'לא מה שביקשו',
  wrong_location_or_gear: 'מיקום / ציוד שגוי',
  wrong_domain: 'אזור גוף שגוי',
  too_few_exercises: 'מעט מדי תרגילים',
  safety_overtrigger: 'תגובת בטיחות מיותרת',
  safety_miss: 'פספוס בטיחות',
  tone_gender: 'טון / מגדר',
  language_english: 'אנגלית בתשובה',
  title_mismatch: 'כותרת לא תואמת',
  tool_error: 'שגיאת כלי',
  unhelpful: 'לא מועיל',
  other: 'אחר',
};

export const ROOT_CAUSE_LABEL_HE: Record<RootCause, string> = {
  prompt: 'פרומפט',
  tool_mapping: 'מיפוי לכלי',
  generator: 'מחולל האימונים',
  content: 'תוכן / נתונים',
  ui: 'ממשק',
  unknown: 'לא ידוע',
};

// ─── Grader output (the model's JSON) ────────────────────────────────────────

export const GraderIssueSchema = z.object({
  turnIndex: z.number().int().min(0),
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  evidence: z.string().max(600),
  expected: z.string().max(600),
  likelyRootCause: z.enum(ROOT_CAUSES),
  suggestedFix: z.string().max(800),
});
export type GraderIssue = z.infer<typeof GraderIssueSchema>;

export const GraderOutputSchema = z.object({
  issues: z.array(GraderIssueSchema).max(40),
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  summary: z.string().max(300),
});
export type GraderOutput = z.infer<typeof GraderOutputSchema>;

/**
 * The same shape as a JSON schema for output_config.format (structured outputs). Only the
 * features structured outputs supports: enums instead of numeric ranges, no length limits,
 * additionalProperties:false on every object. zod (above) re-validates the lengths/ranges.
 */
export const GRADER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['issues', 'score', 'summary'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['turnIndex', 'category', 'severity', 'evidence', 'expected', 'likelyRootCause', 'suggestedFix'],
        properties: {
          turnIndex: { type: 'integer', description: 'Index of the turn ([turn N]) the issue is in' },
          category: { type: 'string', enum: [...ISSUE_CATEGORIES] },
          severity: { type: 'integer', enum: [...SEVERITIES], description: '1 minor, 2 clear mistake, 3 harmful or badly wrong' },
          evidence: { type: 'string', description: 'Exact quote from the transcript (as written)' },
          expected: { type: 'string', description: 'In simple Hebrew: what a good coach reply or action would have been (tool names may stay as code identifiers)' },
          likelyRootCause: { type: 'string', enum: [...ROOT_CAUSES] },
          suggestedFix: { type: 'string', description: 'In simple Hebrew: one concrete change for a developer to make (file, tool and field names may stay as code identifiers)' },
        },
      },
    },
    score: { type: 'integer', enum: [1, 2, 3, 4, 5], description: 'Overall quality of these turns, 5 = flawless' },
    summary: { type: 'string', description: 'One short line in simple Hebrew' },
  },
};

export type ParsedGrader = { ok: true; output: GraderOutput } | { ok: false; error: string };

/** JSON text → validated grader output. Issues pointing at turns that don't exist are dropped. */
export function parseGraderOutput(text: string, turnCount: number): ParsedGrader {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  const parsed = GraderOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `schema: ${msg}` };
  }
  return {
    ok: true,
    output: { ...parsed.data, issues: parsed.data.issues.filter((i) => i.turnIndex < turnCount) },
  };
}

// ─── Stored review ───────────────────────────────────────────────────────────

export type IssueSource = 'precheck' | 'llm';
export type IssueStatus = 'open' | 'fixed' | 'converted';

export interface ReviewIssue extends GraderIssue {
  /** Stable within the review doc: `${source}-${n}`. */
  id: string;
  source: IssueSource;
}

export interface ReviewToolCall {
  name: string;
  input: unknown;
  resultSummary: unknown;
}

export interface ReviewCardSummary {
  workoutId: string;
  title: string;
  minutes: number;
  exerciseCount: number;
  location: string;
  /** Decision-record reason codes when stored (e.g. LEVEL_CEILING). */
  reasonCodes: string[];
}

/** One user message + Kelly's reply (the unit everything is indexed by). */
export interface ReviewTurn {
  turnIndex: number;
  userMessageId: string | null;
  assistantMessageId: string | null;
  userText: string;
  assistantText: string;
  createdAtMs: number;
  cards: ReviewCardSummary[];
  /** From the assistant message's `log` (fix/ai-coach-quality-round1). null = no log stored. */
  toolCalls: ReviewToolCall[] | null;
  guards: Array<{ type: string; action: string }>;
  model: string | null;
}

export interface ReviewDoc {
  uid: string;
  reviewId: string;
  /** Israel day the review ran. */
  day: string;
  firstName: string;
  turns: ReviewTurn[];
  issues: ReviewIssue[];
  /** issueId → status (absent = open). */
  issueStatus: Record<string, { status: IssueStatus; at: number; caseId?: string }>;
  score: number | null;
  summary: string;
  graderError: string | null;
  model: string | null;
  costUsd: number;
  coveredFromMs: number;
  coveredUntilMs: number;
  createdAtMs: number;
}
