/**
 * model-call.server — one streamed model call for the admin assistant + its booking.
 *
 * Sonnet 5.5 settings (plan §2.3): output_config.effort 'medium' (Sonnet 5.5's default is
 * 'high'), `thinking` omitted (adaptive; {type:'disabled'} is a 400 on Sonnet 5.5), tool_choice
 * only 'auto' / 'none' (forced choice is a 400), strict tool schemas. Server-side refusal
 * fallbacks: `fallbacks: "default"` + beta header server-side-fallback-2026-07-01 (Claude API
 * only); ADMIN_AI_DISABLE_FALLBACKS=1 turns that off without a deploy of code. The SDK version
 * in this repo doesn't type `fallbacks`, so it is added to the body explicitly.
 *
 * Haiku calls (router, history summary) send thinking {type:'disabled'} (allowed on Haiku 5.5
 * at effort ≤ high) — they are one-word / ≤150-token jobs.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { usageFromSdk } from '@/lib/ai/ai-pricing';
import { recordAdminAiUsage } from './budget.server';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface ModelCallResult {
  message: Anthropic.Message;
  costUsd: number;
}

function fallbacksEnabled(): boolean {
  return process.env.ADMIN_AI_DISABLE_FALLBACKS !== '1';
}

/** Streams a Sonnet call: text deltas → onText; books usage after the final message. */
export async function streamAdminModelCall(
  client: Anthropic,
  uid: string,
  params: Anthropic.MessageStreamParams,
  onText: (delta: string) => void,
): Promise<ModelCallResult> {
  const withFallbacks = fallbacksEnabled();
  const body = (withFallbacks ? { ...params, fallbacks: 'default' } : params) as Anthropic.MessageStreamParams;
  const stream = client.messages.stream(body, withFallbacks ? { headers: { 'anthropic-beta': FALLBACK_BETA } } : undefined);
  stream.on('text', (delta) => onText(delta));
  const message = await stream.finalMessage();
  // Bill at the model that actually answered (a fallback reports its own model id).
  const { costUsd } = await recordAdminAiUsage(uid, message.model || params.model, usageFromSdk(message.usage));
  return { message, costUsd };
}

/** A small non-streamed Haiku call (router / summary). */
export async function smallAdminModelCall(
  client: Anthropic,
  uid: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<ModelCallResult> {
  const message = await client.messages.create({ ...params, thinking: { type: 'disabled' } });
  const { costUsd } = await recordAdminAiUsage(uid, message.model || params.model, usageFromSdk(message.usage));
  return { message, costUsd };
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
