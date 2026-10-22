/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runAdminTurn, REFUSAL_TEXT_HE } from '../turn';
import { FINAL_ROUND_NOTE } from '../prompt';
import { ADMIN_AI_MAX_TOKENS_FINAL, ADMIN_AI_MAX_TOKENS_TOOL_ROUND } from '../limits';
import type { AdminToolExecution } from '../execute.server';

type Block = Anthropic.ContentBlock;
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 } as Anthropic.Usage;
const msg = (content: Block[], stop: Anthropic.StopReason = 'end_turn'): Anthropic.Message =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, stop_sequence: null, usage }) as unknown as Anthropic.Message;
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown = {}) => ({ type: 'tool_use', id, name, input }) as unknown as Block;

const okTool = (over: Partial<AdminToolExecution> = {}): AdminToolExecution => ({ content: '<tool_data>{"value":{"total":7}}</tool_data>', isError: false, resultChars: 20, truncated: false, ...over });

function harness(
  replies: Array<{ message: Anthropic.Message; cost?: number; textDelta?: string }>,
  exec: (name: string, input?: unknown) => Promise<AdminToolExecution> = vi.fn(async () => okTool()),
) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const events: unknown[] = [];
  const callModel = vi.fn(async (params: Anthropic.MessageStreamParams, onText: (d: string) => void) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = replies[calls.length - 1];
    if (r.textDelta) onText(r.textDelta);
    return { message: r.message, costUsd: r.cost ?? 0.005 };
  });
  return { calls, events, callModel, exec, deps: { callModel, executeTool: exec, emit: (e: unknown) => events.push(e) } };
}

const input = {
  model: 'claude-sonnet-5-5',
  system: [{ type: 'text' as const, text: 'rules', cache_control: { type: 'ephemeral' as const } }],
  tools: [{ name: 'get_pending_approvals', description: 'x', input_schema: { type: 'object' as const, properties: {} } }],
  messages: [{ role: 'user' as const, content: 'כמה ממתינים?' }],
};

describe('runAdminTurn — caps and loop shape', () => {
  it('a plain answer = one call, tools offered (auto), max_tokens 400, effort medium', async () => {
    const h = harness([{ message: msg([text('שלום')]), textDelta: 'שלום' }]);
    const out = await runAdminTurn(input, h.deps as any);
    expect(out.modelCalls).toBe(1);
    expect(out.text).toBe('שלום');
    expect(h.calls[0].tool_choice).toEqual({ type: 'auto' });
    expect(h.calls[0].max_tokens).toBe(ADMIN_AI_MAX_TOKENS_TOOL_ROUND);
    expect((h.calls[0] as any).output_config).toEqual({ effort: 'medium' });
    expect((h.calls[0] as any).thinking).toBeUndefined();
  });

  it('two tool rounds, then ONE final call with tool_choice none + the 900 cap + the limit note', async () => {
    const h = harness([
      { message: msg([toolUse('t1', 'get_pending_approvals')], 'tool_use') },
      { message: msg([toolUse('t2', 'get_pending_approvals')], 'tool_use') },
      { message: msg([text('סיכום')]), textDelta: 'סיכום' },
    ]);
    const out = await runAdminTurn(input, h.deps as any);
    expect(out.modelCalls).toBe(3);
    expect(h.calls.map((c) => c.tool_choice)).toEqual([{ type: 'auto' }, { type: 'auto' }, { type: 'none' }]);
    expect(h.calls[2].max_tokens).toBe(ADMIN_AI_MAX_TOKENS_FINAL);
    const last = h.calls[2].messages[h.calls[2].messages.length - 1];
    expect(JSON.stringify(last.content)).toContain(FINAL_ROUND_NOTE);
    expect(out.stoppedBy).toBe('max_calls');
  });

  it('the tool list and system are byte-identical on every call (cached prefix)', async () => {
    const h = harness([
      { message: msg([toolUse('t1', 'get_pending_approvals')], 'tool_use') },
      { message: msg([text('ok')]) },
    ]);
    await runAdminTurn(input, h.deps as any);
    expect(JSON.stringify(h.calls[0].tools)).toBe(JSON.stringify(h.calls[1].tools));
    expect(JSON.stringify(h.calls[0].system)).toBe(JSON.stringify(h.calls[1].system));
  });

  it('per-question cap: over $0.05 after the first call → the next call has no tools', async () => {
    const h = harness([
      { message: msg([toolUse('t1', 'get_pending_approvals')], 'tool_use'), cost: 0.06 },
      { message: msg([text('עם מה שיש')]) },
    ]);
    const out = await runAdminTurn(input, h.deps as any);
    expect(h.calls[1].tool_choice).toEqual({ type: 'none' });
    expect(out.stoppedBy).toBe('question_cap');
    expect(out.modelCalls).toBe(2);
  });

  it('parallel tool calls run together and return in ONE user message; errors are is_error', async () => {
    const exec = vi.fn(async (name: string) => (name === 'bad' ? okTool({ isError: true, content: '<tool_data>{"error":"x"}</tool_data>' }) : okTool()));
    const h = harness([
      { message: msg([toolUse('a', 'get_pending_approvals'), toolUse('b', 'bad')], 'tool_use') },
      { message: msg([text('done')]) },
    ], exec);
    await runAdminTurn(input, h.deps as any);
    expect(exec).toHaveBeenCalledTimes(2);
    const userMsg = h.calls[1].messages[h.calls[1].messages.length - 1];
    const results = (userMsg.content as any[]).filter((b) => b.type === 'tool_result');
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tool_use_id === 'b').is_error).toBe(true);
  });

  it('refusal → the fixed Hebrew line, no more calls', async () => {
    const h = harness([{ message: msg([], 'refusal') }]);
    const out = await runAdminTurn(input, h.deps as any);
    expect(out.text).toBe(REFUSAL_TEXT_HE);
    expect(out.stoppedBy).toBe('refusal');
    expect(h.calls).toHaveLength(1);
  });

  it('a tool round that runs out of tokens with nothing said → one forced final call (no tools)', async () => {
    const h = harness([
      { message: msg([{ type: 'thinking', thinking: '', signature: 's' } as unknown as Block], 'max_tokens') },
      { message: msg([text('תשובה')]), textDelta: 'תשובה' },
    ]);
    const out = await runAdminTurn(input, h.deps as any);
    expect(h.calls[1].tool_choice).toEqual({ type: 'none' });
    expect(h.calls[1].messages).toHaveLength(1); // the truncated response is not replayed
    expect(out.text).toBe('תשובה');
  });

  it('collects links and evidence from tools; usage is summed', async () => {
    const exec = vi.fn(async () => okTool({ link: { href: '/admin/costs', title: 'עלויות', pageId: 'admin/costs' }, evidence: { tool: 't', definitionId: 'ai_cost', period: { from: null, to: '2026-10-22', tz: 'Asia/Jerusalem' }, n: null, belowThreshold: false, caveats: [], numbers: [1] } }));
    const h = harness([{ message: msg([toolUse('a', 'navigate')], 'tool_use') }, { message: msg([text('הנה')]) }], exec);
    const out = await runAdminTurn(input, h.deps as any);
    expect(out.links).toEqual([{ href: '/admin/costs', title: 'עלויות', pageId: 'admin/costs' }]);
    expect(out.evidence).toHaveLength(1);
    expect(out.usage.cacheReadTokens).toBe(100);
    expect(h.events).toContainEqual({ type: 'link', href: '/admin/costs', title: 'עלויות', pageId: 'admin/costs' });
  });
});
