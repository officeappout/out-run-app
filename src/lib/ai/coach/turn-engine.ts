/**
 * AI coach — one conversation turn as a small state machine. No Firebase, no SDK client:
 * the model call, the server tools and the event sink are injected, so the whole loop is
 * unit-tested with mocks.
 *
 *   user message ─► model ─┬─ text only ─────────────────────────────► final
 *                          ├─ server tool(s) ─► run ─► tool_results ─► model (loop)
 *                          └─ client tool ─► stop: {kind:'client_tool'} (state persisted)
 *   client result ─► resumeWithClientResult() ─► model (loop) ...
 *
 * Limits: at most `maxRounds` tool rounds per turn (client rounds included, counted across
 * the client round trip). The call after the last allowed round is made with
 * tool_choice 'none', so the turn always ends in text and never with a dangling tool_use.
 * tool_choice is only ever 'auto' or 'none' (forced tool choice is rejected on current
 * models).
 *
 * Reply guards (reply-guards.ts): a round's text is buffered and emitted when the round
 * ends, not per delta. The FINAL round's text is checked (grounding, Hebrew only / no
 * internal ids, Kelly's masculine voice, "I can't see it" when a data tool can); on an issue the model is re-prompted ONCE with an
 * internal note (the bad text is never shown). After the retry, foreign words and ids are
 * stripped and feminine self-references are rewritten to the masculine. A tool round's
 * short preamble only gets the strip + rewrite. Every intervention lands in
 * `state.log.guards`.
 *
 * Review log: `state.log` collects the model id, token usage, every tool call (validated
 * input + a compact result summary) and the guard interventions of the whole turn, across
 * the client-tool round trip; the route saves it on the assistant message as `log`.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { CoachStreamEvent } from './protocol';
import type { UserContextSheet } from './context-sheet';
import { toolKind, validateToolInput, type ClientToolOutcome } from './tools';
import { checkReply, correctionNote, dropHebrewlessSentences, factsFromEvidence, findForeignWords, stripForeignWords, type ReplyIssue } from './reply-guards';
import { masculinizeSelfReferences } from './gender-voice';
import type { CoachGender } from './persona';

export const REFUSAL_TEXT = 'על זה אני לא יכול לעזור. אפשר לשאול אותי על אימונים, התקדמות ותוכנית השבוע.';
export const EMPTY_TEXT = 'לא הצלחתי לנסח תשובה הפעם. אפשר לנסות שוב במילים אחרות.';
export const TRUNCATED_TOOL_TEXT = 'משהו נקטע באמצע. אפשר לבקש שוב?';

/** Short chat replies: thinking off (allowed on Haiku at effort ≤ high), effort low. */
export const COACH_THINKING: Anthropic.ThinkingConfigParam = { type: 'disabled' };
export const COACH_EFFORT = 'low' as const;

export interface ToolExecResult {
  content: string;
  isError?: boolean;
}

export interface TurnDeps {
  /** Streams one model call; calls onText per text delta; resolves with the final message. */
  callModel(params: Anthropic.MessageStreamParams, onText: (delta: string) => void): Promise<Anthropic.Message>;
  executeServerTool(name: string, input: unknown): Promise<ToolExecResult>;
  /** Last server-side shaping of a validated client-tool input (e.g. strip gear the user doesn't own). */
  prepareClientTool?(name: string, input: unknown, state: TurnState): unknown;
  emit(event: CoachStreamEvent): void;
}

/** The per-message review log (saved as `log` on assistant messages). */
export interface TurnLog {
  model: string;
  usage: { in: number; out: number; cacheRead: number };
  toolCalls: Array<{ name: string; input: unknown; resultSummary: string }>;
  guards: Array<{ type: string; action: string }>;
}

export function newTurnLog(model = ''): TurnLog {
  return { model, usage: { in: 0, out: 0, cacheRead: 0 }, toolCalls: [], guards: [] };
}

export interface TurnGuardConfig {
  /** The user sheet pre-loaded into this turn's system prompt (null when it failed to load). */
  sheet: UserContextSheet | null;
  /** Israel weekday today, 0 = Sunday. */
  todayDow: number;
  /** The user's grammatical gender (the feminine-voice check is stricter when not female). */
  userGender?: CoachGender | null;
}

export interface TurnConfig {
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  /** Earlier turns (plain text), oldest first, starting with a user message. */
  history: Anthropic.MessageParam[];
  maxRounds: number;
  maxTokens: number;
  /** Reply guards. Omitted → only the Hebrew-only check runs (no grounding facts). */
  guards?: TurnGuardConfig;
}

export interface TurnState {
  /** This turn only: the user message, then assistant/tool_result pairs. */
  turnMessages: Anthropic.MessageParam[];
  roundsUsed: number;
  /** All text Kelly said in this turn so far (what gets saved). */
  turnText: string;
  /** Review log for the whole turn (optional for states persisted before it existed). */
  log?: TurnLog;
  /** The one corrective re-prompt of this turn was used. */
  correctionUsed?: boolean;
}

export interface ClientToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type TurnOutcome =
  | { kind: 'final'; state: TurnState; stopReason: Anthropic.StopReason | null }
  | { kind: 'client_tool'; state: TurnState; call: ClientToolCall; pendingResults: Anthropic.ToolResultBlockParam[] };

export function newTurnState(userText: string): TurnState {
  return { turnMessages: [{ role: 'user', content: userText }], roundsUsed: 0, turnText: '', log: newTurnLog() };
}

/** The text of the turn's first user message (the request this turn answers). */
export function turnUserText(state: TurnState): string {
  const first = state.turnMessages[0];
  if (!first || first.role !== 'user') return '';
  if (typeof first.content === 'string') return first.content;
  return first.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join(' ')
    .trim();
}

/** Every tool_result text in this turn so far (the evidence a reply may rely on). */
export function turnToolResultTexts(state: TurnState): string[] {
  const out: string[] = [];
  for (const m of state.turnMessages) {
    if (m.role !== 'user' || typeof m.content === 'string') continue;
    for (const b of m.content) {
      if (b.type !== 'tool_result' || b.is_error) continue;
      if (typeof b.content === 'string') out.push(b.content);
      else if (Array.isArray(b.content)) for (const c of b.content) if (c.type === 'text') out.push(c.text);
    }
  }
  return out;
}

const MAX_SUMMARY = 700;
const PENDING_ON_DEVICE = 'pending_on_device';

/** A compact, review-friendly summary of a tool result (workout results keep the essentials). */
export function summarizeToolResult(name: string, content: string, isError?: boolean): string {
  if (isError) return `error: ${content}`.slice(0, MAX_SUMMARY);
  if (name === 'generate_workout' || name === 'get_workout_details') {
    try {
      const r = JSON.parse(content) as Record<string, unknown>;
      const ex = Array.isArray(r.exercises) ? (r.exercises as Array<Record<string, unknown>>) : [];
      return JSON.stringify({
        workoutId: r.workoutId,
        title: r.title,
        minutes: r.minutes,
        requestedMinutes: r.requestedMinutes,
        location: r.location,
        domains: r.domains,
        levelCeiling: r.levelCeiling,
        exercises: ex.map((e) => [e.name, e.method, e.methodLocation, Array.isArray(e.gear) ? (e.gear as string[]).join('+') : '', e.area].join('|')),
      }).slice(0, MAX_SUMMARY);
    } catch {
      /* fall through */
    }
  }
  return content.slice(0, MAX_SUMMARY);
}

function appendText(state: TurnState, text: string, deps: TurnDeps): void {
  const piece = state.turnText ? `\n${text}` : text;
  deps.emit({ type: 'text', delta: piece });
  state.turnText += piece;
}

export async function runCoachTurn(cfg: TurnConfig, initial: TurnState, deps: TurnDeps): Promise<TurnOutcome> {
  const state: TurnState = {
    turnMessages: [...initial.turnMessages],
    roundsUsed: initial.roundsUsed,
    turnText: initial.turnText,
    log: initial.log ? JSON.parse(JSON.stringify(initial.log)) : newTurnLog(cfg.model),
    correctionUsed: initial.correctionUsed ?? false,
  };
  const log = state.log!;
  log.model = cfg.model;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lastCall = state.roundsUsed >= cfg.maxRounds;
    const params: Anthropic.MessageStreamParams = {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: cfg.system,
      tools: cfg.tools,
      tool_choice: lastCall ? { type: 'none' } : { type: 'auto' },
      thinking: COACH_THINKING,
      output_config: { effort: COACH_EFFORT },
      messages: [...cfg.history, ...state.turnMessages],
    };

    // Buffered: the round's text is validated before anyone sees it.
    let roundText = '';
    const message = await deps.callModel(params, (delta) => {
      if (delta) roundText += delta;
    });
    const u = message.usage as Partial<Anthropic.Usage> | undefined;
    log.usage.in += u?.input_tokens ?? 0;
    log.usage.out += u?.output_tokens ?? 0;
    log.usage.cacheRead += u?.cache_read_input_tokens ?? 0;

    if (message.stop_reason === 'refusal') {
      log.guards.push({ type: 'refusal', action: 'fixed_text' });
      appendText(state, REFUSAL_TEXT, deps);
      return { kind: 'final', state, stopReason: 'refusal' };
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const isFinal = message.stop_reason !== 'tool_use' || toolUses.length === 0 || lastCall;

    // A tool_use cut off by max_tokens may carry a truncated input: never run it.
    if (message.stop_reason === 'max_tokens' && toolUses.length > 0) {
      emitChecked(state, roundText, deps, null);
      appendText(state, TRUNCATED_TOOL_TEXT, deps);
      return { kind: 'final', state, stopReason: 'max_tokens' };
    }

    if (isFinal) {
      const text = roundText.trim();
      if (text) {
        const facts = cfg.guards
          ? factsFromEvidence(cfg.guards.sheet, turnToolResultTexts(state), cfg.guards.todayDow)
          : null;
        const userGender = cfg.guards?.userGender ?? null;
        // "Can't see it" checks need the request and the tools used; only with guards on.
        const blind = cfg.guards
          ? { userText: turnUserText(state), toolNames: (state.log?.toolCalls ?? []).map((c) => c.name) }
          : null;
        const issues = checkReply(text, facts, userGender, blind);
        if (issues.length && !state.correctionUsed) {
          state.correctionUsed = true;
          for (const i of issues) log.guards.push({ type: guardType(i), action: `reprompt: ${issueDetail(i)}` });
          state.turnMessages.push({ role: 'assistant', content: text });
          state.turnMessages.push({ role: 'user', content: correctionNote(issues) });
          continue; // same round budget: a correction is not a tool round
        }
        for (const i of issues) log.guards.push({ type: guardType(i), action: `unresolved_after_retry: ${issueDetail(i)}` });
        emitChecked(state, text, deps, facts?.text ?? '', userGender);
      }
      if (!state.turnText.trim()) appendText(state, EMPTY_TEXT, deps);
      return { kind: 'final', state, stopReason: message.stop_reason };
    }

    // A tool round: its short preamble ("בודק...") is shown, with foreign words stripped.
    emitChecked(state, roundText, deps, null, cfg.guards?.userGender ?? null, true);

    state.turnMessages.push({ role: 'assistant', content: message.content });
    state.roundsUsed++;

    const results: Anthropic.ToolResultBlockParam[] = [];
    const serverCalls: Array<{ id: string; name: string; input: unknown }> = [];
    let clientCall: ClientToolCall | null = null;

    for (const tu of toolUses) {
      const v = validateToolInput(tu.name, tu.input);
      if (!v.ok) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: v.error, is_error: true });
        log.toolCalls.push({ name: tu.name, input: tu.input ?? null, resultSummary: `rejected: ${v.error}`.slice(0, MAX_SUMMARY) });
        continue;
      }
      if (toolKind(tu.name) === 'client') {
        if (clientCall) {
          const content = 'Only one workout can be built at a time. Build the next one after the user sees this one.';
          results.push({ type: 'tool_result', tool_use_id: tu.id, content, is_error: true });
          log.toolCalls.push({ name: tu.name, input: v.input, resultSummary: 'rejected: second client tool in one round' });
          continue;
        }
        clientCall = { id: tu.id, name: tu.name, input: deps.prepareClientTool ? deps.prepareClientTool(tu.name, v.input, state) : v.input };
        log.toolCalls.push({ name: tu.name, input: clientCall.input, resultSummary: PENDING_ON_DEVICE });
        continue;
      }
      serverCalls.push({ id: tu.id, name: tu.name, input: v.input });
    }

    const serverResults = await Promise.all(
      serverCalls.map(async (c): Promise<Anthropic.ToolResultBlockParam> => {
        deps.emit({ type: 'tool_status', name: c.name });
        try {
          const r = await deps.executeServerTool(c.name, c.input);
          log.toolCalls.push({ name: c.name, input: c.input, resultSummary: summarizeToolResult(c.name, r.content, r.isError) });
          return { type: 'tool_result', tool_use_id: c.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        } catch (err) {
          console.error(`[ai-coach] tool ${c.name} failed`, err);
          log.toolCalls.push({ name: c.name, input: c.input, resultSummary: 'error: tool threw' });
          return { type: 'tool_result', tool_use_id: c.id, content: 'The tool failed. Tell the user simply and offer another way.', is_error: true };
        }
      }),
    );
    results.push(...serverResults);

    if (clientCall) {
      return { kind: 'client_tool', state, call: clientCall, pendingResults: results };
    }
    state.turnMessages.push({ role: 'user', content: results });
  }
}

function guardType(i: ReplyIssue): string {
  switch (i.kind) {
    case 'ungrounded':
      return 'grounding';
    case 'foreign':
      return 'hebrew_only';
    case 'feminine':
      return 'masculine_voice';
    case 'blind':
      return 'tool_routing';
  }
}

function issueDetail(i: ReplyIssue): string {
  const parts =
    i.kind === 'ungrounded' ? i.claims : i.kind === 'foreign' ? i.words : i.kind === 'feminine' ? i.forms : [`${i.claim} → ${i.tools.join('+')}`];
  return parts.join(', ').slice(0, 200);
}

/**
 * Emits `text` (if any) after stripping foreign words / internal ids and rewriting
 * feminine self-references to the masculine; logs each intervention.
 */
function emitChecked(
  state: TurnState,
  text: string,
  deps: TurnDeps,
  evidenceText: string | null,
  userGender: CoachGender | null = null,
  preTool = false,
): void {
  let t = text.trim();
  if (!t) return;
  const words = findForeignWords(t, evidenceText ?? '');
  if (words.length) {
    t = stripForeignWords(t, words);
    state.log?.guards.push({ type: 'hebrew_only', action: `stripped: ${words.join(', ').slice(0, 200)}` });
    // A tool-round preamble is optional: a sentence left with no Hebrew is dropped, never
    // shown as bare punctuation (",." at the start of a reply).
    if (preTool) t = dropHebrewlessSentences(t);
  }
  const masc = masculinizeSelfReferences(t, userGender);
  if (masc.changed.length) {
    t = masc.text;
    state.log?.guards.push({ type: 'masculine_voice', action: `rewritten: ${masc.changed.join(', ').slice(0, 200)}` });
  }
  if (t) appendText(state, t, deps);
}

/** What the model reads back from a generate_workout outcome. */
export function clientOutcomeToToolResult(id: string, outcome: ClientToolOutcome): Anthropic.ToolResultBlockParam {
  if (outcome.ok) {
    // The decision record stays server-side (explain_workout reads it from the card).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { decisionRecord: _dr, ...result } = outcome.result;
    const notes: string[] = [];
    if (result.requestedMinutes && Math.abs(result.minutes - result.requestedMinutes) >= 2) {
      // requestedMinutes is what the MODEL sent: often its own default, not the user's words
      // (owner thread 18.10.2026: "11 דקות ולא 15 כמו שביקשת" when no length was asked).
      notes.push(
        `The real length is ${result.minutes} minutes (warm-up and cool-down included); you asked the engine for ${result.requestedMinutes}. Say the real minutes. Mention the difference only if the user named a length in this conversation; never say the user asked for ${result.requestedMinutes} if they did not.`,
      );
    }
    if (result.levelCeiling) {
      notes.push(
        `There is less content at the user's level for this location, so the engine built it a bit below their level. Say so in one short sentence, like: ${result.location === 'home' ? 'בבית יש פחות תרגילים ברמה שלך, אז בניתי' : 'כאן יש פחות תרגילים ברמה שלך, אז בניתי'} ... Never call it a high-level workout.`,
      );
    }
    if (result.budgetLight) {
      notes.push(
        `The user already did most of their strength sets ${result.budgetLight === 'daily_spent' ? 'today' : 'this week'}, so the engine made this a lighter strength session (fewer sets, easier). Say why in one short sentence, like: ${result.budgetLight === 'daily_spent' ? 'היום כבר עשית את הכוח שלך, אז עכשיו משהו קל יותר כדי שהשרירים יתאוששו' : 'השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר כדי שהשרירים יתאוששו'}`,
      );
    }
    if (result.shortOfMinimum) {
      notes.push('Fewer exercises than usual were available for this request at this location. Say it simply and offer a different area or location.');
    }
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: JSON.stringify({ shownToUserAsCard: true, ...result, ...(notes.length ? { notesForCoach: notes } : {}) }),
    };
  }
  const why: Record<typeof outcome.error, string> = {
    needs_assessment: `The engine needs a short level check first for: ${(outcome.domains ?? []).join(', ') || 'this area'}. Tell the user in one short sentence that a short level check unlocks it and that the app shows a button under your reply that starts it, or offer a workout without that area.`,
    generation_failed: 'The workout engine could not build this workout. Tell the user simply and offer to try other settings or the workout builder.',
    invalid_input: 'The request was not valid for the engine. Try once more with simpler settings.',
    offline: 'The device is offline. Tell the user the workout builder works offline.',
  };
  return { type: 'tool_result', tool_use_id: id, content: why[outcome.error], is_error: true };
}

/** Continue a turn after the device answered a client tool. */
export function resumeWithClientResult(
  state: TurnState,
  pendingResults: Anthropic.ToolResultBlockParam[],
  clientResult: Anthropic.ToolResultBlockParam,
  toolName = 'generate_workout',
): TurnState {
  const log: TurnLog = state.log ? JSON.parse(JSON.stringify(state.log)) : newTurnLog();
  // The input the device ran: the tool_use block of the last assistant message.
  let input: unknown = null;
  for (let i = state.turnMessages.length - 1; i >= 0 && input === null; i--) {
    const m = state.turnMessages[i];
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    const tu = m.content.find((b) => b.type === 'tool_use' && b.id === clientResult.tool_use_id) as Anthropic.ToolUseBlockParam | undefined;
    if (tu) input = tu.input ?? null;
  }
  const content = typeof clientResult.content === 'string' ? clientResult.content : JSON.stringify(clientResult.content ?? '');
  const summary = summarizeToolResult(toolName, content, clientResult.is_error);
  const pendingEntry = [...log.toolCalls].reverse().find((c) => c.name === toolName && c.resultSummary === PENDING_ON_DEVICE);
  if (pendingEntry) pendingEntry.resultSummary = summary;
  else log.toolCalls.push({ name: toolName, input, resultSummary: summary });
  return {
    turnMessages: [...state.turnMessages, { role: 'user', content: [...pendingResults, clientResult] }],
    roundsUsed: state.roundsUsed,
    turnText: state.turnText,
    log,
    correctionUsed: state.correctionUsed ?? false,
  };
}

// ─── History (stored messages → model messages) ─────────────────────────────

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
  cards?: Array<{ workoutId: string; title: string; minutes: number; exerciseCount: number }>;
}

/**
 * Stored text messages → alternating plain-text MessageParams for the model. Cards become
 * a short bracketed note so the model knows which workoutId it can explain. Leading
 * assistant messages are dropped (the list must start with the user), and consecutive
 * same-role messages are merged.
 */
export function historyToModelMessages(msgs: HistoryMessage[]): Anthropic.MessageParam[] {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of msgs) {
    let text = (m.text ?? '').trim();
    if (m.role === 'assistant' && m.cards?.length) {
      const notes = m.cards.map((c) => `[כרטיס אימון הוצג: ${c.title}, ${c.minutes} דקות, ${c.exerciseCount} תרגילים, workoutId=${c.workoutId}]`);
      text = [text, ...notes].filter(Boolean).join('\n');
    }
    if (!text) continue;
    if (out.length === 0 && m.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  // The new user message follows, so the history must end with an assistant turn.
  while (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}
