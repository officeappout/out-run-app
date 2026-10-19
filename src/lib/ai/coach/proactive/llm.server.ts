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
import { usageFromSdk } from '@/lib/ai/ai-pricing';
import type { CoachGender } from '../persona';
import { validateFlexSentence } from './flex-guard';

export const PROACTIVE_LLM_MAX_PER_RUN = 150;
export const PROACTIVE_LLM_FEATURE = 'ai_coach_proactive';

const SYSTEM = [
  'You write ONE short Hebrew sentence for Kelly (קלי), a male fitness coach in the OUT app, inside a short message he sends the user.',
  'Rules: Hebrew only, at most 14 words, one sentence ending with a period or an exclamation mark, warm and calm, no question.',
  'No numbers, no names, no emoji, no slash forms (never "את/ה"), no dashes, no medical claims, never guilt about missed workouts.',
  'Kelly speaks about himself in the masculine. Address the user in the grammar given. Output the sentence only.',
].join('\n');

const GRAMMAR: Record<CoachGender, string> = {
  male: 'Address the user in masculine singular.',
  female: 'Address the user in feminine singular.',
  other: 'Gender unknown: impersonal or plural wording, never a gendered command.',
};

export interface FlexRequest {
  uid: string;
  gender: CoachGender;
  /** What the sentence should do (RenderedMessage.flexHint). */
  hint: string;
  /** Coarse, PII-free facts ("main goal: בניית מסה", "streak: a few days"). */
  facts: string[];
}

export async function personalizeFlex(db: Firestore, r: FlexRequest): Promise<{ sentence: string | null; costUsd: number }> {
  try {
    await assertAiBudget(db);
  } catch {
    return { sentence: null, costUsd: 0 };
  }
  const model = getAiModel('fast');
  const cached = withPromptCaching({ system: SYSTEM });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 80,
    thinking: { type: 'disabled' },
    system: cached.system,
    messages: [{ role: 'user', content: [GRAMMAR[r.gender], `The sentence should be: ${r.hint}.`, ...r.facts.map((f) => `- ${f}`)].join('\n') }],
  };
  try {
    const res = await getAnthropicClient().messages.create(params);
    const { costUsd } = await recordAiUsage(r.uid, model, usageFromSdk(res.usage), { feature: PROACTIVE_LLM_FEATURE, db });
    if (res.stop_reason === 'refusal') return { sentence: null, costUsd };
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    return { sentence: validateFlexSentence(text, r.gender), costUsd };
  } catch (err) {
    console.warn('[kelly-proactive] flex sentence failed, using the template', (err as Error)?.name);
    return { sentence: null, costUsd: 0 };
  }
}
