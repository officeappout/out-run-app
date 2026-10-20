/**
 * Money and session caps for a tester run (design §5.3), enforced IN CODE between every step —
 * not a hint to the model. Prices and caps come from demo_registry/config (the owner fills them
 * on /admin/demo); pricing uses the same function as the panel (src/lib/demo-control/usage-cost.ts).
 *
 * Fail closed: no daily $ cap, or no complete price for the tester model → the run refuses to
 * start (a run whose cost can't be measured can't be capped).
 */
import { capStatus, priceFromTokens, type DemoCaps, type PriceTable } from '@/lib/demo-control/usage-cost';
import { HARD_CAPS } from './config';

/** The usage fields of an Anthropic response (SDK `usage`). */
export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** One model call in the usage-day contract's terms (demo_registry/usage/days/{date}). */
export interface UsageDelta {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
  usd: number;
}

/**
 * Cache WRITES are billed above the input price; the usage contract has no field for them, so
 * they are counted as input tokens priced at 1.25× (folded into inputTokens as ceil(1.25 × n)).
 */
export function toUsageDelta(u: ApiUsage, model: string, prices: PriceTable): UsageDelta {
  const cacheWrite = Math.max(0, u.cache_creation_input_tokens ?? 0);
  const part = {
    inputTokens: Math.max(0, u.input_tokens) + Math.ceil(cacheWrite * 1.25),
    outputTokens: Math.max(0, u.output_tokens),
    cachedTokens: Math.max(0, u.cache_read_input_tokens ?? 0),
    model,
  };
  return { llmCalls: 1, ...part, usd: priceFromTokens(part, prices) ?? 0 };
}

export type RefuseReason =
  | 'cap_not_set'
  | 'price_not_set'
  | 'daily_usd_cap'
  | 'monthly_usd_cap'
  | 'sessions_per_day_cap'
  | 'sessions_per_run_cap'
  | 'steps_per_session_cap'
  | 'session_time_cap';

export type Gate = { ok: true } | { ok: false; reason: RefuseReason };

export function preflight(caps: DemoCaps, prices: PriceTable, model: string): Gate {
  if (caps.dailyUsdCap === null) return { ok: false, reason: 'cap_not_set' };
  const p = prices[model];
  if (!p || p.inputPerMTok === null || p.outputPerMTok === null || p.cachedPerMTok === null) return { ok: false, reason: 'price_not_set' };
  return { ok: true };
}

export interface BudgetStart {
  caps: DemoCaps;
  prices: PriceTable;
  model: string;
  /** $ already spent today / this month by every demo source (from the usage docs at run start). */
  todayUsd: number;
  monthUsd: number;
  sessionsToday: number;
  maxSessionsThisRun: number;
}

export class Budget {
  private runUsd = 0;
  private sessions = 0;
  private readonly s: BudgetStart;

  constructor(start: BudgetStart) {
    this.s = start;
  }

  get spentUsd(): number {
    return this.runUsd;
  }

  get sessionsStarted(): number {
    return this.sessions;
  }

  record(u: ApiUsage): UsageDelta {
    const d = toUsageDelta(u, this.s.model, this.s.prices);
    this.runUsd += d.usd;
    return d;
  }

  /** Money caps (checked before every model call). */
  money(): Gate {
    if (capStatus(this.s.todayUsd + this.runUsd, this.s.caps.dailyUsdCap).state === 'exceeded') return { ok: false, reason: 'daily_usd_cap' };
    if (capStatus(this.s.monthUsd + this.runUsd, this.s.caps.monthlyUsdCap).state === 'exceeded') return { ok: false, reason: 'monthly_usd_cap' };
    return { ok: true };
  }

  /** Before each session: money + sessions/day (panel cap) + sessions/run (hard + mission list). */
  startSession(): Gate {
    const m = this.money();
    if (!m.ok) return m;
    const perRun = Math.min(HARD_CAPS.maxSessionsPerRun, this.s.maxSessionsThisRun);
    if (this.sessions >= perRun) return { ok: false, reason: 'sessions_per_run_cap' };
    if (capStatus(this.s.sessionsToday + this.sessions, this.s.caps.maxTesterSessionsPerDay).state === 'exceeded') return { ok: false, reason: 'sessions_per_day_cap' };
    this.sessions += 1;
    return { ok: true };
  }
}

/** Per-session step / time limits (mission budget, never above the hard caps). */
export function sessionGate(step: number, startedAtMs: number, nowMs: number, budget: { maxSteps: number; maxMinutes: number }): Gate {
  if (step >= Math.min(budget.maxSteps, HARD_CAPS.maxStepsPerSession)) return { ok: false, reason: 'steps_per_session_cap' };
  if (nowMs - startedAtMs >= Math.min(budget.maxMinutes, HARD_CAPS.maxSessionMinutes) * 60_000) return { ok: false, reason: 'session_time_cap' };
  return { ok: true };
}
