/**
 * POST /api/ai-coach/chat — "קלי AI", the AI coach chat (streaming SSE).
 *
 * Gate: verifyAiRequest (auth, adult, aiCoachEnabled + entitlement, kill switch + daily
 * budget, per-user rate limit). Every model call goes through the Phase 0 wrapper
 * (getAnthropicClient / getAiModel('fast') / withPromptCaching) and is logged with
 * recordAiUsage. Protocol: src/lib/ai/coach/protocol.ts. Turn loop: turn-engine.ts.
 *
 * Note: the client-tool continuation ({toolResult}) is a second request and passes the
 * same gate, so one "build me a workout" costs two rate-limit units. That is deliberate:
 * both requests call the model.
 */
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey, getIsraelDayOfWeek, getIsraelHour } from '@/lib/israelTime';
import { aiDenialResponse, verifyAiRequest } from '@/lib/ai/verify-ai-request.server';
import { createAiMessage, getAiModel, getAnthropicClient, recordAiUsage, withPromptCaching } from '@/lib/ai/anthropic.server';
import { usageFromSdk } from '@/lib/ai/ai-pricing';
import {
  COACH_MAX_TOOL_ROUNDS,
  COACH_MODEL_MAX_TOKENS,
  COACH_SYSTEM_PROMPT,
  buildSessionContext,
  coachGenderOf,
  firstNameOf,
} from '@/lib/ai/coach/persona';
import { detectSafetyTrigger, safetyReply } from '@/lib/ai/coach/safety';
import { ChatRequestSchema, encodeSse, type CoachStreamEvent, type CoachStreamErrorCode } from '@/lib/ai/coach/protocol';
import { GenerateWorkoutInput, coachToolDefinitions, sanitizeWorkoutEquipment } from '@/lib/ai/coach/tools';
import {
  clientOutcomeToToolResult,
  historyToModelMessages,
  newTurnState,
  resumeWithClientResult,
  runCoachTurn,
  type TurnState,
} from '@/lib/ai/coach/turn-engine';
import {
  appendMessage,
  clearPending,
  loadThread,
  maybeRollSummary,
  savePending,
  type StoredCard,
  type StoredMessage,
} from '@/lib/ai/coach/thread-store.server';
import { executeServerTool, type ServerToolContext } from '@/lib/ai/coach/server-tools.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FEATURE = 'ai_coach_chat';

function streamErrorCode(err: unknown): CoachStreamErrorCode {
  if (err instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) return 'overloaded';
  if (err instanceof Anthropic.APIError) return 'model_error';
  return 'internal';
}

async function summarizeOlder(uid: string, previous: string | null, msgs: StoredMessage[]): Promise<string | null> {
  const transcript = msgs
    .map((m) => `${m.role === 'user' ? 'משתמש' : 'קלי'}: ${m.text.slice(0, 400)}${m.cards.length ? ` [כרטיס: ${m.cards.map((c) => c.title).join(', ')}]` : ''}`)
    .join('\n');
  const res = await createAiMessage(uid, 'ai_coach_summary', {
    model: getAiModel('fast'),
    max_tokens: 300,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system:
      'Summarize this fitness coaching chat in Hebrew, at most 5 short sentences: what the user wants, preferences, limits they mentioned, workouts built. Facts only, no numbers that are not in the text.',
    messages: [{ role: 'user', content: `${previous ? `סיכום קודם: ${previous}\n\n` : ''}${transcript}` }],
  });
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim();
  return text || null;
}

export async function POST(request: Request) {
  const auth = await verifyAiRequest(request);
  if (!auth.ok) return aiDenialResponse(auth);

  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const body = parsed.data;

  const { uid, profile } = auth;
  const db = getAdminDb();
  const now = new Date();
  const gender = coachGenderOf(profile.core?.gender);

  let thread;
  try {
    thread = await loadThread(db, uid, now.getTime());
  } catch (err) {
    console.error('[ai-coach] thread load failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // Cards the model may refer to (explain_workout), newest wins.
  const knownCards = new Map<string, StoredCard>();
  for (const m of thread.recent) for (const c of m.cards) knownCards.set(c.workoutId, c);

  // ── Resolve the turn's starting state ─────────────────────────────────────
  let state: TurnState;
  let newCard: StoredCard | null = null;
  /** Cards produced earlier in this same turn (a previous client round). */
  let carriedCards: StoredCard[] = [];
  let safetyText: string | null = null;

  if ('toolResult' in body) {
    const pending = thread.pending;
    if (!pending || pending.toolUseId !== body.toolResult.id) {
      return NextResponse.json({ error: 'no_pending_tool' }, { status: 409 });
    }
    const outcome = body.toolResult.outcome;
    if (outcome.ok) {
      const r = outcome.result;
      newCard = {
        type: 'workout',
        workoutId: r.workoutId,
        title: r.title,
        minutes: r.minutes,
        exerciseCount: r.exercises.length,
        location: r.location,
        decisionRecord: (r.decisionRecord as Record<string, unknown> | undefined) ?? null,
      };
      knownCards.set(newCard.workoutId, newCard);
    }
    carriedCards = pending.cards;
    state = resumeWithClientResult(pending.state, pending.pendingResults, clientOutcomeToToolResult(pending.toolUseId, outcome));
  } else {
    const text = body.message;
    try {
      if (thread.pending) await clearPending(db, uid); // the user moved on; drop the unanswered tool call
      await appendMessage(db, uid, { role: 'user', text });
    } catch (err) {
      console.error('[ai-coach] saving the user message failed', err);
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    const trigger = detectSafetyTrigger(text);
    if (trigger) safetyText = safetyReply(trigger, gender);
    state = newTurnState(text);
  }

  // `recent` was loaded before this request's user message was saved, so it holds only
  // earlier turns; this turn's messages travel in `state`.
  const history = historyToModelMessages(thread.recent);

  const cached = withPromptCaching({ system: COACH_SYSTEM_PROMPT, tools: coachToolDefinitions() });
  const system: Anthropic.TextBlockParam[] = [
    ...cached.system,
    {
      type: 'text',
      text: buildSessionContext({
        firstName: firstNameOf(profile.core?.name),
        gender,
        todayKey: getIsraelDateKey(now),
        israelDayOfWeek: getIsraelDayOfWeek(now),
        israelHour: getIsraelHour(now),
        summary: thread.summary,
      }),
    },
  ];
  const model = getAiModel('fast');
  const toolCtx: ServerToolContext = { db, uid, profile, now, knownCards, turn: { handoffDone: false } };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: CoachStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(ev)));
        } catch {
          /* client went away; keep going so the turn is still saved */
        }
      };

      try {
        // Deterministic safety reply: no model call at all.
        if (safetyText) {
          emit({ type: 'text', delta: safetyText });
          const id = await appendMessage(db, uid, { role: 'assistant', text: safetyText });
          emit({ type: 'done', messageId: id });
          return;
        }

        if (newCard) {
          const { type, workoutId, title, minutes, exerciseCount, location } = newCard;
          emit({ type: 'card', card: { type, workoutId, title, minutes, exerciseCount, location } });
        }

        const outcome = await runCoachTurn(
          {
            model,
            system,
            tools: cached.tools ?? [],
            history,
            maxRounds: COACH_MAX_TOOL_ROUNDS,
            maxTokens: COACH_MODEL_MAX_TOKENS,
          },
          state,
          {
            emit,
            callModel: async (params, onText) => {
              // No abort on client disconnect: the turn still completes and is saved, so the
              // reply is there when the user reopens the chat (cost is capped by max_tokens).
              const s = getAnthropicClient().messages.stream(params);
              s.on('text', (delta) => onText(delta));
              const final = await s.finalMessage();
              await recordAiUsage(uid, model, usageFromSdk(final.usage), { feature: FEATURE });
              return final;
            },
            executeServerTool: (name, input) => executeServerTool(toolCtx, name, input),
            prepareClientTool: (name, input) =>
              name === 'generate_workout'
                ? sanitizeWorkoutEquipment(GenerateWorkoutInput.parse(input), profile.equipment)
                : input,
          },
        );

        const turnCards: StoredCard[] = newCard ? [...carriedCards, newCard] : carriedCards;

        if (outcome.kind === 'client_tool') {
          await savePending(db, uid, {
            toolUseId: outcome.call.id,
            toolName: outcome.call.name,
            state: outcome.state,
            pendingResults: outcome.pendingResults,
            cards: turnCards,
          });
          emit({ type: 'client_tool', id: outcome.call.id, name: outcome.call.name, input: outcome.call.input });
          return;
        }

        // Final: ONE assistant message for the whole turn (every round), with its cards.
        const id = await appendMessage(db, uid, { role: 'assistant', text: outcome.state.turnText.trim(), cards: turnCards });
        if ('toolResult' in body) await clearPending(db, uid);
        emit({ type: 'done', messageId: id });

        await maybeRollSummary(db, uid, thread, (prev, msgs) => summarizeOlder(uid, prev, msgs));
      } catch (err) {
        console.error('[ai-coach] turn failed', err);
        emit({ type: 'error', code: streamErrorCode(err) });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
