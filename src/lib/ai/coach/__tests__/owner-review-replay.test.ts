/**
 * Owner review 18.10.2026 — the six moments of the owner's real conversation, replayed
 * through POST /api/ai-coach/chat with a scripted (mocked) model. No network, no
 * Firestore, no Anthropic key. Each case asserts what the server now does about it.
 *
 *   1. "מה בתוכנית השבוע?" answered blind + English mid-sentence → the sheet is in the
 *      prompt, the invented answer is caught, the model is re-prompted once, the user only
 *      sees the grounded reply.
 *   2. "תגיד למה דוקטור הצעת 20 דק?" → no safety short-circuit, the model answers.
 *   3. "בוא תבנה לי אימון לבית ל10 דק" → home + 10 min reach the device whatever the
 *      model sent; "is it for home?" is answered from get_workout_details.
 *   4. "אימון ברמה גבוהה לבית 10 דק" → difficulty 3, home, 10.
 *   5. "תבנה לי אימון בטן" → domains ['core'] (strict) reach the device.
 *   6. memory → the persona has the honest one-liner; Kelly is a man.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSseParser, type CoachStreamEvent } from '../protocol';
import { COACH_SYSTEM_PROMPT } from '../persona';
import { getWorkoutDetails } from '../server-tools.server';
import { OWNER_SHEET } from './owner-sheet.fixture';

const st = vi.hoisted(() => ({
  script: [] as any[],
  streamCalls: [] as any[],
  thread: { summary: null as string | null, summarizedUntilMs: 0, pending: null as any, recent: [] as any[] },
  appended: [] as any[],
  executeServerTool: null as any,
  sheet: null as any,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'k', KELLY_NAME: 'קלי' }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/verify-ai-request.server', () => ({
  verifyAiRequest: async () => ({
    ok: true,
    uid: 'owner',
    profile: { core: { name: 'דוד', gender: 'male' }, equipment: { home: ['5Rkhxawxj8EwC4spTXVM', 'I1K30JehaxSx8dlBOZyd'], office: [], outdoor: [] } },
    entitlement: null,
    config: {},
  }),
  aiDenialResponse: () => new Response('{}', { status: 403 }),
}));
vi.mock('@/lib/ai/anthropic.server', () => ({
  getAiModel: () => 'claude-haiku-5-5',
  withPromptCaching: ({ system, tools }: any) => ({ system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], tools }),
  recordAiUsage: async () => ({ costUsd: 0 }),
  createAiMessage: vi.fn(),
  getAnthropicClient: () => ({
    messages: {
      stream: (params: any) => {
        st.streamCalls.push(JSON.parse(JSON.stringify(params)));
        const next = st.script.shift();
        const listeners: Array<(d: string) => void> = [];
        return {
          on: (ev: string, cb: (d: string) => void) => {
            if (ev === 'text') listeners.push(cb);
          },
          finalMessage: async () => {
            if (!next) throw new Error('script exhausted');
            // Stream in small deltas, like the API.
            for (const b of next.content) if (b.type === 'text') for (const piece of b.text.match(/[\s\S]{1,7}/g) ?? []) listeners.forEach((l) => l(piece));
            return next;
          },
        };
      },
    },
  }),
}));
vi.mock('@/lib/ai/coach/thread-store.server', () => ({
  loadThread: async () => JSON.parse(JSON.stringify(st.thread)),
  appendMessage: async (_db: any, _uid: string, m: any) => {
    st.appended.push(JSON.parse(JSON.stringify(m)));
    return `m${st.appended.length}`;
  },
  savePending: async (_db: any, _uid: string, p: any) => {
    st.thread.pending = JSON.parse(JSON.stringify({ ...p, createdAtMs: Date.now() }));
  },
  clearPending: async () => {
    st.thread.pending = null;
  },
  maybeRollSummary: async () => false,
}));
vi.mock('@/lib/ai/coach/server-tools.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server-tools.server')>();
  return {
    ...actual,
    executeServerTool: (...a: any[]) => st.executeServerTool(...a),
    loadUserContextSheet: async () => {
      if (!st.sheet) throw new Error('unavailable');
      return st.sheet;
    },
  };
});

import { POST } from '@/app/api/ai-coach/chat/route';

const usage = { input_tokens: 1000, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };
const msg = (stop: string, ...content: any[]) => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: stop, stop_sequence: null, content, usage });
const text = (t: string) => ({ type: 'text', text: t, citations: null });
const toolUse = (id: string, name: string, input: any) => ({ type: 'tool_use', id, name, input });

const req = (body: unknown) =>
  new Request('http://x/api/ai-coach/chat', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const events = async (res: Response): Promise<CoachStreamEvent[]> => createSseParser()(await res.text());
const shownText = (ev: CoachStreamEvent[]) => ev.filter((e) => e.type === 'text').map((e: any) => e.delta).join('');
const clientCall = (ev: CoachStreamEvent[]) => ev.find((e) => e.type === 'client_tool') as Extract<CoachStreamEvent, { type: 'client_tool' }>;

beforeEach(() => {
  st.script = [];
  st.streamCalls = [];
  st.thread = { summary: null, summarizedUntilMs: 0, pending: null, recent: [] };
  st.appended = [];
  st.sheet = JSON.parse(JSON.stringify(OWNER_SHEET));
  st.executeServerTool = vi.fn(async () => ({ content: '{}' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('owner review replay', () => {
  it('1. "מה בתוכנית השבוע?": the sheet is pre-loaded; an invented, half-English answer is re-prompted and never shown', async () => {
    st.script = [
      msg('end_turn', text('השבוע יש לך שלושה אימונים של גוף מלא: ביום ראשון ב-15:00, שלישי וחמישי. ביום suspicious... נכון יותר.')),
      msg('end_turn', text('השבוע מתוכננים לך 4 אימונים: ביום ראשון ב-18:00, שני, רביעי ב-07:30 ושישי.')),
    ];
    const ev = await events(await POST(req({ message: 'מה בתוכנית השבוע?' })));

    // The model saw the real week before answering.
    const sys = st.streamCalls[0].system[1].text as string;
    expect(sys).toContain('User sheet');
    expect(sys).toContain('This week (Sunday to Saturday): 4 planned workouts');

    // Re-prompted once with an internal note naming the problems.
    expect(st.streamCalls).toHaveLength(2);
    const note = st.streamCalls[1].messages.at(-1).content as string;
    expect(note).toContain('Internal check');
    expect(note).toContain('time 15:00');
    expect(note).toContain('suspicious');

    // The user only sees the grounded reply.
    expect(shownText(ev)).toBe('השבוע מתוכננים לך 4 אימונים: ביום ראשון ב-18:00, שני, רביעי ב-07:30 ושישי.');
    expect(shownText(ev)).not.toMatch(/[A-Za-z]/);

    const saved = st.appended.at(-1);
    expect(saved.text).not.toContain('15:00');
    expect(saved.log.guards.map((g: any) => g.type)).toEqual(['grounding', 'hebrew_only']);
    expect(saved.log.guards[0].action).toMatch(/^reprompt:/);
    expect(saved.log.usage).toEqual({ in: 2000, out: 80, cacheRead: 1800 });
    expect(saved.log.model).toBe('claude-haiku-5-5');
  });

  it('1b. when the sheet cannot load, the prompt says so and any stated count is checked against nothing', async () => {
    st.sheet = null;
    st.script = [
      msg('end_turn', text('השבוע יש לך 3 אימונים.')),
      msg('tool_use', text('אני בודק.'), toolUse('s1', 'get_schedule', { from: '2026-10-18', to: '2026-10-24' })),
      msg('end_turn', text('בדקתי: השבוע מתוכנן לך אימון אחד, ביום שני.')),
    ];
    st.executeServerTool = vi.fn(async () => ({
      content: JSON.stringify({ from: '2026-10-18', to: '2026-10-24', entries: [{ date: '2026-10-19', type: 'training', programs: [], startTime: null, completed: false, title: null }] }),
    }));
    const ev = await events(await POST(req({ message: 'מה בתוכנית השבוע?' })));
    expect(st.streamCalls[0].system[1].text).toContain('could not be loaded');
    expect(st.executeServerTool).toHaveBeenCalledWith(expect.anything(), 'get_schedule', { from: '2026-10-18', to: '2026-10-24' });
    expect(shownText(ev)).toBe('אני בודק.\nבדקתי: השבוע מתוכנן לך אימון אחד, ביום שני.');
    const log = st.appended.at(-1).log;
    expect(log.toolCalls).toEqual([expect.objectContaining({ name: 'get_schedule', resultSummary: expect.stringContaining('2026-10-19') })]);
    expect(log.guards).toEqual([{ type: 'grounding', action: 'reprompt: 3 workouts' }]);
  });

  it('2. "דוקטור" as a nickname is not a medical question: no fixed safety reply, the model answers', async () => {
    st.script = [msg('end_turn', text('הצעתי 20 דקות כי זה מה שנכנס לך היום בין האימונים. אפשר גם קצר יותר.'))];
    const ev = await events(await POST(req({ message: 'תגיד למה דוקטור הצעת 20 דק?' })));
    expect(st.streamCalls).toHaveLength(1);
    expect(shownText(ev)).not.toContain('101');
    expect(COACH_SYSTEM_PROMPT).toMatch(/דוקטור, דוק, רופא .*nickname/);
    expect(COACH_SYSTEM_PROMPT).toMatch(/Muscle soreness after training is normal/);
  });

  it('2b. muscle soreness reaches the model too; chest pain still gets the fixed reply', async () => {
    st.script = [msg('end_turn', text('זה טבעי אחרי אימון. היום אני ממליץ על אימון קליל וניידות.'))];
    await events(await POST(req({ message: 'כואבים לי השרירים מאתמול' })));
    expect(st.streamCalls).toHaveLength(1);

    const ev = await events(await POST(req({ message: 'יש לי לחץ בחזה' })));
    expect(st.streamCalls).toHaveLength(1); // no model call
    expect(shownText(ev)).toContain('אני לא רופא');
    expect(st.appended.at(-1).log.guards).toEqual([{ type: 'safety', action: 'fixed_reply:chest' }]);
  });

  it('3. "בוא תבנה לי אימון לבית ל10 דק": home + 10 minutes reach the device even when the model sent park / 20', async () => {
    st.script = [msg('tool_use', text('בונה לך.'), toolUse('gw', 'generate_workout', { durationMin: 20, location: 'park', difficulty: 1, equipment: ['bar'] }))];
    const ev = await events(await POST(req({ message: 'בוא תבנה לי אימון לבית ל10 דק' })));
    expect(clientCall(ev).input).toMatchObject({ durationMin: 10, location: 'home', equipment: [] });
    expect(st.thread.pending.state.log.guards).toEqual([{ type: 'intent_mapping', action: 'location:park→home; minutes:20→10' }]);

    // The device answers with the shaped workout: 3 home exercises, the real minutes.
    st.script = [msg('end_turn', text('בניתי לך אימון גוף מלא בבית של 11 דקות עם 3 תרגילים. תלחץ על הכרטיס כדי להתחיל.'))];
    const result = {
      workoutId: 'ai-owner-000001',
      title: 'אימון גוף מלא בבית',
      minutes: 11,
      location: 'home',
      requestedMinutes: 10,
      domains: [],
      levelCeiling: true,
      exercises: [
        { name: 'שכיבות סמיכה סופינציה', sets: 2, reps: 5, seconds: null, method: 'שכיבות סמיכה סופינציה בבית', methodLocation: 'home', gear: [], video: true, area: 'push' },
        { name: 'חתירות קשתים ב-30°', sets: 2, reps: 5, seconds: null, method: 'חתירות קשתים באמצעות מגבת', methodLocation: 'home', gear: ['מגבת'], video: true, area: 'pull' },
        { name: 'הליכות קיר', sets: 2, reps: 15, seconds: null, method: 'הליכות קיר בבית', methodLocation: 'home', gear: [], video: false, area: 'push' },
      ],
    };
    const ev2 = await events(await POST(req({ toolResult: { id: 'gw', outcome: { ok: true, result } } })));
    expect(ev2[0]).toMatchObject({ type: 'card', card: { title: 'אימון גוף מלא בבית', minutes: 11, exerciseCount: 3 } });

    // The model read the real minutes + the level-ceiling note + per-exercise method location and gear.
    const toolResult = st.streamCalls[1].messages.at(-1).content.at(-1).content as string;
    const parsed = JSON.parse(toolResult);
    expect(parsed.exercises[1]).toMatchObject({ methodLocation: 'home', gear: ['מגבת'] });
    expect(parsed.notesForCoach.join(' ')).toContain('בבית יש פחות תרגילים ברמה שלך');
    expect(parsed.decisionRecord).toBeUndefined();

    // The card keeps the exercise list, so "is it for home?" is answerable later.
    const saved = st.appended.at(-1);
    expect(saved.cards[0].exercises).toHaveLength(3);
    expect(saved.log.toolCalls[0]).toMatchObject({ name: 'generate_workout', input: { location: 'home', durationMin: 10 } });
    expect(saved.log.toolCalls[0].resultSummary).toContain('home');

    // "הוא לא לבית נכון הסרטונים?" → get_workout_details from the stored card.
    const details = getWorkoutDetails(
      { knownCards: new Map([[saved.cards[0].workoutId, saved.cards[0]]]) } as any,
      { workoutId: 'ai-owner-000001' },
    );
    const d = JSON.parse(details.content);
    expect(d.exercises.every((e: any) => e.methodLocation === 'home')).toBe(true);
    expect(d.exercises.map((e: any) => e.video)).toEqual([true, true, false]);
  });

  it('4. "אימון ברמה גבוהה לבית 10 דק": difficulty 3, home, 10 minutes', async () => {
    st.script = [msg('tool_use', toolUse('gw', 'generate_workout', { durationMin: 10, location: 'home', difficulty: 2 }))];
    const ev = await events(await POST(req({ message: 'אימון ברמה גבוהה לבית 10 דק' })));
    expect(clientCall(ev).input).toMatchObject({ durationMin: 10, location: 'home', difficulty: 3, domains: [] });
  });

  it('5. "תבנה לי אימון בטן": core only reaches the device even when the model sent no domains', async () => {
    st.script = [msg('tool_use', toolUse('gw', 'generate_workout', { durationMin: 20, location: 'home', difficulty: 2 }))];
    const ev = await events(await POST(req({ message: 'תבנה לי אימון בטן' })));
    expect(clientCall(ev).input).toMatchObject({ domains: ['core'], location: 'home' });
  });

  it('6. memory and voice: an honest one-liner, Kelly is a man, the user by their gender', async () => {
    expect(COACH_SYSTEM_PROMPT).toContain('אני זוכר את השיחה הזו ואת הסיכום שלה, והצוות משפר אותי לפי השיחות');
    expect(COACH_SYSTEM_PROMPT).toContain('Kelly is a man');
    expect(COACH_SYSTEM_PROMPT).toContain('תלחצי על הכרטיס');
    expect(COACH_SYSTEM_PROMPT).toMatch(/Unknown gender: plural or impersonal wording only/);
    st.script = [msg('end_turn', text('אני זוכר את השיחה הזו ואת הסיכום שלה, והצוות משפר אותי לפי השיחות.'))];
    await events(await POST(req({ message: 'אתה זוכר מה דיברנו? אתה משתפר?' })));
    expect(st.streamCalls[0].system[1].text).toContain('masculine singular');
  });
});
