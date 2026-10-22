/**
 * router.server — Haiku 5.5 decides what an unclear question is, in ONE word (plan §3.3 step 4).
 * Only used when local navigation didn't decide and the drawer didn't already mark the
 * question as data. ≤300 input tokens, ≤10 output tokens. Anything unparseable → 'model'.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { getAiModel } from '@/lib/ai/anthropic.server';
import { isPricedModel } from '@/lib/ai/ai-pricing';
import { QUICK_METRICS, type QuickMetricId } from './quick-metrics.server';
import { smallAdminModelCall } from './model-call.server';

export type RouterDecision =
  | { kind: 'nav' }
  | { kind: 'quick'; metric: QuickMetricId }
  | { kind: 'out_of_scope' }
  | { kind: 'model' };

const ROUTER_SYSTEM = `Classify an admin's question to the OUT admin-panel assistant. Reply with ONE token only:
nav — they want to find/open a page or screen
${QUICK_METRICS.map((m) => `quick:${m}`).join(' | ')} — the question is exactly one of these numbers (pending approvals / AI cost today / CRM pipeline / weekly active exercisers / signup failures this week / cities in mapping)
model — any other question about the company's data, product or numbers
out — unrelated to the admin panel or the company`;

export function parseRouterReply(text: string): RouterDecision {
  const t = text.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (t === 'nav') return { kind: 'nav' };
  if (t === 'out') return { kind: 'out_of_scope' };
  if (t.startsWith('quick:')) {
    const m = t.slice(6);
    if ((QUICK_METRICS as readonly string[]).includes(m)) return { kind: 'quick', metric: m as QuickMetricId };
  }
  return { kind: 'model' };
}

export async function routeQuestion(client: Anthropic, uid: string, question: string): Promise<{ decision: RouterDecision; costUsd: number }> {
  const model = getAiModel('fast');
  if (!isPricedModel(model)) return { decision: { kind: 'model' }, costUsd: 0 };
  try {
    const { message, costUsd } = await smallAdminModelCall(client, uid, {
      model,
      max_tokens: 10,
      system: ROUTER_SYSTEM,
      messages: [{ role: 'user', content: question.slice(0, 600) }],
    });
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    return { decision: parseRouterReply(text), costUsd };
  } catch (err) {
    console.warn('[admin-ai] router failed — sending to the main model', err);
    return { decision: { kind: 'model' }, costUsd: 0 };
  }
}
