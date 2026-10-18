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
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { CoachStreamEvent } from './protocol';
import { toolKind, validateToolInput, type ClientToolOutcome } from './tools';

export const REFUSAL_TEXT = 'על זה אני לא יכולה לעזור. אפשר לשאול אותי על אימונים, התקדמות ותוכנית השבוע.';
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
  prepareClientTool?(name: string, input: unknown): unknown;
  emit(event: CoachStreamEvent): void;
}

export interface TurnConfig {
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  /** Earlier turns (plain text), oldest first, starting with a user message. */
  history: Anthropic.MessageParam[];
  maxRounds: number;
  maxTokens: number;
}

export interface TurnState {
  /** This turn only: the user message, then assistant/tool_result pairs. */
  turnMessages: Anthropic.MessageParam[];
  roundsUsed: number;
  /** All text Kelly said in this turn so far (what gets saved). */
  turnText: string;
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
  return { turnMessages: [{ role: 'user', content: userText }], roundsUsed: 0, turnText: '' };
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
  };

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

    // A new round's first delta starts on a new line after earlier text in this turn.
    let needSep = state.turnText.length > 0;
    const message = await deps.callModel(params, (delta) => {
      if (!delta) return;
      const piece = needSep ? `\n${delta}` : delta;
      needSep = false;
      deps.emit({ type: 'text', delta: piece });
      state.turnText += piece;
    });

    if (message.stop_reason === 'refusal') {
      appendText(state, REFUSAL_TEXT, deps);
      return { kind: 'final', state, stopReason: 'refusal' };
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    // A tool_use cut off by max_tokens may carry a truncated input: never run it.
    if (message.stop_reason === 'max_tokens' && toolUses.length > 0) {
      appendText(state, TRUNCATED_TOOL_TEXT, deps);
      return { kind: 'final', state, stopReason: 'max_tokens' };
    }

    if (message.stop_reason !== 'tool_use' || toolUses.length === 0 || lastCall) {
      if (!state.turnText.trim()) appendText(state, EMPTY_TEXT, deps);
      return { kind: 'final', state, stopReason: message.stop_reason };
    }

    state.turnMessages.push({ role: 'assistant', content: message.content });
    state.roundsUsed++;

    const results: Anthropic.ToolResultBlockParam[] = [];
    const serverCalls: Array<{ id: string; name: string; input: unknown }> = [];
    let clientCall: ClientToolCall | null = null;

    for (const tu of toolUses) {
      const v = validateToolInput(tu.name, tu.input);
      if (!v.ok) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: v.error, is_error: true });
        continue;
      }
      if (toolKind(tu.name) === 'client') {
        if (clientCall) {
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Only one workout can be built at a time. Build the next one after the user sees this one.',
            is_error: true,
          });
          continue;
        }
        clientCall = { id: tu.id, name: tu.name, input: deps.prepareClientTool ? deps.prepareClientTool(tu.name, v.input) : v.input };
        continue;
      }
      serverCalls.push({ id: tu.id, name: tu.name, input: v.input });
    }

    const serverResults = await Promise.all(
      serverCalls.map(async (c): Promise<Anthropic.ToolResultBlockParam> => {
        deps.emit({ type: 'tool_status', name: c.name });
        try {
          const r = await deps.executeServerTool(c.name, c.input);
          return { type: 'tool_result', tool_use_id: c.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        } catch (err) {
          console.error(`[ai-coach] tool ${c.name} failed`, err);
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

/** What the model reads back from a generate_workout outcome. */
export function clientOutcomeToToolResult(id: string, outcome: ClientToolOutcome): Anthropic.ToolResultBlockParam {
  if (outcome.ok) {
    // The decision record stays server-side (explain_workout reads it from the card).
    const { workoutId, title, minutes, location, exercises } = outcome.result;
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: JSON.stringify({ shownToUserAsCard: true, workoutId, title, minutes, location, exercises }),
    };
  }
  const why: Record<typeof outcome.error, string> = {
    needs_assessment: `The engine needs a short level check first for: ${(outcome.domains ?? []).join(', ') || 'this area'}. Tell the user to open the workout builder in the app to unlock it, or offer a workout without that area.`,
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
): TurnState {
  return {
    turnMessages: [...state.turnMessages, { role: 'user', content: [...pendingResults, clientResult] }],
    roundsUsed: state.roundsUsed,
    turnText: state.turnText,
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
