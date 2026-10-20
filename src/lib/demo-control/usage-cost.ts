/**
 * Demo control center — usage → dollars, and the cap checks. Pure (no Firebase, no
 * Next), shared by the panel, its API routes and — later — the demo engines/runner,
 * so every one of them prices and caps the same way.
 *
 * PRICES ARE NOT FACTS IN CODE. The table holds placeholders (null = "not set") that the
 * owner fills in on /admin/demo from the provider's current price page; nothing here
 * hardcodes a real price. A day whose model has no complete price falls back to the
 * engine's own `usdEstimate`, and is reported as unpriced so the panel can say so.
 *
 * Token fields on a usage day (written by the engines):
 *   inputTokens  — uncached input tokens
 *   cachedTokens — input tokens read from the prompt cache
 *   outputTokens — output tokens (thinking included)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** $ per million tokens; null = not filled in yet. */
export interface ModelPrice {
  inputPerMTok: number | null;
  outputPerMTok: number | null;
  cachedPerMTok: number | null;
}

/** model id (as the engines record it in usage.model) → price. */
export type PriceTable = Record<string, ModelPrice>;

/** null = no cap set (never blocks; the panel shows "לא הוגדר"). */
export interface DemoCaps {
  dailyUsdCap: number | null;
  monthlyUsdCap: number | null;
  maxTesterSessionsPerDay: number | null;
  maxLlmCallsPerDay: number | null;
}

export interface DemoConfig {
  caps: DemoCaps;
  prices: PriceTable;
}

/** One writer's share of a day (usage bySource.<source>). */
export interface SourceUsage {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string | null;
  usdEstimate: number | null;
}

export interface UsageDay {
  /** YYYY-MM-DD (Israel day) — the doc id. */
  date: string;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string | null;
  /** The engine's own estimate (its price config at write time). */
  usdEstimate: number | null;
  testerSessions: number;
  firestoreWritesEst: number;
  updatedAtMs: number | null;
  /** Per-writer breakdown (kelly / life / testers …); empty when the writers don't split. */
  bySource: Record<string, SourceUsage>;
}

export const EMPTY_CAPS: DemoCaps = {
  dailyUsdCap: null,
  monthlyUsdCap: null,
  maxTesterSessionsPerDay: null,
  maxLlmCallsPerDay: null,
};

export const EMPTY_PRICE: ModelPrice = { inputPerMTok: null, outputPerMTok: null, cachedPerMTok: null };

/** Limits for values the owner types in (a typo like 15000 instead of 15 is rejected). */
export const CAP_MAX_USD = 10_000;
export const CAP_MAX_COUNT = 100_000;
export const PRICE_MAX_PER_MTOK = 1_000;
export const MAX_PRICED_MODELS = 12;
const MODEL_ID = /^[a-z0-9][a-z0-9._:\-]{0,63}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A cap is "close" from this share of it on. */
export const CAP_WARN_RATIO = 0.8;

// ── Parsing stored docs (lenient: bad fields become 0 / null, never throw) ────────

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

const SOURCE_KEY = /^[a-z][a-z0-9_]{0,31}$/;

function parseSource(raw: unknown): SourceUsage {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    llmCalls: num(d.llmCalls),
    inputTokens: num(d.inputTokens),
    outputTokens: num(d.outputTokens),
    cachedTokens: num(d.cachedTokens),
    model: typeof d.model === 'string' && d.model ? d.model : null,
    usdEstimate: numOrNull(d.usdEstimate),
  };
}

export function parseUsageDay(id: string, raw: Record<string, unknown> | undefined | null): UsageDay {
  const d = raw ?? {};
  const bySource: Record<string, SourceUsage> = {};
  if (d.bySource && typeof d.bySource === 'object') {
    for (const [k, v] of Object.entries(d.bySource as Record<string, unknown>)) {
      if (SOURCE_KEY.test(k)) bySource[k] = parseSource(v);
    }
  }
  return {
    date: id,
    llmCalls: num(d.llmCalls),
    inputTokens: num(d.inputTokens),
    outputTokens: num(d.outputTokens),
    cachedTokens: num(d.cachedTokens),
    model: typeof d.model === 'string' && d.model ? d.model : null,
    usdEstimate: numOrNull(d.usdEstimate),
    testerSessions: num(d.testerSessions),
    firestoreWritesEst: num(d.firestoreWritesEst),
    updatedAtMs: millisOf(d.updatedAt),
    bySource,
  };
}

export function parseCaps(raw: unknown): DemoCaps {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    dailyUsdCap: numOrNull(c.dailyUsdCap),
    monthlyUsdCap: numOrNull(c.monthlyUsdCap),
    maxTesterSessionsPerDay: numOrNull(c.maxTesterSessionsPerDay),
    maxLlmCallsPerDay: numOrNull(c.maxLlmCallsPerDay),
  };
}

export function parsePrices(raw: unknown): PriceTable {
  const out: PriceTable = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [model, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!MODEL_ID.test(model) || !p || typeof p !== 'object') continue;
    const q = p as Record<string, unknown>;
    out[model] = {
      inputPerMTok: numOrNull(q.inputPerMTok),
      outputPerMTok: numOrNull(q.outputPerMTok),
      cachedPerMTok: numOrNull(q.cachedPerMTok),
    };
  }
  return out;
}

export function parseConfig(raw: Record<string, unknown> | undefined | null): DemoConfig {
  return { caps: parseCaps(raw?.caps), prices: parsePrices(raw?.prices) };
}

// ── Validating what the owner saves (strict: reject, don't coerce) ────────────────

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function strictLimit(v: unknown, max: number, field: string): ValidationResult<number | null> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
    return { ok: false, error: `bad_${field}` };
  }
  return { ok: true, value: v };
}

export function validateConfigInput(body: unknown): ValidationResult<DemoConfig> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const b = body as { caps?: unknown; prices?: unknown };
  const capsIn = (b.caps && typeof b.caps === 'object' ? b.caps : {}) as Record<string, unknown>;

  const caps = { ...EMPTY_CAPS };
  const capLimits: Array<[keyof DemoCaps, number]> = [
    ['dailyUsdCap', CAP_MAX_USD],
    ['monthlyUsdCap', CAP_MAX_USD],
    ['maxTesterSessionsPerDay', CAP_MAX_COUNT],
    ['maxLlmCallsPerDay', CAP_MAX_COUNT],
  ];
  for (const [field, max] of capLimits) {
    const r = strictLimit(capsIn[field], max, field);
    if (!r.ok) return r;
    caps[field] = r.value;
  }
  if (caps.dailyUsdCap !== null && caps.monthlyUsdCap !== null && caps.dailyUsdCap > caps.monthlyUsdCap) {
    return { ok: false, error: 'daily_above_monthly' };
  }

  const prices: PriceTable = {};
  if (b.prices !== undefined && b.prices !== null) {
    if (typeof b.prices !== 'object' || Array.isArray(b.prices)) return { ok: false, error: 'bad_prices' };
    const entries = Object.entries(b.prices as Record<string, unknown>);
    if (entries.length > MAX_PRICED_MODELS) return { ok: false, error: 'too_many_models' };
    for (const [model, p] of entries) {
      if (!MODEL_ID.test(model)) return { ok: false, error: 'bad_model_id' };
      const q = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const price: ModelPrice = { ...EMPTY_PRICE };
      for (const field of ['inputPerMTok', 'outputPerMTok', 'cachedPerMTok'] as const) {
        const r = strictLimit(q[field], PRICE_MAX_PER_MTOK, 'price');
        if (!r.ok) return r;
        price[field] = r.value;
      }
      prices[model] = price;
    }
  }
  return { ok: true, value: { caps, prices } };
}

// ── Pricing ───────────────────────────────────────────────────────────────────

type Priceable = Pick<SourceUsage, 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'model'>;

/** Tokens × the owner's price for that model; null when the model or a needed price is missing. */
export function priceFromTokens(part: Priceable, prices: PriceTable): number | null {
  const tokens = part.inputTokens + part.outputTokens + part.cachedTokens;
  if (tokens === 0) return 0;
  if (!part.model) return null;
  const p = prices[part.model];
  if (!p) return null;
  const parts: Array<[number, number | null]> = [
    [part.inputTokens, p.inputPerMTok],
    [part.outputTokens, p.outputPerMTok],
    [part.cachedTokens, p.cachedPerMTok],
  ];
  let usd = 0;
  for (const [count, perMTok] of parts) {
    if (count === 0) continue;
    if (perMTok === null) return null;
    usd += (count / 1_000_000) * perMTok;
  }
  return usd;
}

export type UsdSource = 'priced' | 'engine' | 'unpriced';

/** One part: the owner's table wins; else the writer's estimate; else 0 and flagged unpriced. */
function partUsd(part: Priceable & { usdEstimate: number | null }, prices: PriceTable): { usd: number; source: UsdSource } {
  // No token counts but an estimate (e.g. a writer that reports $ only): use it.
  if (part.inputTokens + part.outputTokens + part.cachedTokens === 0 && part.usdEstimate !== null) {
    return { usd: part.usdEstimate, source: 'engine' };
  }
  const priced = priceFromTokens(part, prices);
  if (priced !== null) return { usd: priced, source: 'priced' };
  if (part.usdEstimate !== null) return { usd: part.usdEstimate, source: 'engine' };
  return { usd: 0, source: 'unpriced' };
}

const WORST: Record<UsdSource, number> = { priced: 0, engine: 1, unpriced: 2 };

/**
 * A day's parts: each bySource entry (priced with its own model) plus the top-level
 * remainder not attributed to any source (priced with the top-level model). A writer that
 * only increments the totals therefore still counts, and nothing is counted twice.
 */
export type DayPart = Priceable & { usdEstimate: number | null; key: string };

export function dayParts(day: UsageDay): DayPart[] {
  const sources = Object.entries(day.bySource);
  const sum = (f: 'inputTokens' | 'outputTokens' | 'cachedTokens') => sources.reduce((a, [, v]) => a + v[f], 0);
  const sumEst = sources.reduce((a, [, v]) => a + (v.usdEstimate ?? 0), 0);
  const rest: DayPart = {
    key: '_rest',
    inputTokens: Math.max(0, day.inputTokens - sum('inputTokens')),
    outputTokens: Math.max(0, day.outputTokens - sum('outputTokens')),
    cachedTokens: Math.max(0, day.cachedTokens - sum('cachedTokens')),
    model: day.model,
    usdEstimate: day.usdEstimate === null ? null : sources.length ? Math.max(0, day.usdEstimate - sumEst) : day.usdEstimate,
  };
  const out: DayPart[] = sources.map(([key, v]) => ({ key, inputTokens: v.inputTokens, outputTokens: v.outputTokens, cachedTokens: v.cachedTokens, model: v.model, usdEstimate: v.usdEstimate }));
  const restHasAnything = rest.inputTokens + rest.outputTokens + rest.cachedTokens > 0 || (rest.usdEstimate ?? 0) > 0;
  if (restHasAnything || out.length === 0) out.push(rest);
  return out;
}

/** Sum of the parts; the day's source is the weakest part's (any estimate ⇒ 'engine'). */
export function dayUsd(day: UsageDay, prices: PriceTable): { usd: number; source: UsdSource } {
  let usd = 0;
  let source: UsdSource = 'priced';
  for (const part of dayParts(day)) {
    const r = partUsd(part, prices);
    usd += r.usd;
    if (r.usd > 0 || part.inputTokens + part.outputTokens + part.cachedTokens > 0) {
      if (WORST[r.source] > WORST[source]) source = r.source;
    }
  }
  return { usd, source };
}

/** $ per source over a set of days (the panel's breakdown); the remainder is '_rest'. */
export function usdBySource(days: UsageDay[], prices: PriceTable): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) {
    for (const part of dayParts(d)) {
      out[part.key] = (out[part.key] ?? 0) + partUsd(part, prices).usd;
    }
  }
  return out;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface UsageTotals {
  usd: number;
  llmCalls: number;
  testerSessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  firestoreWritesEst: number;
}

export interface UsageSummary {
  todayKey: string;
  today: UsageTotals;
  monthToDate: UsageTotals;
  /** Newest first, at most the window that was read. */
  days: Array<UsageDay & { usd: number; usdSource: UsdSource }>;
  /** Models seen in the window that the price table can't price (the panel asks to fill them). */
  unpricedModels: string[];
  /** Any usd in the window came from an engine estimate or is missing. */
  hasEstimates: boolean;
  /** $ per writer (kelly / life / testers; '_rest' = not attributed) — today and month to date. */
  bySourceToday: Record<string, number>;
  bySourceMonth: Record<string, number>;
}

const ZERO: UsageTotals = { usd: 0, llmCalls: 0, testerSessions: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, firestoreWritesEst: 0 };

function add(t: UsageTotals, d: UsageDay, usd: number): UsageTotals {
  return {
    usd: t.usd + usd,
    llmCalls: t.llmCalls + d.llmCalls,
    testerSessions: t.testerSessions + d.testerSessions,
    inputTokens: t.inputTokens + d.inputTokens,
    outputTokens: t.outputTokens + d.outputTokens,
    cachedTokens: t.cachedTokens + d.cachedTokens,
    firestoreWritesEst: t.firestoreWritesEst + d.firestoreWritesEst,
  };
}

/** today = the doc for todayKey; month to date = docs in todayKey's month up to today. */
export function summarizeUsage(days: UsageDay[], todayKey: string, prices: PriceTable): UsageSummary {
  const month = todayKey.slice(0, 7);
  let today = ZERO;
  let monthToDate = ZERO;
  const unpriced = new Set<string>();
  let hasEstimates = false;
  const valid = days.filter((d) => DATE_KEY.test(d.date) && d.date <= todayKey);
  const sorted = [...valid].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const out = sorted.map((d) => {
    const { usd, source } = dayUsd(d, prices);
    if (source !== 'priced' && usd > 0) hasEstimates = true;
    for (const part of dayParts(d)) {
      if (part.inputTokens + part.outputTokens + part.cachedTokens > 0 && priceFromTokens(part, prices) === null) {
        hasEstimates = true;
        if (part.model) unpriced.add(part.model);
      }
    }
    if (d.date === todayKey) today = add(today, d, usd);
    if (d.date.startsWith(month)) monthToDate = add(monthToDate, d, usd);
    return { ...d, usd, usdSource: source };
  });
  return {
    todayKey,
    today,
    monthToDate,
    days: out,
    unpricedModels: Array.from(unpriced).sort(),
    hasEstimates,
    bySourceToday: usdBySource(sorted.filter((d) => d.date === todayKey), prices),
    bySourceMonth: usdBySource(sorted.filter((d) => d.date.startsWith(month)), prices),
  };
}

// ── Caps ──────────────────────────────────────────────────────────────────────

export type CapState = 'unset' | 'ok' | 'warn' | 'exceeded';

export interface CapStatus {
  used: number;
  cap: number | null;
  /** used / cap, null when no cap (or cap 0). */
  ratio: number | null;
  state: CapState;
}

export interface CapReport {
  dailyUsd: CapStatus;
  monthlyUsd: CapStatus;
  testerSessions: CapStatus;
  llmCalls: CapStatus;
  /** Any cap reached → engines stop, the panel refuses a new tester run. */
  anyExceeded: boolean;
  /** Only the caps a tester run would break (money + sessions). */
  blocksTesterRun: boolean;
}

export function capStatus(used: number, cap: number | null): CapStatus {
  if (cap === null) return { used, cap, ratio: null, state: 'unset' };
  // cap 0 = "nothing allowed": exceeded from the start, no meaningful ratio.
  if (cap === 0) return { used, cap, ratio: null, state: 'exceeded' };
  const ratio = used / cap;
  const state: CapState = used >= cap ? 'exceeded' : ratio >= CAP_WARN_RATIO ? 'warn' : 'ok';
  return { used, cap, ratio, state };
}

export function checkCaps(summary: Pick<UsageSummary, 'today' | 'monthToDate'>, caps: DemoCaps): CapReport {
  const dailyUsd = capStatus(summary.today.usd, caps.dailyUsdCap);
  const monthlyUsd = capStatus(summary.monthToDate.usd, caps.monthlyUsdCap);
  const testerSessions = capStatus(summary.today.testerSessions, caps.maxTesterSessionsPerDay);
  const llmCalls = capStatus(summary.today.llmCalls, caps.maxLlmCallsPerDay);
  const all = [dailyUsd, monthlyUsd, testerSessions, llmCalls];
  return {
    dailyUsd,
    monthlyUsd,
    testerSessions,
    llmCalls,
    anyExceeded: all.some((c) => c.state === 'exceeded'),
    blocksTesterRun: [dailyUsd, monthlyUsd, testerSessions].some((c) => c.state === 'exceeded'),
  };
}
