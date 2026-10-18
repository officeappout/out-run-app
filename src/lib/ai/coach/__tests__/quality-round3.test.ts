/**
 * Quality round 3 (owner thread 18.10.2026, after #437/#439):
 *   1. "ואני לא יכולה לראות… מה שאני יכולה לבדוק" passed the masculine-voice guard
 *   2. "מה הפרסונה שלי?" → "אני לא יכול לראות אותה" with no tool call (tool-routing guard)
 *   3. the sheet: persona, goals, training days, step goal; unnamed programs dropped; the
 *      program cap applied after the filter; "what you know about this user" block
 *   4. "11 דקות ולא 15 כמו שביקשת" when the user named no length (tool-result note)
 */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { findFeminineSelfReferences, masculinizeSelfReferences } from '../gender-voice';
import { checkReply, correctionNote, findBlindClaim } from '../reply-guards';
import { buildUserContextSheet, goalsHebrew, sheetPersonas, trainingDaysOf } from '../context-sheet';
import { aboutUserBlock, buildSessionContext, COACH_SYSTEM_PROMPT } from '../persona';
import { clientOutcomeToToolResult, newTurnState, runCoachTurn, type TurnConfig, type TurnDeps } from '../turn-engine';
import { OWNER_SHEET } from './owner-sheet.fixture';

describe('1. masculine voice: prefixed "אני"', () => {
  const REPLY = 'אני לא רואה בשיחה הזו אימון ערב, ואני לא יכולה לראות את דף הבית שלך. מה שאני יכולה לבדוק זה את הלוח שלך להיום.';
  it('catches ואני / שאני + feminine form', () => {
    expect(findFeminineSelfReferences(REPLY, 'male').map((h) => h.form)).toEqual(['יכולה', 'יכולה']);
    expect(findFeminineSelfReferences('כשאני בודקת את הלו״ז', 'female').map((h) => h.form)).toEqual(['בודקת']);
  });
  it('rewrites them to the masculine', () => {
    expect(masculinizeSelfReferences(REPLY, 'male').text).toBe(
      'אני לא רואה בשיחה הזו אימון ערב, ואני לא יכול לראות את דף הבית שלך. מה שאני יכול לבדוק זה את הלוח שלך להיום.',
    );
  });
  it('does not touch the user\'s own feminine ("שאת יכולה")', () => {
    expect(findFeminineSelfReferences('נראה שאת יכולה להתחיל עכשיו', 'female')).toEqual([]);
  });
});

describe('2. tool routing: "I can\'t see it" when a tool can', () => {
  const PERSONA_Q = 'עכשיו ערב ואני מרגיש עייף מה אתה ממליץ לי להשעות ואגב מה הפרסונה שלי?';
  const BAD = 'אני ממליץ לך לוותר על האימון הכבד הערב. לגבי הפרסונה שלך, אני לא יכול לראות אותה בשיחה הזו.';

  it('flags the owner case and names both tools', () => {
    expect(findBlindClaim(BAD, { userText: PERSONA_Q, toolNames: [] })).toEqual({
      claim: expect.stringContaining('לא יכול לראות'),
      tools: ['get_user_context', 'get_schedule'],
    });
  });
  it('no flag after a data tool ran, or for an unrelated topic', () => {
    expect(findBlindClaim(BAD, { userText: PERSONA_Q, toolNames: ['get_user_context'] })).toBeNull();
    expect(findBlindClaim('אני לא רואה סיבה לא להתאמן', { userText: 'אפשר לרוץ עם נעליים חדשות?', toolNames: [] })).toBeNull();
    expect(findBlindClaim('בניתי לך אימון.', { userText: PERSONA_Q, toolNames: [] })).toBeNull();
  });
  it('the home-screen question routes to get_schedule', () => {
    const b = findBlindClaim('לא, אני לא רואה את דף הבית שלך.', { userText: 'הכוונה עכשיו בדף הבית מופיע לי אימון אתה רואה אותו', toolNames: [] });
    expect(b?.tools).toEqual(['get_schedule']);
  });
  it('correction note asks for the tool', () => {
    const issues = checkReply(BAD, null, 'male', { userText: PERSONA_Q, toolNames: [] });
    expect(issues.map((i) => i.kind)).toEqual(['blind']);
    expect(correctionNote(issues)).toMatch(/Call get_user_context and get_schedule now/);
  });

  it('turn engine: re-prompts, the model calls the tool, the corrected answer is shown', async () => {
    const msg = (stop: Anthropic.StopReason, content: Anthropic.ContentBlock[]) =>
      ({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: stop, stop_sequence: null, content, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;
    const script: Anthropic.Message[] = [
      msg('end_turn', [{ type: 'text', text: BAD, citations: null }]),
      msg('tool_use', [{ type: 'tool_use', id: 't1', name: 'get_user_context', input: {} } as Anthropic.ToolUseBlock]),
      msg('end_turn', [{ type: 'text', text: 'הפרסונה שלך היא צה״ל: האפליקציה מתאימה לך אימונים לשגרה צבאית.', citations: null }]),
    ];
    const calls: Anthropic.MessageStreamParams[] = [];
    const deps: TurnDeps = {
      emit: () => {},
      callModel: vi.fn(async (params, onText) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        const m = script.shift()!;
        for (const b of m.content) if (b.type === 'text') onText(b.text);
        return m;
      }),
      executeServerTool: vi.fn(async () => ({ content: JSON.stringify({ personas: [{ label: 'צה״ל', meaning: 'x' }] }) })),
    };
    const cfg: TurnConfig = {
      model: 'claude-haiku-5-5',
      system: [{ type: 'text', text: 'sys' }],
      tools: [],
      history: [],
      maxRounds: 3,
      maxTokens: 600,
      guards: { sheet: null, todayDow: 0, userGender: 'male' },
    };
    const out = await runCoachTurn(cfg, newTurnState(PERSONA_Q), deps);
    expect(JSON.stringify(calls[1].messages)).toContain('get_user_context');
    expect(calls[1].tool_choice).toEqual({ type: 'auto' });
    expect(out.state.turnText).toBe('הפרסונה שלך היא צה״ל: האפליקציה מתאימה לך אימונים לשגרה צבאית.');
    expect(out.state.log?.guards[0]).toMatchObject({ type: 'tool_routing' });
    expect(out.state.log?.toolCalls.map((c) => c.name)).toEqual(['get_user_context']);
  });
});

describe('3. the sheet knows the user', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  const profile = {
    core: { name: 'דוד כהן', gender: 'male', birthDate: '1990-01-01', mainGoal: 'healthy_lifestyle' },
    selectedGoals: ['mass_building', 'nope'],
    personas: [{ id: 'military', answers: { unitId: 'secret' } }],
    lifestyle: { scheduleDays: ['א', 'ג', 'ה'], trainingTime: '18:00' },
    progression: {
      dailyStepGoal: 8000,
      tracks: {
        '47smw26hUyG5ZbE1bhr3': { currentLevel: 21 },
        H2279XsRGDg9G370J7S9: { currentLevel: 15 },
        fTLWzjP9gH2VNpamyCZF: { currentLevel: 21 },
        calisthenics_upper: { currentLevel: 13 },
        core: { currentLevel: 1 },
        front_lever: { currentLevel: 13 },
        full_body: { currentLevel: 15 },
        legs: { currentLevel: 1 },
        muscle_up: { currentLevel: 21 },
        planche: { currentLevel: 10 },
        pull: { currentLevel: 22 },
        push: { currentLevel: 12 },
        upper_body: { currentLevel: 21 },
      },
    },
  };
  const sheet = buildUserContextSheet({ profile, workouts: [], weekSchedule: [], todayKey: '2026-10-18', areaName: null, now });

  it('unnamed programs are dropped and the cap no longer hides named ones', () => {
    expect(sheet.programs.every((p) => !!p.name)).toBe(true);
    expect(sheet.programs.map((p) => p.id)).toEqual(expect.arrayContaining(['muscle_up', 'planche', 'pull', 'push']));
    expect(sheet.programs.some((p) => /^[A-Za-z0-9]{20}$/.test(p.id))).toBe(false);
  });
  it('a raw id that resolves to a named slug keeps its name', () => {
    const s = buildUserContextSheet({
      profile: { core: {}, progression: { tracks: { H2279XsRGDg9G370J7S9: { currentLevel: 15 } } } },
      workouts: [],
      weekSchedule: [],
      todayKey: '2026-10-18',
      areaName: null,
      now,
      resolveSlug: (id) => (id === 'H2279XsRGDg9G370J7S9' ? 'full_body' : id),
    });
    expect(s.programs).toEqual([expect.objectContaining({ level: 15, name: expect.any(String) })]);
  });
  it('persona label + meaning, never the answers', () => {
    expect(sheet.personas).toEqual([{ label: 'צה״ל', meaning: expect.stringContaining('צה״ל') }]);
    expect(JSON.stringify(sheet)).not.toContain('secret');
    expect(sheetPersonas([{ id: 'office_worker' }], 'female')[0].label).toBe('עובדת משרד');
    expect(sheetPersonas('x', 'male')).toEqual([]);
  });
  it('goals, training days, step goal', () => {
    expect(sheet.goalsHe).toEqual(['אורח חיים בריא', 'בניית מסה']);
    expect(goalsHebrew(null, null)).toEqual([]);
    expect(sheet.trainingDays).toEqual(['ראשון', 'שלישי', 'חמישי']);
    expect(trainingDaysOf({ recurringTemplate: { ב: ['p'], ד: [] } })).toEqual(['שני']);
    expect(sheet.dailyStepGoal).toBe(8000);
  });
  it('"what you know about this user" block, in the session context', () => {
    const block = aboutUserBlock(sheet);
    expect(block).toContain('First name: דוד');
    expect(block).toContain('Age: 30-44');
    expect(block).toContain('Persona: צה״ל');
    expect(block).toContain('Goals: אורח חיים בריא, בניית מסה');
    expect(block).toContain('Training days: ראשון, שלישי, חמישי; preferred time: 18:00');
    expect(block).toContain('daily step goal: 8000');
    const ctx = buildSessionContext({ firstName: 'דוד', gender: 'male', todayKey: '2026-10-18', israelDayOfWeek: 0, israelHour: 22, sheet });
    expect(ctx).toContain('What you know about this user');
  });
  it('unknown fields say so (Kelly must not guess)', () => {
    const block = aboutUserBlock({ ...OWNER_SHEET, ageBand: null, goals: { mainGoal: null, selected: [] } });
    expect(block).toContain('Age: לא ידוע');
    expect(block).toContain('Persona: none chosen yet');
    expect(block).toContain('Goals: לא ידוע');
  });
  it('the prompt routes profile / schedule / tired questions', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('Which tool for which question');
    expect(COACH_SYSTEM_PROMPT).toContain('Tired, late or low on energy');
    expect(COACH_SYSTEM_PROMPT).toMatch(/can't build Tabata/);
  });
});

describe('4. minutes note does not put words in the user\'s mouth', () => {
  it('says "you asked the engine", and only mention a gap the user asked for', () => {
    const r = clientOutcomeToToolResult('t', {
      ok: true,
      result: { workoutId: 'w', title: 'אימון', minutes: 11, requestedMinutes: 15, location: 'home', exercises: [] },
    } as never);
    const note = String(r.content);
    expect(note).toContain('you asked the engine for 15');
    expect(note).toContain('never say the user asked for 15');
  });
});
