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
import { applyUserIntent, typoHints } from '@/lib/ai/coach/intent';
import { chipsForTurn, nudgeStateFrom } from '@/lib/ai/coach/action-chips';
import type { UserContextSheet } from '@/lib/ai/coach/context-sheet';
import {
  clientOutcomeToToolResult,
  historyToModelMessages,
  newTurnLog,
  newTurnState,
  resumeWithClientResult,
  runCoachTurn,
  turnUserText,
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
import { executeServerTool, loadUserContextSheet, type ServerToolContext } from '@/lib/ai/coach/server-tools.server';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { labelTeamMessagesForModel } from '@/lib/ai/coach/unified-thread';

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
    .map((m) => `${m.role === 'user' ? 'משתמש' : m.source === 'human' ? 'צוות OUT' : 'קלי'}: ${m.text.slice(0, 400)}${m.cards.length ? ` [כרטיס: ${m.cards.map((c) => c.title).join(', ')}]` : ''}`)
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
  // Unified Kelly (kelly_unified_v1): messages carry `source`, team replies are in the model
  // history (labelled), handoff flags this thread. Off: every write below is unchanged.
  const unified = auth.flags?.kellyUnifiedV1 === true;
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
  let safetyTrigger: string | null = null;

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
        ...(r.domains ? { domains: r.domains.slice(0, 8) } : {}),
        ...(r.difficulty ? { difficulty: r.difficulty } : {}),
        decisionRecord: (r.decisionRecord as Record<string, unknown> | undefined) ?? null,
        exercises: r.exercises,
        requestedMinutes: r.requestedMinutes ?? null,
        levelCeiling: r.levelCeiling === true,
      };
      knownCards.set(newCard.workoutId, newCard);
    }
    carriedCards = pending.cards;
    state = resumeWithClientResult(
      pending.state,
      pending.pendingResults,
      clientOutcomeToToolResult(pending.toolUseId, outcome),
      pending.toolName || 'generate_workout',
    );
  } else {
    const text = body.message;
    try {
      if (thread.pending) await clearPending(db, uid); // the user moved on; drop the unanswered tool call
      await appendMessage(db, uid, { role: 'user', text, ...(unified ? { source: 'user' as const } : {}) });
    } catch (err) {
      console.error('[ai-coach] saving the user message failed', err);
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    const trigger = detectSafetyTrigger(text);
    if (trigger) {
      safetyText = safetyReply(trigger, gender);
      safetyTrigger = trigger;
    }
    state = newTurnState(text);
  }

  // `recent` was loaded before this request's user message was saved, so it holds only
  // earlier turns; this turn's messages travel in `state`.
  const history = historyToModelMessages(unified ? labelTeamMessagesForModel(thread.recent) : thread.recent);

  const model = getAiModel('fast');
  // Schedule advisor (phase A): read-only recommend_week / recommend_today, the sheet's
  // plan section, the derived "done" for today, the open_builder chip. Fail-closed: a flag
  // read error returns the FLAG_DEFS defaults (off).
  const scheduleAdvisor = (await getServerFeatureFlags(db)).aiCoachScheduleAdvisor === true;
  const toolCtx: ServerToolContext = { db, uid, profile, now, knownCards, turn: { handoffDone: false }, scheduleAdvisor, ...(unified ? { unified: true } : {}) };

  // Grounding: the user sheet (programs, levels, recent workouts, today's and this week's
  // schedule, gear) is read on EVERY request and put in the system prompt, so Kelly never
  // answers a question about the user blind. Not needed for the fixed safety reply.
  let sheet: UserContextSheet | null = null;
  if (!safetyText) {
    try {
      sheet = await loadUserContextSheet(toolCtx);
    } catch (err) {
      console.warn('[ai-coach] user sheet unavailable this turn', err);
    }
  }
  const todayDow = getIsraelDayOfWeek(now);
  const userTextThisTurn = turnUserText(state);
  // Level-check nudges: never twice in a few days, and "opening" = a new conversation.
  const nudge = nudgeStateFrom(thread.recent, now.getTime());
  const refusedForLevel =
    'toolResult' in body && !body.toolResult.outcome.ok && body.toolResult.outcome.error === 'needs_assessment'
      ? (body.toolResult.outcome.domains ?? [])
      : [];

  const cached = withPromptCaching({ system: COACH_SYSTEM_PROMPT, tools: coachToolDefinitions({ scheduleAdvisor }) });
  const system: Anthropic.TextBlockParam[] = [
    ...cached.system,
    {
      type: 'text',
      text: buildSessionContext({
        firstName: firstNameOf(profile.core?.name),
        gender,
        todayKey: getIsraelDateKey(now),
        israelDayOfWeek: todayDow,
        israelHour: getIsraelHour(now),
        summary: thread.summary,
        sheet,
        typoHints: typoHints(userTextThisTurn),
        assessmentNudgeAllowed: nudge.nudgeAllowed,
        scheduleAdvisor,
      }),
      // Second breakpoint: the session block (with the sheet) is identical for every
      // model call of this turn, so the tool rounds after the first read it from cache.
      cache_control: { type: 'ephemeral' },
    },
  ];

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
          const log = newTurnLog('none');
          log.guards.push({ type: 'safety', action: `fixed_reply:${safetyTrigger}` });
          const id = await appendMessage(db, uid, { role: 'assistant', text: safetyText, log, ...(unified ? { source: 'ai' as const } : {}) });
          emit({ type: 'done', messageId: id });
          return;
        }

        if (newCard) {
          const { type, workoutId, title, minutes, exerciseCount, location, domains, difficulty } = newCard;
          emit({ type: 'card', card: { type, workoutId, title, minutes, exerciseCount, location, domains, difficulty } });
        }

        const outcome = await runCoachTurn(
          {
            model,
            system,
            tools: cached.tools ?? [],
            history,
            maxRounds: COACH_MAX_TOOL_ROUNDS,
            maxTokens: COACH_MODEL_MAX_TOKENS,
            guards: { sheet, todayDow, userGender: gender },
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
            prepareClientTool: (name, input, turnState) => {
              if (name !== 'generate_workout') return input;
              // The user's own words win over the model's reading of them (body area,
              // location, minutes, intensity), then gear the user doesn't own is dropped.
              const { input: intended, changes } = applyUserIntent(GenerateWorkoutInput.parse(input), turnUserText(turnState));
              if (changes.length) turnState.log?.guards.push({ type: 'intent_mapping', action: changes.join('; ') });
              return sanitizeWorkoutEquipment(intended, profile.equipment);
            },
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

        // Action chips (e.g. "פתח את הלו״ז" under a schedule answer), decided from the turn.
        const toolCalls = outcome.state.log?.toolCalls ?? [];
        const built = toolCalls.find((c) => c.name === 'generate_workout');
        const builtDomains = (built?.input as { domains?: unknown } | null | undefined)?.domains;
        const actions = chipsForTurn({
          userText: userTextThisTurn,
          toolNames: toolCalls.map((c) => c.name),
          sheet,
          workoutDomains: Array.isArray(builtDomains) ? builtDomains.filter((d): d is string => typeof d === 'string') : null,
          needsAssessmentDomains: refusedForLevel,
          nudgeAllowed: nudge.nudgeAllowed,
          opening: nudge.opening,
          scheduleAdvisor,
          strengthDoneToday: sheet?.plan?.doneToday.strength === true,
        });
        if (actions.length) emit({ type: 'actions', actions });

        // Final: ONE assistant message for the whole turn (every round), with its cards.
        const id = await appendMessage(db, uid, {
          role: 'assistant',
          text: outcome.state.turnText.trim(),
          cards: turnCards,
          actions,
          log: outcome.state.log,
          ...(unified ? { source: 'ai' as const } : {}),
        });
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
