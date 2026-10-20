import { describe, expect, it } from 'vitest';
import {
  capStatus,
  checkCaps,
  dayUsd,
  EMPTY_CAPS,
  parseCaps,
  parseConfig,
  parsePrices,
  parseUsageDay,
  priceFromTokens,
  summarizeUsage,
  validateConfigInput,
  type PriceTable,
  type UsageDay,
} from '../usage-cost';

// Placeholder prices for arithmetic only — NOT real provider prices.
const PRICES: PriceTable = {
  'model-a': { inputPerMTok: 2, outputPerMTok: 10, cachedPerMTok: 0.5 },
  'model-b': { inputPerMTok: 1, outputPerMTok: null, cachedPerMTok: null },
};

const day = (date: string, extra: Partial<UsageDay> = {}): UsageDay => ({
  ...parseUsageDay(date, {}),
  ...extra,
});

describe('parseUsageDay', () => {
  it('coerces bad fields to 0 / null and reads Timestamp-like updatedAt', () => {
    const d = parseUsageDay('2026-10-20', {
      llmCalls: 3,
      inputTokens: -5,
      outputTokens: 'x',
      cachedTokens: Number.NaN,
      model: '',
      usdEstimate: 0.25,
      testerSessions: 2,
      updatedAt: { toMillis: () => 123 },
    });
    expect(d).toMatchObject({ llmCalls: 3, inputTokens: 0, outputTokens: 0, cachedTokens: 0, model: null, usdEstimate: 0.25, testerSessions: 2, updatedAtMs: 123 });
  });
  it('handles a missing doc', () => {
    expect(parseUsageDay('2026-10-20', undefined).usdEstimate).toBeNull();
  });
});

describe('pricing', () => {
  it('prices input + output + cached per million tokens', () => {
    const d = day('2026-10-20', { model: 'model-a', inputTokens: 1_000_000, outputTokens: 100_000, cachedTokens: 2_000_000 });
    expect(priceFromTokens(d, PRICES)).toBeCloseTo(2 + 1 + 1, 10);
  });
  it('returns 0 for a day without tokens, null for an unknown model or a missing needed price', () => {
    expect(priceFromTokens(day('2026-10-20'), PRICES)).toBe(0);
    expect(priceFromTokens(day('2026-10-20', { model: 'nope', inputTokens: 5 }), PRICES)).toBeNull();
    expect(priceFromTokens(day('2026-10-20', { model: 'model-b', outputTokens: 5 }), PRICES)).toBeNull();
    // a missing price for a token kind that was not used doesn't matter
    expect(priceFromTokens(day('2026-10-20', { model: 'model-b', inputTokens: 1_000_000 }), PRICES)).toBe(1);
  });
  it('dayUsd: table wins, else the engine estimate, else unpriced', () => {
    expect(dayUsd(day('d', { model: 'model-b', inputTokens: 1_000_000, usdEstimate: 9 }), PRICES)).toEqual({ usd: 1, source: 'priced' });
    expect(dayUsd(day('d', { model: 'nope', inputTokens: 5, usdEstimate: 0.3 }), PRICES)).toEqual({ usd: 0.3, source: 'engine' });
    expect(dayUsd(day('d', { model: 'nope', inputTokens: 5 }), PRICES)).toEqual({ usd: 0, source: 'unpriced' });
  });
});

describe('summarizeUsage', () => {
  const days = [
    day('2026-10-20', { model: 'model-a', inputTokens: 1_000_000, llmCalls: 10, testerSessions: 2 }),
    day('2026-10-19', { model: 'nope', inputTokens: 10, usdEstimate: 0.5, llmCalls: 1 }),
    day('2026-10-01', { model: 'model-a', outputTokens: 100_000 }),
    day('2026-09-30', { model: 'model-a', outputTokens: 1_000_000 }), // previous month
    day('2026-10-21', { usdEstimate: 99 }), // future (clock skew) — ignored
    day('bad-id', { usdEstimate: 99 }), // not a date — ignored
  ];
  const s = summarizeUsage(days, '2026-10-20', PRICES);
  it('today and month to date', () => {
    expect(s.today.usd).toBeCloseTo(2, 10);
    expect(s.today.llmCalls).toBe(10);
    expect(s.today.testerSessions).toBe(2);
    expect(s.monthToDate.usd).toBeCloseTo(2 + 0.5 + 1, 10);
    expect(s.monthToDate.llmCalls).toBe(11);
  });
  it('lists days newest first, flags unpriced models', () => {
    expect(s.days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-19', '2026-10-01', '2026-09-30']);
    expect(s.unpricedModels).toEqual(['nope']);
    expect(s.hasEstimates).toBe(true);
  });
  it('a quiet day with no doc is just zero', () => {
    expect(summarizeUsage([], '2026-10-20', PRICES).today.usd).toBe(0);
  });
});

describe('caps', () => {
  it('capStatus states', () => {
    expect(capStatus(5, null)).toEqual({ used: 5, cap: null, ratio: null, state: 'unset' });
    expect(capStatus(5, 10).state).toBe('ok');
    expect(capStatus(8, 10).state).toBe('warn');
    expect(capStatus(10, 10).state).toBe('exceeded');
    expect(capStatus(0, 0)).toEqual({ used: 0, cap: 0, ratio: null, state: 'exceeded' });
  });
  it('checkCaps — money and sessions block a tester run, AI calls alone do not', () => {
    const summary = summarizeUsage([day('2026-10-20', { usdEstimate: 3, llmCalls: 50, testerSessions: 1 })], '2026-10-20', {});
    const free = checkCaps(summary, EMPTY_CAPS);
    expect(free.anyExceeded).toBe(false);
    expect(free.blocksTesterRun).toBe(false);
    const callsOnly = checkCaps(summary, { ...EMPTY_CAPS, maxLlmCallsPerDay: 50 });
    expect(callsOnly.anyExceeded).toBe(true);
    expect(callsOnly.blocksTesterRun).toBe(false);
    expect(checkCaps(summary, { ...EMPTY_CAPS, dailyUsdCap: 3 }).blocksTesterRun).toBe(true);
    expect(checkCaps(summary, { ...EMPTY_CAPS, monthlyUsdCap: 2 }).blocksTesterRun).toBe(true);
    expect(checkCaps(summary, { ...EMPTY_CAPS, maxTesterSessionsPerDay: 1 }).blocksTesterRun).toBe(true);
  });
});

describe('config parsing / validation', () => {
  it('parse is lenient and drops bad models', () => {
    expect(parseCaps({ dailyUsdCap: 15, monthlyUsdCap: 'x' })).toEqual({ ...EMPTY_CAPS, dailyUsdCap: 15 });
    expect(parsePrices({ 'Bad Id': {}, 'model-a': { inputPerMTok: 1 } })).toEqual({ 'model-a': { inputPerMTok: 1, outputPerMTok: null, cachedPerMTok: null } });
    expect(parseConfig(undefined)).toEqual({ caps: EMPTY_CAPS, prices: {} });
  });
  it('validate accepts empty → null and a full table', () => {
    const r = validateConfigInput({ caps: { dailyUsdCap: 15, monthlyUsdCap: 150, maxTesterSessionsPerDay: '', maxLlmCallsPerDay: null }, prices: { 'model-a': { inputPerMTok: 1, outputPerMTok: 5, cachedPerMTok: null } } });
    expect(r).toEqual({ ok: true, value: { caps: { dailyUsdCap: 15, monthlyUsdCap: 150, maxTesterSessionsPerDay: null, maxLlmCallsPerDay: null }, prices: { 'model-a': { inputPerMTok: 1, outputPerMTok: 5, cachedPerMTok: null } } } });
  });
  it('validate rejects bad input', () => {
    expect(validateConfigInput(null)).toEqual({ ok: false, error: 'bad_request' });
    expect(validateConfigInput({ caps: { dailyUsdCap: -1 } })).toEqual({ ok: false, error: 'bad_dailyUsdCap' });
    expect(validateConfigInput({ caps: { monthlyUsdCap: 15000 } })).toEqual({ ok: false, error: 'bad_monthlyUsdCap' });
    expect(validateConfigInput({ caps: { dailyUsdCap: '15' } })).toEqual({ ok: false, error: 'bad_dailyUsdCap' });
    expect(validateConfigInput({ caps: { dailyUsdCap: 20, monthlyUsdCap: 10 } })).toEqual({ ok: false, error: 'daily_above_monthly' });
    expect(validateConfigInput({ caps: {}, prices: { 'Bad Id': {} } })).toEqual({ ok: false, error: 'bad_model_id' });
    expect(validateConfigInput({ caps: {}, prices: { m: { inputPerMTok: 5000 } } })).toEqual({ ok: false, error: 'bad_price' });
    expect(validateConfigInput({ caps: {}, prices: [] })).toEqual({ ok: false, error: 'bad_prices' });
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`m${i}`, {}]));
    expect(validateConfigInput({ caps: {}, prices: many })).toEqual({ ok: false, error: 'too_many_models' });
  });
});
