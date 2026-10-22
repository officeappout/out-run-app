/**
 * turn — the admin assistant's small tool loop for ONE question (plan §2.5). Pure: the model
 * call and the tool executor are injected, so the caps are unit-tested without the API.
 *
 *   - ≤ ADMIN_AI_MAX_MODEL_CALLS model calls; tools are offered while nextToolRound() allows
 *     (calls left AND estimated spend < the per-question cap), then ONE last call with
 *     tool_choice 'none' so the model sums up with what it has.
 *   - The tool list stays identical on every call (it is the cached prefix); only tool_choice
 *     changes.
 *   - Parallel tool calls run together and go back in ONE user message; a failure is a
 *     tool_result with is_error.
 *   - stop_reason 'refusal' → a fixed Hebrew line, no more calls.
 *   - max_tokens: 400 on a call that may still use tools, 900 on the final answer.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  ADMIN_AI_MAX_MODEL_CALLS,
  ADMIN_AI_MAX_TOKENS_FINAL,
  ADMIN_AI_MAX_TOKENS_TOOL_ROUND,
  nextToolRound,
  type NextRoundDecision,
} from './limits';
import { FINAL_ROUND_NOTE } from './prompt';
import type { AdminToolExecution } from './execute.server';
import type { AdminAssistantEvent, EvidenceItem } from './sse';

export const REFUSAL_TEXT_HE = 'לא אוכל לענות על זה כאן.';

export interface TurnDeps {
  callModel: (params: Anthropic.MessageStreamParams, onText: (delta: string) => void) => Promise<{ message: Anthropic.Message; costUsd: number }>;
  executeTool: (name: string, input: unknown) => Promise<AdminToolExecution>;
  emit: (ev: AdminAssistantEvent) => void;
}

export interface TurnInput {
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  /** history + the new user question (last) */
  messages: Anthropic.MessageParam[];
}

export interface TurnToolLog {
  name: string;
  input: string;
  resultChars: number;
  isError: boolean;
  truncated: boolean;
}

export interface TurnOutcome {
  text: string;
  costUsd: number;
  modelCalls: number;
  tools: TurnToolLog[];
  evidence: EvidenceItem[];
  links: Array<{ href: string; title: string; pageId: string }>;
  stoppedBy: 'end' | 'refusal' | 'max_calls' | 'question_cap' | 'max_tokens';
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

export async function runAdminTurn(input: TurnInput, deps: TurnDeps): Promise<TurnOutcome> {
  const messages: Anthropic.MessageParam[] = [...input.messages];
  const out: TurnOutcome = {
    text: '',
    costUsd: 0,
    modelCalls: 0,
    tools: [],
    evidence: [],
    links: [],
    stoppedBy: 'end',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  let forceFinal = false;

  while (out.modelCalls < ADMIN_AI_MAX_MODEL_CALLS) {
    const decision: NextRoundDecision = nextToolRound(out.modelCalls, out.costUsd);
    const toolsAllowed = !forceFinal && decision.allowed;
    const params: Anthropic.MessageStreamParams = {
      model: input.model,
      max_tokens: toolsAllowed ? ADMIN_AI_MAX_TOKENS_TOOL_ROUND : ADMIN_AI_MAX_TOKENS_FINAL,
      system: input.system,
      tools: input.tools,
      tool_choice: toolsAllowed ? { type: 'auto' } : { type: 'none' },
      output_config: { effort: 'medium' },
      messages,
    };
    const { message, costUsd } = await deps.callModel(params, (delta) => {
      out.text += delta;
      deps.emit({ type: 'text', delta });
    });
    out.modelCalls += 1;
    out.costUsd += costUsd;
    const u = message.usage;
    out.usage.inputTokens += u.input_tokens ?? 0;
    out.usage.outputTokens += u.output_tokens ?? 0;
    out.usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    out.usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === 'refusal') {
      out.stoppedBy = 'refusal';
      if (!out.text.trim()) {
        out.text = REFUSAL_TEXT_HE;
        deps.emit({ type: 'text', delta: REFUSAL_TEXT_HE });
      }
      return out;
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolsAllowed || toolUses.length === 0) {
      if (message.stop_reason === 'max_tokens' && !out.text.trim() && toolsAllowed) {
        // A tool round ran out of tokens (thinking) before answering or picking a tool: retry
        // the same messages ONCE as the final call (no tools, the larger cap), inside the same
        // call budget. The truncated response is dropped, not replayed.
        forceFinal = true;
        out.stoppedBy = 'max_tokens';
        continue;
      }
      if (message.stop_reason === 'max_tokens') out.stoppedBy = 'max_tokens';
      return out;
    }

    // Run every requested tool, together; results go back in ONE user message.
    messages.push({ role: 'assistant', content: message.content });
    const results = await Promise.all(
      toolUses.map(async (tu) => {
        deps.emit({ type: 'tool', name: tu.name, status: 'start' });
        const r = await deps.executeTool(tu.name, tu.input);
        deps.emit({ type: 'tool', name: tu.name, status: r.isError ? 'error' : 'done' });
        out.tools.push({ name: tu.name, input: JSON.stringify(tu.input ?? {}).slice(0, 300), resultChars: r.resultChars, isError: r.isError, truncated: r.truncated });
        for (const link of [...(r.link ? [r.link] : []), ...(r.links ?? [])]) {
          out.links.push(link);
          deps.emit({ type: 'link', ...link });
        }
        if (r.evidence) out.evidence.push(r.evidence);
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
      }),
    );
    const next = nextToolRound(out.modelCalls, out.costUsd);
    const userContent: Anthropic.ContentBlockParam[] = [...results];
    if (!next.allowed) {
      userContent.push({ type: 'text', text: FINAL_ROUND_NOTE });
      out.stoppedBy = next.reason;
    }
    messages.push({ role: 'user', content: userContent });
  }
  return out;
}
