/**
 * POST /api/ai-coach/chat — "קלי AI", the AI coach chat (streaming SSE).
 *
 * Gate: verifyAiRequest (auth, adult, aiCoachEnabled + entitlement, kill switch + daily
 * budget, per-user rate limit). Every model call goes through the Phase 0 wrapper
 * (getAnthropicClient / getAiModel('fast') / withPromptCaching) and is logged with
 * recordAiUsage. Protocol: src/lib/ai/coach/protocol.ts. Turn loop: turn-engine.ts.
 *
 * Rate limit: one user message = one unit. The client-tool continuation ({toolResult}) is a
 * second request that passes the same gate EXCEPT the per-user rate limit (kill switch and
 * budget still apply): it can only resume the pending turn its message already paid for, and
 * claimPending lets each pending turn be resumed once (roundsUsed still caps the tool rounds).
 * So "build me a workout" costs one unit, not two.
 *
 * Kelly paused (unified Kelly on): when the gate refuses a message for a rate limit, the kill
 * switch, the budget or an outage, the route itself stores the message (team queue per
 * ai-pause.ts) and, once per pause window, Kelly's short paused reply, then returns the denial
 * with `storedForTeam: true` so the screen doesn't send it again. A safety trigger still gets
 * the fixed safety reply. Without unified Kelly the denial is returned as before (the screen
 * shows its error card).
 */
import { NextResponse } from 'next/server';
import type { AiDenial } from '@/lib/ai/verify-ai-request.server';
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
  appendAiPausedUserMessage,
  appendMessage,
  claimPending,
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
import { isAiPauseCode } from '@/lib/ai/coach/ai-pause';
import { phase2TurnExtras } from '@/lib/ai/coach/phase2-turn';
import { proposalView, type StoredProposal } from '@/lib/ai/coach/schedule-proposal/types';
import type { SuggestionChip } from '@/lib/ai/coach/suggestions/types';
import { loadMemory } from '@/lib/ai/coach/memory/store.server';
import { renderMemoryBlock } from '@/lib/ai/coach/memory/inject';
import { ROUND4_NOTE, coachSystemPrompt } from '@/lib/ai/coach/round4/prompt';
import { hasRound4Extras, newRound4TurnState, type Round4TurnState } from '@/lib/ai/coach/round4/types';
import { round4TurnActions } from '@/lib/ai/coach/round4/turn-extras';
import { primeHelpEntries } from '@/lib/content-items/help-prime.server';
import { runsByTypeFor } from '@/features/schedule/utils/runsByTypeGate';
import { weekBuilderFor } from '@/lib/ai/coach/schedule-proposal/builder-gate';

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

/**
 * Unified Kelly: a message the AI gate refused for a pause reason is answered here without AI
 * (see the header). Null = not handled; the plain denial is returned.
 */
async function answerPaused(denial: AiDenial, message: string): Promise<Response | null> {
  if (!denial.uid || denial.flags?.kellyUnifiedV1 !== true || !isAiPauseCode(denial.code)) return null;
  const gender = coachGenderOf(denial.profile?.core?.gender);
  const trigger = detectSafetyTrigger(message);
  try {
    const res = await appendAiPausedUserMessage(getAdminDb(), denial.uid, message, {
      code: denial.code,
      gender,
      retryAfterSec: denial.retryAfterSec,
      safetyText: trigger ? safetyReply(trigger, gender) : null,
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(res.retryAfterSec) } });
    }
    return NextResponse.json(
      { error: denial.code, storedForTeam: true, messageId: res.id, ...(res.replyId ? { replyId: res.replyId } : {}) },
      { status: denial.status, headers: denial.retryAfterSec ? { 'Retry-After': String(denial.retryAfterSec) } : undefined },
    );
  } catch (err) {
    console.error('[ai-coach] storing a paused message failed', err);
    return null;
  }
}

export async function POST(request: Request) {
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  // A tool result resumes a turn its message already paid for: not rate-limited again.
  const auth = await verifyAiRequest(request, { rateLimit: !(parsed.success && 'toolResult' in parsed.data) });
  if (!auth.ok) {
    if (parsed.success && 'message' in parsed.data) {
      const paused = await answerPaused(auth, parsed.data.message);
      if (paused) return paused;
    }
    return aiDenialResponse(auth);
  }

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
  /** Kelly phase 2: a proposal prepared earlier in this same turn (before a client round). */
  let carriedProposal: StoredProposal | null = null;
  /** Kelly round 4: cards / parks / tutorial prepared earlier in this same turn. */
  let carriedRound4: Round4TurnState | null = null;
  /** Kelly round 4: the workout this request's client round built (content-gap chip). */
  let builtGap: { location?: string; levelCeiling?: boolean; shortOfMinimum?: boolean } | null = null;
  const round4 = auth.flags?.aiCoachRound4 === true;
  // get_app_help reads the help loader: refresh its site_content copy (≤ once / 5 min, never throws).
  if (round4) await primeHelpEntries(db);
  let safetyText: string | null = null;
  let safetyTrigger: string | null = null;

  if ('toolResult' in body) {
    let pending;
    try {
      pending = await claimPending(db, uid, body.toolResult.id, now.getTime());
    } catch (err) {
      console.error('[ai-coach] claiming the pending tool call failed', err);
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    if (!pending) {
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
      builtGap = { location: r.location, levelCeiling: r.levelCeiling === true, shortOfMinimum: r.shortOfMinimum === true };
    }
    carriedCards = pending.cards;
    carriedProposal = pending.proposal ?? null;
    carriedRound4 = pending.round4 ?? null;
    state = resumeWithClientResult(
      pending.state,
      pending.pendingResults,
      clientOutcomeToToolResult(pending.toolUseId, outcome, round4 ? { round4: true } : {}),
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
  // Kelly phase 2 (ai_coach_phase2): quick replies, get_app_help, propose_schedule_change.
  // Off = every prompt, tool list, event and write below exactly as before.
  const phase2 = auth.flags?.aiCoachPhase2 === true;
  // enable_home_v2 for this user (the live flag, or a super admin — home's own gating):
  // the advisor reads the run week by slot type, the week home shows. Off = ordinal, as before.
  const runsByType = runsByTypeFor(auth.flags, profile.core?.isSuperAdmin === true);
  // Kelly in the week builder (enable_week_builder_v1, with phase 2): the draft week on screen.
  // Flag off, phase 2 off or no builder in the request = everything exactly as before.
  const builder = phase2 && body.builder && weekBuilderFor(auth.flags, profile.core?.isSuperAdmin === true) ? body.builder : null;
  const toolCtx: ServerToolContext = {
    db,
    uid,
    profile,
    now,
    knownCards,
    turn: { handoffDone: false, ...(phase2 ? { proposal: carriedProposal } : {}) },
    scheduleAdvisor,
    ...(runsByType ? { runsByType: true } : {}),
    ...(unified ? { unified: true } : {}),
    ...(phase2 ? { phase2: true } : {}),
    ...(builder ? { builder } : {}),
  };

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
  // Kelly round 4 (ai_coach_round4): aerobic sessions, nearby parks, weather, the tutorial.
  // Off = no round 4 context, tools, prompt or writes.
  if (round4 && auth.flags) {
    toolCtx.round4 = {
      sheet,
      flags: {
        graphhopper: auth.flags.enableGraphhopperRoutes === true,
        weatherEnabled: auth.flags.weatherEnabled === true,
        weatherAdminsOnly: auth.flags.weatherAdminsOnly !== false,
      },
      state: carriedRound4 ?? newRound4TurnState(),
    };
  }
  // Kelly phase 3 memory (ai_coach_memory): "מה אני זוכר עליך" in the session block. Off (or a
  // failed read) = no block, the exact prompt as before.
  const memoryBlock =
    auth.flags?.aiCoachMemory === true && !safetyText
      ? await loadMemory(db, uid)
          .then((m) => renderMemoryBlock(m.facts))
          .catch((err) => {
            console.warn('[ai-coach] memory unavailable this turn', err);
            return null;
          })
      : null;
  const todayDow = getIsraelDayOfWeek(now);
  const userTextThisTurn = turnUserText(state);
  // Level-check nudges: never twice in a few days, and "opening" = a new conversation.
  const nudge = nudgeStateFrom(thread.recent, now.getTime());
  const refusedForLevel =
    'toolResult' in body && !body.toolResult.outcome.ok && body.toolResult.outcome.error === 'needs_assessment'
      ? (body.toolResult.outcome.domains ?? [])
      : [];

  const cached = withPromptCaching({
    system: round4 ? coachSystemPrompt({ round4: true }) : COACH_SYSTEM_PROMPT,
    tools: coachToolDefinitions({ scheduleAdvisor, ...(phase2 ? { phase2: true } : {}), ...(round4 ? { round4: true } : {}), ...(builder ? { builder: true } : {}) }),
  });
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
        ...(phase2 ? { phase2: true } : {}),
        ...(memoryBlock ? { memory: memoryBlock } : {}),
        ...(round4 ? { round4Note: ROUND4_NOTE } : {}),
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
            guards: { sheet, todayDow, userGender: gender, ...(round4 ? { round4: true } : {}) },
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
            ...(phase2 && toolCtx.turn.proposal ? { proposal: toolCtx.turn.proposal } : {}),
            ...(toolCtx.round4 ? { round4: toolCtx.round4.state } : {}),
          });
          emit({ type: 'client_tool', id: outcome.call.id, name: outcome.call.name, input: outcome.call.input });
          return;
        }

        // Action chips (e.g. "פתח את הלו״ז" under a schedule answer), decided from the turn.
        const toolCalls = outcome.state.log?.toolCalls ?? [];
        const built = toolCalls.find((c) => c.name === 'generate_workout');
        const builtDomains = (built?.input as { domains?: unknown } | null | undefined)?.domains;
        let actions = chipsForTurn({
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
        let suggestions: SuggestionChip[] = [];
        const proposal = phase2 ? (toolCtx.turn.proposal ?? null) : null;
        if (phase2) {
          const extras = phase2TurnExtras({
            sheet,
            profile,
            gender,
            now,
            todayKey: getIsraelDateKey(now),
            hour: getIsraelHour(now),
            userText: userTextThisTurn,
            toolNames: toolCalls.map((c) => c.name),
            workoutInput: newCard || carriedCards.length ? ((built?.input as Record<string, unknown> | null | undefined) ?? null) : null,
            proposalCreated: !!proposal,
            actions,
          });
          actions = extras.actions;
          suggestions = extras.suggestions;
        }
        const round4Extras = toolCtx.round4 && hasRound4Extras(toolCtx.round4.state.extras) ? toolCtx.round4.state.extras : null;
        if (toolCtx.round4) {
          actions = round4TurnActions({
            state: toolCtx.round4.state,
            toolNames: toolCalls.map((c) => c.name),
            userText: userTextThisTurn,
            workout: builtGap,
            actions,
          });
        }
        if (actions.length) emit({ type: 'actions', actions });
        if (round4Extras) emit({ type: 'round4', extras: round4Extras });
        if (proposal) emit({ type: 'proposal', proposal: proposalView(proposal) });
        if (suggestions.length) emit({ type: 'suggestions', suggestions });

        // Final: ONE assistant message for the whole turn (every round), with its cards.
        const id = await appendMessage(db, uid, {
          role: 'assistant',
          text: outcome.state.turnText.trim(),
          cards: turnCards,
          actions,
          log: outcome.state.log,
          ...(unified ? { source: 'ai' as const } : {}),
          ...(suggestions.length ? { suggestions } : {}),
          ...(proposal ? { proposal } : {}),
          ...(round4Extras ? { round4: round4Extras } : {}),
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
