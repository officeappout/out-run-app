/**
 * budget.server — may the assistant spend money on a model call right now, and booking it.
 *
 *   prepareAdminModelCall(uid)  → { client, model, config } or throws AdminAiUnavailableError
 *   recordAdminAiUsage(uid, model, usage) → { costUsd }   (never throws)
 *
 * Order of checks (cheapest first, every one fails CLOSED):
 *   1. AI_MODEL_ADMIN (default claude-sonnet-5-5) must have its own AI_PRICE_TABLE row —
 *      an unpriced model would be costed by a guess, so it is refused outright (unpriced_model).
 *   2. ANTHROPIC_API_KEY_ADMIN must be set — no fallback to the app's key (admin_key_missing).
 *   3. app_config/ai: global kill switch + global daily budget (assertAiBudget).
 *   4. admin_ai_stats/{day}.costUsd < app_config/ai.adminAiBudgetUsd ($0.50 default; 0 = off).
 *   5. Per-admin hour/day rate limit (own keys, fail closed).
 * Spend is booked in the shared ledger (ai_usage*, feature 'admin_ai' — so the global switch
 * and budget see it) AND in admin_ai_stats/{day} (the admin budget's own counter).
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  AiUnavailableError,
  aiDayKey,
  assertAiBudget,
  getAdminAnthropicClient,
  getAiModel,
  loadAiConfig,
  recordAiUsage,
} from '@/lib/ai/anthropic.server';
import { isPricedModel, type AiUsage } from '@/lib/ai/ai-pricing';
import type { AiConfig } from '@/lib/ai/ai-config';
import { ADMIN_AI_FEATURE, ADMIN_AI_STATS } from './collections';
import { AdminAiUnavailableError } from './errors';
import { ADMIN_AI_RATE_LIMIT_PER_DAY, ADMIN_AI_RATE_LIMIT_PER_HOUR } from './limits';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface AdminModelGrant {
  client: Anthropic;
  model: string;
  config: AiConfig;
}

function numberOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Today's admin-assistant spend (admin_ai_stats/{day}.costUsd). A read error throws. */
export async function readAdminAiSpentToday(db: Firestore, now?: Date): Promise<number> {
  const snap = await db.collection(ADMIN_AI_STATS).doc(aiDayKey(now)).get();
  return snap.exists ? numberOr0(snap.data()?.costUsd) : 0;
}

export async function prepareAdminModelCall(
  uid: string,
  opts: { db?: Firestore; now?: Date } = {},
): Promise<AdminModelGrant> {
  const model = getAiModel('admin');
  if (!isPricedModel(model)) {
    console.error(`[admin-ai] AI_MODEL_ADMIN="${model}" has no AI_PRICE_TABLE row — refusing (unpriced_model)`);
    throw new AdminAiUnavailableError('unpriced_model');
  }
  const client = getAdminAnthropicClient();
  if (!client) throw new AdminAiUnavailableError('admin_key_missing');

  const db = opts.db ?? getAdminDb();
  let config: AiConfig;
  let spent: number;
  try {
    config = await loadAiConfig(db);
    await assertAiBudget(db, { config, now: opts.now });
    spent = await readAdminAiSpentToday(db, opts.now);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      throw new AdminAiUnavailableError(err.reason === 'kill_switch' ? 'kill_switch' : err.reason === 'over_budget' ? 'over_budget' : 'config_unavailable');
    }
    console.error('[admin-ai] budget check failed — failing CLOSED', err);
    throw new AdminAiUnavailableError('config_unavailable');
  }
  if (spent >= config.adminAiBudgetUsd) throw new AdminAiUnavailableError('admin_over_budget');

  const hour = await checkRateLimit(db, `admin_ai:uid:${uid}:hour`, { windowMs: HOUR_MS, maxRequests: ADMIN_AI_RATE_LIMIT_PER_HOUR, failClosed: true });
  if (hour.limited) throw new AdminAiUnavailableError('rate_limited', { retryAfterSec: Math.max(60, Math.ceil((hour.retryAfterMs ?? HOUR_MS) / 1000)) });
  const day = await checkRateLimit(db, `admin_ai:uid:${uid}:day`, { windowMs: DAY_MS, maxRequests: ADMIN_AI_RATE_LIMIT_PER_DAY, failClosed: true });
  if (day.limited) throw new AdminAiUnavailableError('rate_limited', { retryAfterSec: Math.max(60, Math.ceil((day.retryAfterMs ?? DAY_MS) / 1000)) });

  return { client, model, config };
}

/**
 * Books one model call: shared ledger (recordAiUsage, feature 'admin_ai') + the admin day
 * counter. Never throws — the call already happened; a failed write is logged loudly because
 * it under-counts the admin budget.
 */
export async function recordAdminAiUsage(
  uid: string,
  model: string,
  usage: AiUsage,
  opts: { db?: Firestore; now?: Date } = {},
): Promise<{ costUsd: number }> {
  const db = opts.db ?? getAdminDb();
  const { costUsd } = await recordAiUsage(uid, model, usage, { feature: ADMIN_AI_FEATURE, now: opts.now, db });
  try {
    const day = aiDayKey(opts.now);
    await db.collection(ADMIN_AI_STATS).doc(day).set(
      { day, costUsd: FieldValue.increment(costUsd), modelCalls: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.error(`[admin-ai] admin_ai_stats write FAILED (est $${costUsd.toFixed(6)}) — admin budget under-counted`, err);
  }
  return { costUsd };
}

/**
 * Counts a path that never called a model (local navigation / quick answer) on the day doc —
 * a number only, never the question text (plan §6.5). Never throws.
 */
export async function countAdminAiFreeRoute(
  route: 'localNav' | 'quick',
  opts: { db?: Firestore; now?: Date } = {},
): Promise<void> {
  try {
    const db = opts.db ?? getAdminDb();
    const day = aiDayKey(opts.now);
    await db.collection(ADMIN_AI_STATS).doc(day).set(
      { day, [route]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn(`[admin-ai] ${route} counter write failed`, err);
  }
}
