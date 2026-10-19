/**
 * The LLM call for one session (Sonnet via the shared AI wrapper: budget asserted by the
 * caller, usage recorded in the AI ledgers under feature 'generation_review_llm').
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, recordAiUsage } from '@/lib/ai/anthropic.server';
import { estimateCostUsd, usageFromSdk } from '@/lib/ai/ai-pricing';
import { GENERATION_REVIEW_LEDGER_UID, GENERATION_REVIEW_LLM_FEATURE } from '../types';
import { GEN_LLM_JSON_SCHEMA, GEN_LLM_MAX_TOKENS, GEN_LLM_SYSTEM_PROMPT, buildGenLlmUserContent, parseGenLlmOutput, type GenLlmOutput } from './llm-prompt';

export type CallLlm = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
const defaultCall: CallLlm = (p) => getAnthropicClient().messages.create(p);

export async function judgeSession(
  model: string,
  session: Parameters<typeof buildGenLlmUserContent>[0],
  opts: { call?: CallLlm; dryRun?: boolean; now?: Date } = {},
): Promise<{ output: GenLlmOutput | null; costUsd: number; error: string | null }> {
  const message = await (opts.call ?? defaultCall)({
    model,
    max_tokens: GEN_LLM_MAX_TOKENS,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: GEN_LLM_JSON_SCHEMA } },
    system: [{ type: 'text', text: GEN_LLM_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildGenLlmUserContent(session) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const usage = usageFromSdk(message.usage);
  const costUsd = estimateCostUsd(model, usage);
  if (!opts.dryRun) await recordAiUsage(GENERATION_REVIEW_LEDGER_UID, model, usage, { feature: GENERATION_REVIEW_LLM_FEATURE, now: opts.now });
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') return { output: null, costUsd, error: message.stop_reason };
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  const output = parseGenLlmOutput(text);
  return { output, costUsd, error: output ? null : 'parse' };
}
