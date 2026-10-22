/**
 * limits — the admin-panel assistant's cost + size caps (docs/admin/ADMIN-AI-ASSISTANT-PLAN.md
 * §2.4, §2.6). Pure constants and one pure decision, so the route, the turn loop and the tests
 * all read the same numbers. Changing a cap = edit here only.
 */

/** Max model calls for ONE question (tool rounds + the final answer). */
export const ADMIN_AI_MAX_MODEL_CALLS = 3;

/** Estimated spend for ONE question above which no further tool round runs. */
export const ADMIN_AI_PER_QUESTION_CAP_USD = 0.05;

/** max_tokens for a call that may still request a tool (includes thinking). */
export const ADMIN_AI_MAX_TOKENS_TOOL_ROUND = 400;

/** max_tokens for the final answer (includes thinking) — the hard per-call cost ceiling. */
export const ADMIN_AI_MAX_TOKENS_FINAL = 900;

/** One tool result is cut to roughly this many tokens (≈ 4 chars/token) and marked truncated. */
export const ADMIN_AI_TOOL_RESULT_MAX_TOKENS = 800;

/** Turns kept verbatim in the prompt; older ones are folded into a short Haiku summary. */
export const ADMIN_AI_VERBATIM_TURNS = 3;

/** Max length of the stored question in the audit row (characters). */
export const ADMIN_AI_AUDIT_QUESTION_MAX_CHARS = 500;

/** Max length of one incoming question (characters) — longer requests are rejected (400). */
export const ADMIN_AI_QUESTION_MAX_CHARS = 1000;

/** Per-admin rate limits (separate keys from the app users' AI limits). */
export const ADMIN_AI_RATE_LIMIT_PER_HOUR = 30;
export const ADMIN_AI_RATE_LIMIT_PER_DAY = 120;

/** Retention (days) — chats 90, audit 180 (owner decision 22.10.2026). */
export const ADMIN_AI_THREAD_RETENTION_DAYS = 90;
export const ADMIN_AI_AUDIT_RETENTION_DAYS = 180;

export type NextRoundDecision =
  | { allowed: true }
  | { allowed: false; reason: 'max_calls' | 'question_cap' };

/**
 * May the turn loop make ANOTHER model call that is still allowed to use tools?
 * `callsMade` = model calls already made for this question; `spentUsd` = their estimated cost.
 * When not allowed, the loop makes (at most) one last call WITHOUT tools so the model sums up
 * with what it has — and says so — or stops when even that call is over the call budget.
 */
export function nextToolRound(callsMade: number, spentUsd: number): NextRoundDecision {
  // The last allowed call is reserved for the final answer, so tools stop one call earlier.
  if (callsMade >= ADMIN_AI_MAX_MODEL_CALLS - 1) return { allowed: false, reason: 'max_calls' };
  if (spentUsd >= ADMIN_AI_PER_QUESTION_CAP_USD) return { allowed: false, reason: 'question_cap' };
  return { allowed: true };
}
