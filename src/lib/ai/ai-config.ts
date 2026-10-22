/**
 * ai-config — app_config/ai (cost controls for every AI call), pure parsing + defaults.
 *
 *   app_config/ai = {
 *     dailyBudgetUsd:   number   // estimated spend cap per Israel day, all users together
 *     killSwitch:       boolean  // true = no AI calls at all, immediately
 *     rateLimitPerHour: number   // per user
 *     rateLimitPerDay:  number   // per user
 *     reviewBudgetUsd:  number   // daily cap for the conversation review agent (0 = review off)
 *     adminAiBudgetUsd: number   // daily cap for the admin-panel assistant's model calls (0 = off)
 *   }
 *
 * A missing document or a missing/invalid field falls back to DEFAULT_AI_CONFIG (these are
 * the values the owner should seed the document with). A failed READ is not handled here —
 * the server-side callers treat it as "AI unavailable" (fail closed).
 */

export interface AiConfig {
  dailyBudgetUsd: number;
  killSwitch: boolean;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  /**
   * Separate daily cap (USD, Israel day) for the AI coach review agent
   * (src/lib/ai/review/). Its spend is ALSO booked in the global ledger, so it counts
   * toward dailyBudgetUsd too. 0 turns the daily review off.
   */
  reviewBudgetUsd: number;
  /**
   * Separate daily cap (USD, Israel day) for the admin-panel AI assistant
   * (src/lib/ai/admin-assistant/), all admins together. Its spend is ALSO booked in the
   * global ledger, so the global kill switch and dailyBudgetUsd stop it too. 0 turns the
   * assistant's model path off (local navigation and quick answers keep working — they
   * never call a model).
   */
  adminAiBudgetUsd: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  dailyBudgetUsd: 5,
  killSwitch: false,
  rateLimitPerHour: 20,
  rateLimitPerDay: 40,
  reviewBudgetUsd: 2,
  adminAiBudgetUsd: 0.5,
};

function nonNegative(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function positiveInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback;
}

export function parseAiConfig(data: Record<string, unknown> | undefined | null): AiConfig {
  const d = data ?? {};
  return {
    dailyBudgetUsd: nonNegative(d.dailyBudgetUsd, DEFAULT_AI_CONFIG.dailyBudgetUsd),
    // Only an explicit boolean counts; anything else keeps the default (off). A malformed
    // value can't silently disable the switch because the default is already "not killed"
    // and an operator flipping it always writes a real boolean from the panel.
    killSwitch: typeof d.killSwitch === 'boolean' ? d.killSwitch : DEFAULT_AI_CONFIG.killSwitch,
    rateLimitPerHour: positiveInt(d.rateLimitPerHour, DEFAULT_AI_CONFIG.rateLimitPerHour),
    rateLimitPerDay: positiveInt(d.rateLimitPerDay, DEFAULT_AI_CONFIG.rateLimitPerDay),
    reviewBudgetUsd: nonNegative(d.reviewBudgetUsd, DEFAULT_AI_CONFIG.reviewBudgetUsd),
    adminAiBudgetUsd: nonNegative(d.adminAiBudgetUsd, DEFAULT_AI_CONFIG.adminAiBudgetUsd),
  };
}
