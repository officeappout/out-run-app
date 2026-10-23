/**
 * Workout insights — ONE fast-model call for the two lines (feature 'workout_insights' in the AI
 * ledgers). Same cheap path as Kelly's proactive personal sentence: getAiModel('fast'), no
 * thinking, a stable cached system prompt, a small max_tokens, and a hard timeout. Any failure,
 * refusal or unsafe line → that line is null (the screen shows nothing). Budget / kill switch /
 * entitlement are checked by the route before this runs.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { getAiModel, getAnthropicClient, recordAiUsage, withPromptCaching } from '@/lib/ai/anthropic.server';
import { usageFromSdk } from '@/lib/ai/ai-pricing';
import type { CoachGender } from '@/lib/ai/coach/persona';
import { INSIGHT_MAX_TOKENS, INSIGHT_SYSTEM, insightFacts, insightUserContent } from './prompt';
import { parseInsightReply } from './lines-guard';
import { EMPTY_INSIGHT, type WorkoutInsightLines, type WorkoutInsightRequest } from './schema';

export const INSIGHT_FEATURE = 'workout_insights';
/** The client gives up at ~9s; the model call must finish well before that. */
export const INSIGHT_MODEL_TIMEOUT_MS = 6000;

export async function generateWorkoutInsight(
  uid: string,
  req: WorkoutInsightRequest,
  gender: CoachGender,
  volumeKg: number | null,
): Promise<{ lines: WorkoutInsightLines; model: string; ok: boolean }> {
  const model = getAiModel('fast');
  const cached = withPromptCaching({ system: INSIGHT_SYSTEM });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: INSIGHT_MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: cached.system,
    messages: [{ role: 'user', content: insightUserContent(req, gender, volumeKg) }],
  };
  try {
    const res = await getAnthropicClient().messages.create(params, { timeout: INSIGHT_MODEL_TIMEOUT_MS, maxRetries: 0 });
    await recordAiUsage(uid, model, usageFromSdk(res.usage), { feature: INSIGHT_FEATURE });
    if (res.stop_reason === 'refusal') return { lines: EMPTY_INSIGHT, model, ok: false };
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const lines = parseInsightReply(text, gender, insightFacts(req, volumeKg).join('\n'));
    return { lines, model, ok: lines.insight != null || lines.funny != null };
  } catch (err) {
    console.warn('[insights] model call failed', (err as Error)?.name);
    return { lines: EMPTY_INSIGHT, model, ok: false };
  }
}
