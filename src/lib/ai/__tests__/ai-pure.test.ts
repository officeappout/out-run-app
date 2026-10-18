import { describe, it, expect } from 'vitest';
import { canUseAi, isAiEntitlementActive } from '../ai-entitlement';
import { AI_PRICE_TABLE, estimateCostUsd, usageFromSdk, priceFor } from '../ai-pricing';
import { DEFAULT_AI_CONFIG, parseAiConfig } from '../ai-config';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const NOW = Date.UTC(2026, 9, 18, 12);
const on = { aiCoachEnabled: true, aiCoachFreeForAll: false };

describe('canUseAi', () => {
  it('is false whenever the master flag is off — even free-for-all or a paid entitlement', () => {
    expect(canUseAi({ flags: { aiCoachEnabled: false, aiCoachFreeForAll: true }, entitlement: null, now: NOW })).toBe(false);
    expect(
      canUseAi({
        flags: { aiCoachEnabled: false, aiCoachFreeForAll: false },
        entitlement: { aiCoach: { active: true, source: 'paid' } },
        now: NOW,
      }),
    ).toBe(false);
  });

  it('free-for-all lets anyone through when enabled, entitlement or not', () => {
    expect(canUseAi({ flags: { aiCoachEnabled: true, aiCoachFreeForAll: true }, entitlement: null, now: NOW })).toBe(true);
  });

  it('without free-for-all, needs an active entitlement', () => {
    expect(canUseAi({ flags: on, entitlement: null, now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: {}, now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: { aiCoach: { active: false, source: 'paid' } }, now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: { aiCoach: { active: true, source: 'authority' } }, now: NOW })).toBe(true);
  });

  it('respects `until` (Timestamp-like, Date, or ms) and fails closed on garbage', () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    const ent = (until: unknown) => ({ aiCoach: { active: true, source: 'paid' as const, until: until as any } });
    expect(canUseAi({ flags: on, entitlement: ent(ts(NOW + 1000)), now: NOW })).toBe(true);
    expect(canUseAi({ flags: on, entitlement: ent(ts(NOW - 1)), now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: ent(ts(NOW)), now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: ent(new Date(NOW + 1000)), now: NOW })).toBe(true);
    expect(canUseAi({ flags: on, entitlement: ent(NOW - 5), now: NOW })).toBe(false);
    expect(canUseAi({ flags: on, entitlement: ent(null), now: NOW })).toBe(true);
    expect(canUseAi({ flags: on, entitlement: ent('2027-01-01'), now: NOW })).toBe(false);
  });

  it('a truthy-but-not-true `active` does not count', () => {
    expect(isAiEntitlementActive({ aiCoach: { active: 'yes' as any, source: 'paid' } }, NOW)).toBe(false);
  });
});

describe('estimateCostUsd', () => {
  it('haiku-5-5: $0.10 / $0.50 per M, cache read at 10% of input', () => {
    const cost = estimateCostUsd('claude-haiku-5-5', {
      inputTokens: 50_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0,
    });
    expect(cost).toBeCloseTo(0.005 + 0.5, 10);
    expect(AI_PRICE_TABLE['claude-haiku-5-5'].cacheReadPerM).toBeCloseTo(AI_PRICE_TABLE['claude-haiku-5-5'].inputPerM * 0.1, 10);
    expect(
      estimateCostUsd('claude-haiku-5-5', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 50_000, cacheWriteTokens: 0 }),
    ).toBeCloseTo(0.0005, 10);
  });

  it('haiku-5-5 switches to the long-context rate above a 100K-token prompt', () => {
    const at = estimateCostUsd('claude-haiku-5-5', { inputTokens: 100_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const over = estimateCostUsd('claude-haiku-5-5', { inputTokens: 100_001, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(at).toBeCloseTo(0.01, 10);
    expect(over).toBeCloseTo((100_001 * 0.5) / 1e6, 10);
  });

  it('sonnet-5-5: $2 / $10 per M, cache read $0.20', () => {
    expect(
      estimateCostUsd('claude-sonnet-5-5', { inputTokens: 2000, outputTokens: 500, cacheReadTokens: 10_000, cacheWriteTokens: 0 }),
    ).toBeCloseTo((2000 * 2 + 500 * 10 + 10_000 * 0.2) / 1e6, 12);
  });

  it('cache writes are costed at 1.25× input', () => {
    expect(
      estimateCostUsd('claude-sonnet-5-5', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 }),
    ).toBeCloseTo(2.5, 10);
  });

  it('an unknown model is costed at the most expensive row (never under-counts)', () => {
    expect(priceFor('claude-something-new')).toBe(AI_PRICE_TABLE['claude-sonnet-5-5']);
  });

  it('usageFromSdk maps nullable cache fields to 0', () => {
    expect(
      usageFromSdk({ input_tokens: 10, output_tokens: 3, cache_read_input_tokens: null, cache_creation_input_tokens: undefined }),
    ).toEqual({ inputTokens: 10, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe('parseAiConfig', () => {
  it('missing doc → defaults (20/hour, 40/day)', () => {
    expect(parseAiConfig(undefined)).toEqual(DEFAULT_AI_CONFIG);
    expect(DEFAULT_AI_CONFIG.rateLimitPerHour).toBe(20);
    expect(DEFAULT_AI_CONFIG.rateLimitPerDay).toBe(40);
  });

  it('reads valid fields and ignores invalid ones', () => {
    expect(
      parseAiConfig({ dailyBudgetUsd: 12.5, killSwitch: true, rateLimitPerHour: 5, rateLimitPerDay: 'lots' }),
    ).toEqual({ dailyBudgetUsd: 12.5, killSwitch: true, rateLimitPerHour: 5, rateLimitPerDay: 40 });
    expect(parseAiConfig({ dailyBudgetUsd: -1, rateLimitPerHour: 0 }).dailyBudgetUsd).toBe(DEFAULT_AI_CONFIG.dailyBudgetUsd);
    expect(parseAiConfig({ dailyBudgetUsd: 0 }).dailyBudgetUsd).toBe(0);
  });
});

describe('AI flag defaults (fail closed)', () => {
  it('aiCoachEnabled and aiCoachFreeForAll both default to false, super admin override too', () => {
    for (const key of ['aiCoachEnabled', 'aiCoachFreeForAll']) {
      const d = FLAG_DEFS.find((f) => f.key === key)!;
      expect(d.defaultValue).toBe(false);
      expect(d.superAdminValue).toBe(false);
    }
  });
});
