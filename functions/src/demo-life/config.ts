/**
 * The live engine's inputs (pure parsing, no Firebase import). Paths and shapes follow the
 * demo control center contract (src/lib/demo-control/paths.ts, #552):
 *
 *   system_config/feature_flags          enable_demo_users (master), demo_life_llm (text moments)
 *   demo_registry/config                 { caps: { dailyUsdCap, maxLlmCallsPerDay, … }, prices: { model: {inputPerMTok, outputPerMTok, cachedPerMTok} },
 *                                          life?: { model, maxLlmCallsPerDay, maxWorkoutsPerDay, maxMessagesPerDay, maxWritesPerDay } }
 *   demo_registry/control                { locks?: { [uid]: { until | untilMs | expiresAt, by?, runId? } } }  ← tester sessions lock personas
 *   demo_registry/usage/days/{date}      FieldValue.increment on totals AND bySource.life.* (several writers share the doc)
 *   demo_registry/life                   the engine's own state (last tick, live presence, chats answered, groups joined)
 *
 * Every number is lenient (bad → default); a missing doc means "defaults".
 */
export const LIFE_SOURCE = 'life';
export const LIFE_STATE_DOC = 'life';
export const LIFE_FEEDBACK_SUB = 'feedback';
export const FLAGS_DOC = 'system_config/feature_flags';

/** Default small model (owner can override in demo_registry/config.life.model). */
export const DEFAULT_LIFE_MODEL = 'claude-haiku-5-5';

export interface LifeCaps {
  /** Shared cap on the day's total LLM calls (all sources), from config.caps. null = unset. */
  maxLlmCallsPerDayTotal: number | null;
  /** The day's $ cap (all sources), from config.caps. null = unset. */
  dailyUsdCap: number | null;
  /** The life engine's own caps (config.life.*), with safe defaults (design: ≤ 100 LLM calls / day). */
  maxLlmCallsPerDay: number;
  maxWorkoutsPerDay: number;
  maxMessagesPerDay: number;
  maxWritesPerDay: number;
}

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedPerMTok: number;
}

export interface LifeConfig {
  caps: LifeCaps;
  model: string;
  /** Price of `model` when the owner filled all three numbers; else null (usdEstimate not written). */
  price: ModelPrice | null;
}

export const LIFE_DEFAULTS = { maxLlmCallsPerDay: 100, maxWorkoutsPerDay: 80, maxMessagesPerDay: 60, maxWritesPerDay: 4000 } as const;

const MODEL_ID = /^[a-z0-9][a-z0-9._:\-]{0,63}$/;

function pos(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

export function parseFlags(raw: Record<string, unknown> | undefined | null): { enabled: boolean; llm: boolean } {
  const enabled = raw?.enable_demo_users === true;
  return { enabled, llm: enabled && raw?.demo_life_llm === true };
}

export function parseLifeConfig(raw: Record<string, unknown> | undefined | null): LifeConfig {
  const caps = (raw?.caps && typeof raw.caps === 'object' ? raw.caps : {}) as Record<string, unknown>;
  const life = (raw?.life && typeof raw.life === 'object' ? raw.life : {}) as Record<string, unknown>;
  const model = typeof life.model === 'string' && MODEL_ID.test(life.model) ? life.model : DEFAULT_LIFE_MODEL;
  const prices = (raw?.prices && typeof raw.prices === 'object' ? raw.prices : {}) as Record<string, unknown>;
  const p = (prices[model] && typeof prices[model] === 'object' ? prices[model] : {}) as Record<string, unknown>;
  const inP = pos(p.inputPerMTok);
  const outP = pos(p.outputPerMTok);
  const cachedP = pos(p.cachedPerMTok);
  return {
    model,
    price: inP !== null && outP !== null && cachedP !== null ? { inputPerMTok: inP, outputPerMTok: outP, cachedPerMTok: cachedP } : null,
    caps: {
      maxLlmCallsPerDayTotal: pos(caps.maxLlmCallsPerDay),
      dailyUsdCap: pos(caps.dailyUsdCap),
      maxLlmCallsPerDay: pos(life.maxLlmCallsPerDay) ?? LIFE_DEFAULTS.maxLlmCallsPerDay,
      maxWorkoutsPerDay: pos(life.maxWorkoutsPerDay) ?? LIFE_DEFAULTS.maxWorkoutsPerDay,
      maxMessagesPerDay: pos(life.maxMessagesPerDay) ?? LIFE_DEFAULTS.maxMessagesPerDay,
      maxWritesPerDay: pos(life.maxWritesPerDay) ?? LIFE_DEFAULTS.maxWritesPerDay,
    },
  };
}

/** uids locked by an active tester session (lock not yet expired). A lock without an end time counts as active. */
export function lockedUids(control: Record<string, unknown> | undefined | null, nowMs: number): Set<string> {
  const out = new Set<string>();
  const locks = control?.locks;
  if (!locks || typeof locks !== 'object') return out;
  for (const [uid, v] of Object.entries(locks as Record<string, unknown>)) {
    const l = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const until = millisOf(l.until) ?? millisOf(l.untilMs) ?? millisOf(l.expiresAt);
    if (v === true || until === null || until > nowMs) out.add(uid);
  }
  return out;
}

/** What the life engine (and everyone) used so far today, from the shared usage day doc. */
export interface UsageToday {
  llmCallsTotal: number;
  usdTotal: number;
  life: { llmCalls: number; workouts: number; messages: number; writes: number };
}

export function parseUsageToday(raw: Record<string, unknown> | undefined | null): UsageToday {
  const n = (v: unknown) => pos(v) ?? 0;
  const by = (raw?.bySource && typeof raw.bySource === 'object' ? raw.bySource : {}) as Record<string, unknown>;
  const life = (by[LIFE_SOURCE] && typeof by[LIFE_SOURCE] === 'object' ? by[LIFE_SOURCE] : {}) as Record<string, unknown>;
  return {
    llmCallsTotal: n(raw?.llmCalls),
    usdTotal: n(raw?.usdEstimate),
    life: { llmCalls: n(life.llmCalls), workouts: n(life.workouts), messages: n(life.messages), writes: n(life.firestoreWritesEst) },
  };
}

/** May the engine make one more LLM call today? */
export function llmAllowed(caps: LifeCaps, used: UsageToday): boolean {
  if (used.life.llmCalls >= caps.maxLlmCallsPerDay) return false;
  if (caps.maxLlmCallsPerDayTotal !== null && used.llmCallsTotal >= caps.maxLlmCallsPerDayTotal) return false;
  if (caps.dailyUsdCap !== null && used.usdTotal >= caps.dailyUsdCap) return false;
  return true;
}

/** The engine's own state doc (demo_registry/life). */
export interface LifeState {
  lastTickAtMs: number | null;
  lastTickKey: string | null;
  presenceUids: string[];
  /** chatId → lastMessageAt (ms) already answered / seen. */
  chatSeen: Record<string, number>;
  /** uid → demo group ids joined by the engine (on top of the seeded ones). */
  joined: Record<string, string[]>;
}

export function parseLifeState(raw: Record<string, unknown> | undefined | null): LifeState {
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const chatSeen: Record<string, number> = {};
  if (raw?.chatSeen && typeof raw.chatSeen === 'object') {
    for (const [k, v] of Object.entries(raw.chatSeen as Record<string, unknown>)) if (pos(v) !== null) chatSeen[k] = v as number;
  }
  const joined: Record<string, string[]> = {};
  if (raw?.joined && typeof raw.joined === 'object') {
    for (const [k, v] of Object.entries(raw.joined as Record<string, unknown>)) joined[k] = strs(v);
  }
  return {
    lastTickAtMs: millisOf(raw?.lastTickAtMs),
    lastTickKey: typeof raw?.lastTickKey === 'string' ? raw.lastTickKey : null,
    presenceUids: strs(raw?.presenceUids),
    chatSeen,
    joined,
  };
}

/** The engine's estimate of one call's $ (null when the owner has not priced the model). */
export function usdOf(price: ModelPrice | null, t: { inputTokens: number; outputTokens: number; cachedTokens: number }): number | null {
  if (!price) return null;
  return (t.inputTokens * price.inputPerMTok + t.outputTokens * price.outputPerMTok + t.cachedTokens * price.cachedPerMTok) / 1_000_000;
}
