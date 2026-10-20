/**
 * Kelly phase 3 — optional: ONE sentence of a proactive message from the fast model
 * (sub-flag ai_coach_proactive_llm, default off).
 *
 * Cost guard: the AI kill switch + daily budget (assertAiBudget) before every call, a per-run
 * cap the caller passes (PROACTIVE_LLM_MAX_PER_RUN), max_tokens 80, no thinking, a stable
 * cached system prompt, and the call is logged in the AI ledgers (feature
 * 'ai_coach_proactive'). Any failure, refusal or a sentence that breaks a persona rule →
 * null, and the deterministic template sentence is used. The model sees no name, no id and
 * no free text from the user: only the gender, the brief and two coarse facts.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { Firestore } from 'firebase-admin/firestore';
import { assertAiBudget, getAiModel, getAnthropicClient, recordAiUsage, withPromptCaching } from '@/lib/ai/anthropic.server';
import { usageFromSdk, type AiUsage } from '@/lib/ai/ai-pricing';
import type { CoachGender } from '../persona';
import { validateFlexSentence } from './flex-guard';
import { FLEX_MAX_TOKENS, FLEX_SYSTEM, flexUserContent } from './flex-prompt';

export const PROACTIVE_LLM_MAX_PER_RUN = 150;
export const PROACTIVE_LLM_FEATURE = 'ai_coach_proactive';

export interface FlexRequest {
  uid: string;
  gender: CoachGender;
  /** What the sentence should do (RenderedMessage.flexHint). */
  hint: string;
  /** Coarse, PII-free facts ("main goal: בניית מסה", "streak: a few days"). */
  facts: string[];
}

export async function personalizeFlex(db: Firestore, r: FlexRequest): Promise<{ sentence: string | null; costUsd: number; usage?: AiUsage; model?: string }> {
  try {
    await assertAiBudget(db);
  } catch {
    return { sentence: null, costUsd: 0 };
  }
  const model = getAiModel('fast');
  const cached = withPromptCaching({ system: FLEX_SYSTEM });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: FLEX_MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: cached.system,
    messages: [{ role: 'user', content: flexUserContent(r.gender, r.hint, r.facts) }],
  };
  try {
    const res = await getAnthropicClient().messages.create(params);
    const usage = usageFromSdk(res.usage);
    const { costUsd } = await recordAiUsage(r.uid, model, usage, { feature: PROACTIVE_LLM_FEATURE, db });
    if (res.stop_reason === 'refusal') return { sentence: null, costUsd, usage, model };
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    return { sentence: validateFlexSentence(text, r.gender), costUsd, usage, model };
  } catch (err) {
    console.warn('[kelly-proactive] flex sentence failed, using the template', (err as Error)?.name);
    return { sentence: null, costUsd: 0 };
  }
}
