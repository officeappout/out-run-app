/**
 * Kelly phase 3 — one user's memory pass: new user messages since extractedUntil → one fast
 * model call → operations → rules filter → merge → write. Cost guard: the AI kill switch +
 * daily budget before the call, at most 40 messages and 400 output tokens per call, logged
 * in the AI ledgers (feature 'ai_coach_memory').
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { assertAiBudget, getAiModel, getAnthropicClient, recordAiUsage, withPromptCaching } from '@/lib/ai/anthropic.server';
import { usageFromSdk, type AiUsage } from '@/lib/ai/ai-pricing';
import { AI_COACH_THREADS } from '../thread-store.server';
import { MEMORY_EXTRACT_SYSTEM, buildExtractUserContent, parseExtraction, type ExtractMessage } from './extract-prompt';
import { applyExtraction } from './merge';
import { loadMemory, saveMemory } from './store.server';

export const MEMORY_FEATURE = 'ai_coach_memory';
export const MEMORY_BATCH_MAX = 40;

/** `usage` / `model`: the call's token counts (the demo center counts demo users' calls). */
type CallInfo = { costUsd: number; usage?: AiUsage; model?: string };
export type ExtractOutcome = { status: 'no_new_messages' } | ({ status: 'updated' | 'unchanged'; facts: number } & CallInfo) | ({ status: 'model_unusable' } & CallInfo);

/** Messages read per pass (user + Kelly + team); the newest ones after the checkpoint. */
export const MEMORY_READ_WINDOW = 120;

export interface NewMessages {
  /** User-written messages to extract from, oldest first (at most MEMORY_BATCH_MAX, the newest ones). */
  user: Array<ExtractMessage & { at: number }>;
  /** createdAt (ms) of the newest message read, of any author — the next checkpoint. null = nothing new. */
  newestAt: number | null;
}

function msOf(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The NEWEST messages after `sinceMs` (K0 F6). It used to read the OLDEST 120 after the
 * checkpoint and advance only to the last user message among them, so a user with a long
 * history had their recent conversations unread for weeks (one 120-message window per chat
 * night). Now: newest window first (desc + limit, then oldest-first for the prompt), and the
 * checkpoint moves to the newest message read. A backlog older than the window is skipped on
 * purpose: memory keeps what the user says NOW (facts change; an old injury that still matters
 * comes up again).
 *
 * Source: ai_coach_threads/{uid}/messages — the ONLY place the Kelly chat writes, unified
 * (kelly_unified_v1) or not (thread-store.server.ts appendMessage / appendNonAiMessage /
 * appendTeamOnlyUserMessage / appendAiPausedUserMessage). Unified user messages carry
 * source 'user'; older ones only role 'user'.
 */
export async function newUserMessages(db: Firestore, uid: string, sinceMs: number): Promise<NewMessages> {
  const snap = await db
    .collection(AI_COACH_THREADS)
    .doc(uid)
    .collection('messages')
    .where('createdAt', '>', Timestamp.fromMillis(sinceMs))
    .orderBy('createdAt', 'desc')
    .limit(MEMORY_READ_WINDOW)
    .get();
  let newestAt: number | null = null;
  const user: Array<ExtractMessage & { at: number }> = [];
  for (const d of snap.docs) {
    const x = d.data();
    const at = msOf(x.createdAt);
    if (at === null) continue;
    if (newestAt === null || at > newestAt) newestAt = at;
    const isUser = x.source === 'user' || (x.source === undefined && x.role === 'user');
    if (!isUser || typeof x.text !== 'string' || !x.text.trim()) continue;
    user.push({ id: d.id, text: x.text, at });
  }
  user.sort((a, b) => a.at - b.at);
  return { user: user.slice(-MEMORY_BATCH_MAX), newestAt };
}

export async function extractMemoryForUser(db: Firestore, uid: string, now = Date.now()): Promise<ExtractOutcome> {
  const mem = await loadMemory(db, uid);
  const { user: msgs, newestAt } = await newUserMessages(db, uid, mem.extractedUntil);
  if (msgs.length === 0) return { status: 'no_new_messages' }; // nothing written: no model call, no new doc
  await assertAiBudget(db); // throws AiUnavailableError → the run stops (kill switch / budget)
  const model = getAiModel('fast');
  const res = await getAnthropicClient().messages.create({
    model,
    max_tokens: 400,
    thinking: { type: 'disabled' },
    ...withPromptCaching({ system: MEMORY_EXTRACT_SYSTEM }),
    messages: [{ role: 'user', content: buildExtractUserContent(mem.facts, msgs) }],
  });
  const usage = usageFromSdk(res.usage);
  const { costUsd } = await recordAiUsage(uid, model, usage, { feature: MEMORY_FEATURE, db });
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  const ops = res.stop_reason === 'refusal' ? null : parseExtraction(text, msgs.map((m) => m.id));
  const until = Math.max(newestAt ?? 0, msgs[msgs.length - 1].at);
  if (!ops) {
    // Not retried forever: the batch is marked read (a broken answer is not worth a second bill).
    await saveMemory(db, uid, { facts: mem.facts, extractedUntil: until });
    return { status: 'model_unusable', costUsd, usage, model };
  }
  const facts = applyExtraction(mem.facts, ops, now);
  await saveMemory(db, uid, { facts, extractedUntil: until });
  const changed = JSON.stringify(facts) !== JSON.stringify(mem.facts);
  return { status: changed ? 'updated' : 'unchanged', facts: facts.length, costUsd, usage, model };
}
