/**
 * ai-pricing — model ids + the ONE price table for estimating AI spend (OUT AI Phase 0).
 *
 * Pure, zero imports, so the usage logger, the budget check and tests all read the same
 * numbers. Estimates only: the source of truth for the bill is the Anthropic Console; this
 * exists so the daily budget / kill switch (app_config/ai) can act before the bill arrives.
 *
 * Prices are USD per 1M tokens (Anthropic first-party API rates, checked 18.10.2026):
 *   claude-haiku-5-5   $0.10 in / $0.50 out for prompts ≤100K tokens ($0.50 / $2.50 above),
 *                      cache read = 10% of input.
 *   claude-sonnet-5-5  $2 in / $10 out, cache read $0.20.
 * Cache WRITES (5-minute TTL) bill at 1.25× input — included so a cold cache isn't
 * under-counted.
 *
 * Changing a price or adding a model: edit AI_PRICE_TABLE only.
 */

export type AiModelTier = 'fast' | 'smart';

/** Exact model ids (no date suffixes). Overridable per environment via AI_MODEL_FAST / AI_MODEL_SMART. */
export const AI_MODEL_DEFAULTS: Record<AiModelTier, string> = {
  fast: 'claude-haiku-5-5',
  smart: 'claude-sonnet-5-5',
};

interface PriceRow {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

export interface ModelPrice extends PriceRow {
  /** Higher tier applied when the whole prompt (input + cache read + cache write) exceeds thresholdTokens. */
  longContext?: PriceRow & { thresholdTokens: number };
}

export const AI_PRICE_TABLE: Record<string, ModelPrice> = {
  'claude-haiku-5-5': {
    inputPerM: 0.1,
    outputPerM: 0.5,
    cacheReadPerM: 0.01,
    cacheWritePerM: 0.125,
    longContext: { thresholdTokens: 100_000, inputPerM: 0.5, outputPerM: 2.5, cacheReadPerM: 0.05, cacheWritePerM: 0.625 },
  },
  'claude-sonnet-5-5': {
    inputPerM: 2,
    outputPerM: 10,
    cacheReadPerM: 0.2,
    cacheWritePerM: 2.5,
  },
};

/**
 * A model id missing from the table (an env override nobody priced) is costed at the MOST
 * expensive row — over-estimating spend trips the budget early, under-estimating would let
 * it run past the cap.
 */
const UNKNOWN_MODEL_PRICE: ModelPrice = Object.values(AI_PRICE_TABLE).reduce((max, p) =>
  p.inputPerM + p.outputPerM > max.inputPerM + max.outputPerM ? p : max,
);

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Shape of the SDK's `message.usage` that we read (the cache fields are nullable there). */
export interface SdkUsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageFromSdk(u: SdkUsageLike): AiUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export function priceFor(model: string): ModelPrice {
  return AI_PRICE_TABLE[model] ?? UNKNOWN_MODEL_PRICE;
}

/** Estimated USD cost of one call. */
export function estimateCostUsd(model: string, usage: AiUsage): number {
  const base = priceFor(model);
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const row: PriceRow =
    base.longContext && promptTokens > base.longContext.thresholdTokens ? base.longContext : base;
  return (
    (usage.inputTokens * row.inputPerM +
      usage.outputTokens * row.outputPerM +
      usage.cacheReadTokens * row.cacheReadPerM +
      usage.cacheWriteTokens * row.cacheWritePerM) /
    1_000_000
  );
}
