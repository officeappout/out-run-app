/**
 * anthropic.server — the ONE place user-facing AI calls go through (OUT AI Phase 0).
 *
 *   getAnthropicClient()  single client (new Anthropic() reads ANTHROPIC_API_KEY — same as
 *                         the admin transcript service, which is deliberately left as is)
 *   getAiModel(tier)      'fast' | 'smart' → AI_MODEL_FAST / AI_MODEL_SMART env, else defaults
 *   withPromptCaching()   marks the stable system prompt + tools with cache_control
 *   assertAiBudget()      kill switch + daily budget (app_config/ai) — throws AiUnavailableError
 *   checkAiRateLimit()    per-user hour/day limits, fail-CLOSED
 *   recordAiUsage()       per-user-per-day + global-per-day token/cost ledgers
 *   createAiMessage()     messages.create + recordAiUsage in one call
 *
 * No feature calls this yet. A future AI route does:
 *   const auth = await verifyAiRequest(req)   // auth + adult + flags/entitlement + budget + rate limit
 *   if (!auth.ok) return aiDenialResponse(auth)
 *   const msg = await createAiMessage(auth.uid, 'coach_note', { model: getAiModel('fast'), ...withPromptCaching({ system, tools }), messages, max_tokens })
 * For streaming, call getAnthropicClient().messages.stream(...), await .finalMessage(), then
 * recordAiUsage(uid, model, usageFromSdk(final.usage)).
 *
 * Firestore (Admin SDK only — no client rule grants access to these collections):
 *   ai_usage/{uid}_{YYYY-MM-DD}      per user per Israel day
 *   ai_usage_global/{YYYY-MM-DD}     all users per Israel day — read by assertAiBudget
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { getIsraelDateKey } from '@/lib/israelTime';
import { DEFAULT_AI_CONFIG, parseAiConfig, type AiConfig } from './ai-config';
import {
  AI_MODEL_DEFAULTS,
  estimateCostUsd,
  usageFromSdk,
  type AiModelTier,
  type AiUsage,
} from './ai-pricing';

// ─── Client + models ─────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export function getAiModel(tier: AiModelTier): string {
  const fromEnv = tier === 'fast' ? process.env.AI_MODEL_FAST : process.env.AI_MODEL_SMART;
  return fromEnv?.trim() || AI_MODEL_DEFAULTS[tier];
}

// ─── Prompt caching ──────────────────────────────────────────────────────────

/**
 * Puts a cache breakpoint (ephemeral, 5-minute TTL) on the last system block and on the last
 * tool. Render order is tools → system → messages, so everything up to the system prompt is
 * served from cache on the next call. Keep both STABLE: no timestamps, user names or per-user
 * data in `system` — that goes in `messages`, after the breakpoint, or the cache never hits.
 * (Below the model's minimum cacheable prefix length the API just doesn't cache — harmless.)
 */
export function withPromptCaching({
  system,
  tools,
}: {
  system: string | Anthropic.TextBlockParam[];
  tools?: Anthropic.Tool[];
}): { system: Anthropic.TextBlockParam[]; tools?: Anthropic.Tool[] } {
  const blocks: Anthropic.TextBlockParam[] =
    typeof system === 'string' ? [{ type: 'text', text: system }] : system.map((b) => ({ ...b }));
  if (blocks.length > 0) {
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
  }
  if (!tools || tools.length === 0) return { system: blocks };
  const cachedTools = tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t));
  return { system: blocks, tools: cachedTools };
}

// ─── Config, budget, kill switch ─────────────────────────────────────────────

export type AiUnavailableReason = 'kill_switch' | 'over_budget' | 'config_unavailable';

/** Thrown when AI must not be called right now. Routes map it to 503. */
export class AiUnavailableError extends Error {
  readonly reason: AiUnavailableReason;
  constructor(reason: AiUnavailableReason, message?: string) {
    super(message ?? `AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

export const AI_USAGE_COLLECTION = 'ai_usage';
export const AI_USAGE_GLOBAL_COLLECTION = 'ai_usage_global';

/** Israel-day key, 'YYYY-MM-DD' — the budget day matches the owner's day, not UTC. */
export function aiDayKey(now: Date = new Date()): string {
  return getIsraelDateKey(now);
}

/** Reads app_config/ai. Missing doc → defaults. A read ERROR throws (callers fail closed). */
export async function loadAiConfig(db: Firestore = getAdminDb()): Promise<AiConfig> {
  const snap = await db.collection('app_config').doc('ai').get();
  return snap.exists ? parseAiConfig(snap.data()) : { ...DEFAULT_AI_CONFIG };
}

/**
 * Throws AiUnavailableError when the kill switch is on, today's estimated global spend has
 * reached dailyBudgetUsd, or either document can't be read (fail closed — an unreadable
 * budget is treated as no budget). Pass `config` to skip re-reading app_config/ai.
 *
 * The check is "spend so far < budget", so the call that crosses the line still runs: the
 * overshoot is bounded by one call's cost (cents), which is the accepted trade-off for not
 * reserving spend up front.
 */
export async function assertAiBudget(
  db: Firestore = getAdminDb(),
  opts: { config?: AiConfig; now?: Date } = {},
): Promise<void> {
  let config: AiConfig;
  let spentUsd: number;
  try {
    config = opts.config ?? (await loadAiConfig(db));
    if (config.killSwitch) throw new AiUnavailableError('kill_switch');
    const snap = await db.collection(AI_USAGE_GLOBAL_COLLECTION).doc(aiDayKey(opts.now)).get();
    const raw = snap.exists ? snap.data()?.costUsd : 0;
    spentUsd = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    console.error('[ai] budget check failed — failing CLOSED', err);
    throw new AiUnavailableError('config_unavailable');
  }
  if (spentUsd >= config.dailyBudgetUsd) {
    throw new AiUnavailableError(
      'over_budget',
      `AI daily budget reached ($${spentUsd.toFixed(4)} of $${config.dailyBudgetUsd})`,
    );
  }
}

// ─── Per-user rate limit (fail closed) ───────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type AiRateLimitResult = { limited: false } | { limited: true; window: 'hour' | 'day'; retryAfterSec: number };

/**
 * Per-user hour + day windows on the shared Firestore limiter (src/lib/rateLimit.ts), with
 * failClosed: a Firestore error blocks the call instead of allowing it — every AI call costs
 * money, so "can't count" means "don't spend". (The login limiters fail OPEN on purpose; this
 * is the opposite trade-off, opted into per call.) The hour window is checked first and the day
 * window is only consumed when the hour window allowed the call.
 */
export async function checkAiRateLimit(
  uid: string,
  config: Pick<AiConfig, 'rateLimitPerHour' | 'rateLimitPerDay'> = DEFAULT_AI_CONFIG,
  db: Firestore = getAdminDb(),
): Promise<AiRateLimitResult> {
  if (await isRateLimited(db, `ai:uid:${uid}:hour`, { windowMs: HOUR_MS, maxRequests: config.rateLimitPerHour, failClosed: true })) {
    return { limited: true, window: 'hour', retryAfterSec: 3600 };
  }
  if (await isRateLimited(db, `ai:uid:${uid}:day`, { windowMs: DAY_MS, maxRequests: config.rateLimitPerDay, failClosed: true })) {
    return { limited: true, window: 'day', retryAfterSec: 86_400 };
  }
  return { limited: false };
}

// ─── Usage ledger ────────────────────────────────────────────────────────────

/**
 * Adds one call's tokens + estimated cost to ai_usage/{uid}_{day} and ai_usage_global/{day}
 * (one batch, FieldValue.increment — concurrent calls don't lose counts). Never throws: the
 * call has already happened and been paid for, so a ledger failure must not turn the user's
 * answer into an error. It is logged loudly instead, because a missed write under-counts the
 * budget.
 */
export async function recordAiUsage(
  uid: string,
  model: string,
  usage: AiUsage,
  opts: { feature?: string; now?: Date; db?: Firestore } = {},
): Promise<{ costUsd: number }> {
  const costUsd = estimateCostUsd(model, usage);
  try {
    const db = opts.db ?? getAdminDb();
    const day = aiDayKey(opts.now);
    const inc = {
      calls: FieldValue.increment(1),
      inputTokens: FieldValue.increment(usage.inputTokens),
      outputTokens: FieldValue.increment(usage.outputTokens),
      cacheReadTokens: FieldValue.increment(usage.cacheReadTokens),
      cacheWriteTokens: FieldValue.increment(usage.cacheWriteTokens),
      costUsd: FieldValue.increment(costUsd),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.set(
      db.collection(AI_USAGE_COLLECTION).doc(`${uid}_${day}`),
      { uid, day, ...inc, ...(opts.feature ? { byFeature: { [opts.feature]: FieldValue.increment(1) } } : {}) },
      { merge: true },
    );
    batch.set(db.collection(AI_USAGE_GLOBAL_COLLECTION).doc(day), { day, ...inc }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error(`[ai] usage ledger write FAILED (model=${model}, est $${costUsd.toFixed(6)}) — budget under-counted`, err);
  }
  return { costUsd };
}

/**
 * messages.create + usage logging. Does NOT check budget / rate limit / entitlement — that is
 * verifyAiRequest's job, once per request, before any call.
 */
export async function createAiMessage(
  uid: string,
  feature: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const message = await getAnthropicClient().messages.create(params);
  await recordAiUsage(uid, params.model, usageFromSdk(message.usage), { feature });
  return message;
}
