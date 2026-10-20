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

/** User-written messages after `sinceMs`, oldest first (team-only and AI-chat messages alike). */
async function newUserMessages(db: Firestore, uid: string, sinceMs: number): Promise<Array<ExtractMessage & { at: number }>> {
  const snap = await db
    .collection(AI_COACH_THREADS)
    .doc(uid)
    .collection('messages')
    .where('createdAt', '>', Timestamp.fromMillis(sinceMs))
    .orderBy('createdAt', 'asc')
    .limit(120)
    .get();
  const out: Array<ExtractMessage & { at: number }> = [];
  for (const d of snap.docs) {
    const x = d.data();
    const isUser = x.source === 'user' || (x.source === undefined && x.role === 'user');
    if (!isUser || typeof x.text !== 'string' || !x.text.trim()) continue;
    out.push({ id: d.id, text: x.text, at: (x.createdAt as Timestamp).toMillis() });
  }
  return out.slice(-MEMORY_BATCH_MAX);
}

export async function extractMemoryForUser(db: Firestore, uid: string, now = Date.now()): Promise<ExtractOutcome> {
  const mem = await loadMemory(db, uid);
  const msgs = await newUserMessages(db, uid, mem.extractedUntil);
  if (msgs.length === 0) return { status: 'no_new_messages' };
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
  const until = msgs[msgs.length - 1].at;
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
