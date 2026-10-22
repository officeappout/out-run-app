/**
 * Why the admin assistant can't call a model right now. Every reason maps to 503 except
 * `flag_off` (403) and `rate_limited` (429). Kept separate from AiUnavailableError so the app's
 * AI denial codes (verify-ai-request) don't change shape.
 */
export type AdminAiUnavailableReason =
  | 'flag_off'
  | 'admin_key_missing'
  | 'unpriced_model'
  | 'kill_switch'
  | 'over_budget'
  | 'admin_over_budget'
  | 'config_unavailable'
  | 'rate_limited';

export class AdminAiUnavailableError extends Error {
  readonly reason: AdminAiUnavailableReason;
  readonly retryAfterSec?: number;
  constructor(reason: AdminAiUnavailableReason, opts: { message?: string; retryAfterSec?: number } = {}) {
    super(opts.message ?? `Admin AI unavailable: ${reason}`);
    this.name = 'AdminAiUnavailableError';
    this.reason = reason;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export function adminAiStatusOf(reason: AdminAiUnavailableReason): 403 | 429 | 503 {
  if (reason === 'flag_off') return 403;
  if (reason === 'rate_limited') return 429;
  return 503;
}

/** Short Hebrew line the drawer shows for each reason (no internals, no key names). */
export const ADMIN_AI_UNAVAILABLE_HE: Record<AdminAiUnavailableReason, string> = {
  flag_off: 'העוזר כבוי כרגע.',
  admin_key_missing: 'העוזר עוד לא הוגדר (חסר מפתח).',
  unpriced_model: 'המודל שהוגדר לעוזר אינו מתומחר — העוזר לא יפעל עד שיתומחר.',
  kill_switch: 'כל קריאות ה-AI כבויות כרגע (מתג כיבוי).',
  over_budget: 'תקציב ה-AI היומי נגמר.',
  admin_over_budget: 'התקציב היומי של העוזר נגמר. ניווט ותשובות מהירות ממשיכים לעבוד.',
  config_unavailable: 'לא הצלחנו לבדוק את התקציב, לכן לא שולחים למודל.',
  rate_limited: 'יותר מדי שאלות בזמן קצר. נסה שוב בעוד כמה דקות.',
};
