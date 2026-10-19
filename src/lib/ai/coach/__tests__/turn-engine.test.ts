import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  EMPTY_TEXT,
  REFUSAL_TEXT,
  TRUNCATED_TOOL_TEXT,
  clientOutcomeToToolResult,
  historyToModelMessages,
  newTurnState,
  resumeWithClientResult,
  runCoachTurn,
  type TurnConfig,
  type TurnDeps,
} from '../turn-engine';
import type { CoachStreamEvent } from '../protocol';
import { dropHebrewlessSentences } from '../reply-guards';

// ─── Mock model: a scripted queue of responses (shaped like SDK Messages) ──────

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

function msg(stop: Anthropic.StopReason, ...content: Block[]): Anthropic.Message {
  return {
    id: 'msg_x',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    stop_reason: stop,
    stop_sequence: null,
    content: content.map((b) => (b.type === 'text' ? { ...b, citations: null } : b)),
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message;
}

function harness(script: Anthropic.Message[], serverTool?: TurnDeps['executeServerTool']) {
  const events: CoachStreamEvent[] = [];
  const calls: Anthropic.MessageStreamParams[] = [];
  const deps: TurnDeps = {
    emit: (e) => events.push(e),
    callModel: vi.fn(async (params, onText) => {
      calls.push(JSON.parse(JSON.stringify(params)));
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      for (const b of next.content) if (b.type === 'text') onText(b.text);
      return next;
    }),
    executeServerTool: serverTool ?? vi.fn(async () => ({ content: '{"ok":true}' })),
  };
  return { deps, events, calls };
}

const CFG: TurnConfig = {
  model: 'claude-haiku-5-5',
  system: [{ type: 'text', text: 'sys' }],
  tools: [],
  history: [],
  maxRounds: 3,
  maxTokens: 600,
};

const WORKOUT_INPUT = { durationMin: 25, location: 'home', difficulty: 2, domains: ['core', 'legs'] };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runCoachTurn', () => {
  it('text-only answer → final, streamed, params use auto tool choice, thinking off, effort low', async () => {
    const { deps, events, calls } = harness([msg('end_turn', { type: 'text', text: 'היי' })]);
    const out = await runCoachTurn(CFG, newTurnState('שלום'), deps);
    expect(out.kind).toBe('final');
    expect(out.state.turnText).toBe('היי');
    expect(events).toEqual([{ type: 'text', delta: 'היי' }]);
    expect(calls[0].tool_choice).toEqual({ type: 'auto' });
    expect(calls[0].thinking).toEqual({ type: 'disabled' });
    expect(calls[0].output_config).toEqual({ effort: 'low' });
    expect(calls[0].max_tokens).toBe(600);
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'שלום' }]);
  });

  it('server tool round: executes, feeds tool_result back, then answers', async () => {
    const exec = vi.fn(async () => ({ content: '{"workouts":3}' }));
    const { deps, events, calls } = harness(
      [
        msg('tool_use', { type: 'text', text: 'בודקת.' }, { type: 'tool_use', id: 'tu1', name: 'get_progress', input: { range: 'week' } }),
        msg('end_turn', { type: 'text', text: 'השבוע היו 3 אימונים.' }),
      ],
      exec,
    );
    const out = await runCoachTurn(CFG, newTurnState('איך אני מתקדם?'), deps);
    expect(exec).toHaveBeenCalledWith('get_progress', { range: 'week' });
    expect(out.kind).toBe('final');
    expect(out.state.roundsUsed).toBe(1);
    expect(out.state.turnText).toBe('בודקת.\nהשבוע היו 3 אימונים.');
    expect(events).toContainEqual({ type: 'tool_status', name: 'get_progress' });
    const second = calls[1].messages;
    expect(second[1].role).toBe('assistant');
    expect(second[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"workouts":3}' }] });
  });

  it('invalid tool input is never executed; the model gets an is_error result', async () => {
    const exec = vi.fn();
    const { deps, calls } = harness(
      [
        msg('tool_use', { type: 'tool_use', id: 'tu1', name: 'get_schedule', input: { from: '2026-10-01', to: '2026-12-01' } }),
        msg('end_turn', { type: 'text', text: 'אוקיי' }),
      ],
      exec as any,
    );
    await runCoachTurn(CFG, newTurnState('מה בתוכנית?'), deps);
    expect(exec).not.toHaveBeenCalled();
    const tr = (calls[1].messages[2].content as any[])[0];
    expect(tr).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1', is_error: true });
    expect(tr.content).toMatch(/at most 14 days/);
  });

  it('client tool: stops with the call (input sanitized by prepareClientTool) and keeps server results pending', async () => {
    const exec = vi.fn(async () => ({ content: '{"firstName":"דנה"}' }));
    const { deps, events } = harness(
      [
        msg(
          'tool_use',
          { type: 'text', text: 'בונה לך אימון.' },
          { type: 'tool_use', id: 'ctx1', name: 'get_user_context', input: {} },
          { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: { ...WORKOUT_INPUT, equipment: ['laser'] } },
        ),
      ],
      exec,
    );
    deps.prepareClientTool = (_n, input) => ({ ...(input as object), equipment: [] });
    const out = await runCoachTurn(CFG, newTurnState('אימון בטן ורגליים בבית'), deps);
    expect(out.kind).toBe('client_tool');
    if (out.kind !== 'client_tool') return;
    expect(out.call).toEqual({ id: 'gw1', name: 'generate_workout', input: { ...WORKOUT_INPUT, equipment: [] } });
    expect(out.pendingResults).toEqual([{ type: 'tool_result', tool_use_id: 'ctx1', content: '{"firstName":"דנה"}' }]);
    expect(out.state.roundsUsed).toBe(1);
    expect(out.state.turnMessages.at(-1)?.role).toBe('assistant');
    // The engine itself never emits client_tool (the route does, after saving pending).
    expect(events.some((e) => e.type === 'client_tool')).toBe(false);
  });

  it('client_tool round trip: resume with the device result, then the model describes the card', async () => {
    const first = harness([
      msg('tool_use', { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: WORKOUT_INPUT }),
    ]);
    const paused = await runCoachTurn(CFG, newTurnState('אימון בטן ורגליים בבית'), first.deps);
    if (paused.kind !== 'client_tool') throw new Error('expected client_tool');

    // Persisted + reloaded between requests (JSON round trip, like Firestore pending.json).
    const saved = JSON.parse(JSON.stringify({ state: paused.state, pendingResults: paused.pendingResults }));
    const result = clientOutcomeToToolResult('gw1', {
      ok: true,
      result: {
        workoutId: 'ai-abc-123456',
        title: 'אימון בטן ורגליים',
        minutes: 25,
        location: 'home',
        exercises: [{ name: 'סקוואט', sets: 3, reps: 12, seconds: null }],
        decisionRecord: { v: 1, seed: 1, reasons: [], expect: {} },
      },
    });
    expect(String(result.content)).not.toContain('decisionRecord');
    const resumed = resumeWithClientResult(saved.state, saved.pendingResults, result);

    const second = harness([msg('end_turn', { type: 'text', text: 'בניתי לך 25 דקות. לחץ על הכרטיס.' })]);
    const out = await runCoachTurn(CFG, resumed, second.deps);
    expect(out.kind).toBe('final');
    expect(out.state.roundsUsed).toBe(1);
    const sent = second.calls[0].messages;
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect((sent[2].content as any[])[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'gw1' });
  });

  it('after maxRounds the next call forbids tools (tool_choice none) and the turn ends in text', async () => {
    const tu = (id: string) => msg('tool_use', { type: 'tool_use', id, name: 'get_user_context', input: {} });
    const { deps, calls } = harness([tu('a'), tu('b'), tu('c'), msg('end_turn', { type: 'text', text: 'סיימתי' })]);
    const out = await runCoachTurn(CFG, newTurnState('?'), deps);
    expect(out.kind).toBe('final');
    expect(calls.map((c) => c.tool_choice)).toEqual([{ type: 'auto' }, { type: 'auto' }, { type: 'auto' }, { type: 'none' }]);
    expect(out.state.roundsUsed).toBe(3);
  });

  it('rounds are counted across the client round trip', async () => {
    const { deps, calls } = harness([msg('end_turn', { type: 'text', text: 'אוקיי' })]);
    await runCoachTurn(CFG, { ...newTurnState('x'), roundsUsed: 3 }, deps);
    expect(calls[0].tool_choice).toEqual({ type: 'none' });
  });

  it('refusal → fixed polite text', async () => {
    const { deps } = harness([msg('refusal')]);
    const out = await runCoachTurn(CFG, newTurnState('x'), deps);
    expect(out.state.turnText).toBe(REFUSAL_TEXT);
  });

  it('tool_use truncated by max_tokens is never run', async () => {
    const exec = vi.fn();
    const { deps } = harness([msg('max_tokens', { type: 'tool_use', id: 'x', name: 'get_progress', input: { range: 'week' } })], exec as any);
    const out = await runCoachTurn(CFG, newTurnState('x'), deps);
    expect(exec).not.toHaveBeenCalled();
    expect(out.state.turnText).toBe(TRUNCATED_TOOL_TEXT);
  });

  it('empty answer → fallback text', async () => {
    const { deps } = harness([msg('end_turn')]);
    const out = await runCoachTurn(CFG, newTurnState('x'), deps);
    expect(out.state.turnText).toBe(EMPTY_TEXT);
  });

  it('a throwing server tool becomes an is_error result, not a crash', async () => {
    const { deps, calls } = harness(
      [
        msg('tool_use', { type: 'tool_use', id: 't', name: 'get_progress', input: { range: 'week' } }),
        msg('end_turn', { type: 'text', text: 'לא הצלחתי לבדוק.' }),
      ],
      vi.fn(async () => {
        throw new Error('firestore down');
      }),
    );
    const out = await runCoachTurn(CFG, newTurnState('x'), deps);
    expect(out.kind).toBe('final');
    expect((calls[1].messages[2].content as any[])[0].is_error).toBe(true);
  });

  it('two generate_workout calls in one message: only the first runs', async () => {
    const { deps } = harness([
      msg(
        'tool_use',
        { type: 'tool_use', id: 'g1', name: 'generate_workout', input: WORKOUT_INPUT },
        { type: 'tool_use', id: 'g2', name: 'generate_workout', input: WORKOUT_INPUT },
      ),
    ]);
    const out = await runCoachTurn(CFG, newTurnState('x'), deps);
    if (out.kind !== 'client_tool') throw new Error('expected client_tool');
    expect(out.call.id).toBe('g1');
    expect(out.pendingResults[0]).toMatchObject({ tool_use_id: 'g2', is_error: true });
  });
});

describe('clientOutcomeToToolResult', () => {
  it('needs_assessment tells the model where to send the user', () => {
    const r = clientOutcomeToToolResult('x', { ok: false, error: 'needs_assessment', domains: ['planche'] });
    expect(r.is_error).toBe(true);
    expect(String(r.content)).toContain('planche');
  });
});

describe('historyToModelMessages', () => {
  it('drops leading assistant, merges same-role, adds card notes, ends on assistant', () => {
    const h = historyToModelMessages([
      { role: 'assistant', text: 'old greeting' },
      { role: 'user', text: 'a' },
      { role: 'user', text: 'b' },
      { role: 'assistant', text: 'הנה', cards: [{ workoutId: 'ai-1-aaaaaa', title: 'אימון', minutes: 20, exerciseCount: 5 }] },
      { role: 'user', text: 'dangling' },
    ]);
    expect(h).toHaveLength(2);
    expect(h[0]).toEqual({ role: 'user', content: 'a\nb' });
    expect(h[1].role).toBe('assistant');
    expect(h[1].content).toContain('workoutId=ai-1-aaaaaa');
  });
});

describe('reply guards in the turn loop (owner review 18.10.2026)', () => {
  const SHEET: any = {
    firstName: 'דוד', gender: 'male', ageBand: null, goals: { mainGoal: null, selected: [] }, primaryTrack: null,
    programs: [], injuries: [], streakDays: null, lastWorkouts: [], today: [],
    thisWeek: [
      { date: '2026-10-18', type: 'training', programs: [], startTime: '18:00', completed: false, title: null },
      { date: '2026-10-20', type: 'training', programs: [], startTime: null, completed: false, title: null },
    ],
    preferredTrainingTime: null, equipment: { home: [], office: [], outdoor: [] }, area: null,
  };
  const GUARDED: TurnConfig = { ...CFG, guards: { sheet: SHEET, todayDow: 0 } };

  it('re-prompts once, then strips foreign words that survive the retry', async () => {
    const { deps, events, calls } = harness([
      msg('end_turn', { type: 'text', text: 'השבוע יש לך 3 אימונים, ok?' }),
      msg('end_turn', { type: 'text', text: 'השבוע יש לך 2 אימונים, ביום ראשון ב-18:00 ושלישי. ok?' }),
    ]);
    const out = await runCoachTurn(GUARDED, newTurnState('מה בתוכנית?'), deps);
    expect(calls).toHaveLength(2);
    expect(out.state.turnText).toBe('השבוע יש לך 2 אימונים, ביום ראשון ב-18:00 ושלישי.?');
    expect(events.filter((e) => e.type === 'text')).toHaveLength(1); // the bad first try was never sent
    expect(out.state.log!.guards).toEqual([
      { type: 'grounding', action: 'reprompt: 3 workouts' },
      { type: 'hebrew_only', action: 'reprompt: ok' },
      { type: 'hebrew_only', action: 'unresolved_after_retry: ok' },
      { type: 'hebrew_only', action: 'stripped: ok' },
    ]);
  });

  it('a correct reply passes untouched with a single model call', async () => {
    const { deps, calls } = harness([msg('end_turn', { type: 'text', text: 'השבוע מתוכננים לך 2 אימונים.' })]);
    const out = await runCoachTurn(GUARDED, newTurnState('מה בתוכנית?'), deps);
    expect(calls).toHaveLength(1);
    expect(out.state.log!.guards).toEqual([]);
    expect(out.state.log!.usage).toEqual({ in: 10, out: 5, cacheRead: 0 });
  });

  it('a tool round preamble is shown (stripped), tool calls are logged with a result summary', async () => {
    const h = harness(
      [
        msg('tool_use', { type: 'text', text: 'checking בודק.' }, { type: 'tool_use', id: 't1', name: 'get_progress', input: { range: 'week' } }),
        msg('end_turn', { type: 'text', text: 'השבוע עשית 2 אימונים.' }),
      ],
      vi.fn(async () => ({ content: '{"range":"week","workouts":2,"activeDays":2}' })),
    );
    const out = await runCoachTurn(GUARDED, newTurnState('איך אני מתקדם?'), h.deps);
    expect(out.state.turnText).toBe('בודק.\nהשבוע עשית 2 אימונים.');
    expect(out.state.log!.toolCalls).toEqual([{ name: 'get_progress', input: { range: 'week' }, resultSummary: '{"range":"week","workouts":2,"activeDays":2}' }]);
  });

  it('a preamble sentence left with no Hebrew after stripping is dropped, not shown as bare punctuation', async () => {
    const h = harness(
      [
        msg('tool_use', { type: 'text', text: 'Let me check, ok. בודק את הלוז.' }, { type: 'tool_use', id: 't1', name: 'get_schedule', input: {} }),
        msg('end_turn', { type: 'text', text: 'השבוע מתוכננים לך 2 אימונים.' }),
      ],
      vi.fn(async () => ({ content: '{"days":[]}' })),
    );
    const out = await runCoachTurn(GUARDED, newTurnState('מה בתוכנית?'), h.deps);
    expect(out.state.turnText).toBe('בודק את הלוז.\nהשבוע מתוכננים לך 2 אימונים.');
    expect(out.state.turnText.startsWith(',')).toBe(false);
  });

  it('an all-English preamble is dropped entirely; the answer starts with Hebrew', async () => {
    const h = harness(
      [
        msg('tool_use', { type: 'text', text: 'Sure, let me check.' }, { type: 'tool_use', id: 't1', name: 'get_progress', input: { range: 'week' } }),
        msg('end_turn', { type: 'text', text: 'השבוע עשית 2 אימונים.' }),
      ],
      vi.fn(async () => ({ content: '{"range":"week","workouts":2,"activeDays":2}' })),
    );
    const out = await runCoachTurn(GUARDED, newTurnState('איך אני מתקדם?'), h.deps);
    expect(out.state.turnText).toBe('השבוע עשית 2 אימונים.');
  });
});

describe('dropHebrewlessSentences', () => {
  it('keeps Hebrew sentences and drops punctuation-only leftovers', () => {
    expect(dropHebrewlessSentences(',. בודק את הלוז.')).toBe('בודק את הלוז.');
    expect(dropHebrewlessSentences(',.')).toBe('');
    expect(dropHebrewlessSentences('בודק.\n,.\nעוד רגע.')).toBe('בודק.\nעוד רגע.');
    expect(dropHebrewlessSentences('יש לך 2 אימונים.')).toBe('יש לך 2 אימונים.');
  });
});
