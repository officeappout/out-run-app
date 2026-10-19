/**
 * Quality round 2 (owner thread after #434, 18.10.2026):
 *   1. Kelly's feminine self-reference ("אבל לא בטוחה שהבנתי") → guard + masculine rewrite
 *   2. typos ("השצפרת" meant "השתפרת") → a hint in the session context, never applied
 *   3. weekly plan → per-day sheet lines, buildNow, action chips
 *   5. internal ids ("workoutId", "ai-…") never reach the reply
 */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { findFeminineSelfReferences, firstFeminineSelfReference, masculinizeSelfReferences } from '../gender-voice';
import { checkReply, correctionNote, factsFromEvidence, findForeignWords, stripForeignWords } from '../reply-guards';
import { inferScheduleQuestion, typoHints } from '../intent';
import { sheetScheduleEntry } from '../context-sheet';
import { buildSessionContext, renderSheet, scheduleLine } from '../persona';
import { AI_COACH_CHIP_LINKS, COACH_ACTIONS, chipsForTurn, isCoachActionId } from '../action-chips';
import { newTurnState, runCoachTurn, type TurnConfig, type TurnDeps } from '../turn-engine';
import type { CoachStreamEvent } from '../protocol';
import { OWNER_SHEET } from './owner-sheet.fixture';

// ─── 1. Kelly's masculine voice ──────────────────────────────────────────────

describe('gender-voice: Kelly is male', () => {
  const SLIP = 'אני מניח שאתה מתכוון… אבל לא בטוחה שהבנתי';

  it('catches the owner-thread slip with the subject dropped ("לא בטוחה שהבנתי")', () => {
    expect(firstFeminineSelfReference(SLIP, 'male')).toBe('לא בטוחה');
    // Even without knowing the user's gender: "שהבנתי" makes it Kelly speaking.
    expect(firstFeminineSelfReference(SLIP, null)).toBe('לא בטוחה');
    expect(firstFeminineSelfReference(SLIP, 'female')).toBe('לא בטוחה');
  });

  it('catches "אני" + feminine forms, with adverbs in between', () => {
    expect(firstFeminineSelfReference('אני בודקת את הלו״ז שלך')).toBe('אני בודקת');
    expect(firstFeminineSelfReference('אני לא יודעת מה קרה')).toBe('אני לא יודעת');
    expect(firstFeminineSelfReference('אני גם ממליצה על מתיחות')).toBe('אני גם ממליצה');
    expect(firstFeminineSelfReference('אני ממש שמחה שחזרת')).toBe('אני ממש שמחה');
    expect(firstFeminineSelfReference('אני קלי, המאמנת הדיגיטלית')).toBe('המאמנת הדיגיטלית');
    expect(findFeminineSelfReferences('אני מבינה. אני מציעה אימון קצר, אני מניחה שזה בסדר.', 'male').map((h) => h.form)).toEqual([
      'מבינה',
      'מציעה',
      'מניחה',
    ]);
  });

  it('subjectless clause-start forms count when the user is not female', () => {
    expect(firstFeminineSelfReference('שמחה לעזור.', 'male')).toBe('שמחה');
    expect(firstFeminineSelfReference('מוכנה כשתהיה מוכן.', 'other')).toBe('מוכנה');
  });

  it('false positives: a female user addressed correctly is never flagged', () => {
    expect(findFeminineSelfReferences('את בטוחה? אפשר גם אימון קצר יותר.', 'female')).toEqual([]);
    expect(findFeminineSelfReferences('בטוחה? אפשר גם קצר יותר.', 'female')).toEqual([]);
    expect(findFeminineSelfReferences('את יכולה להתחיל מתי שנוח לך', 'female')).toEqual([]);
    expect(findFeminineSelfReferences('אם את צריכה הפסקה, זה בסדר.', 'female')).toEqual([]);
    // A subjectless form with no first-person marker is ambiguous for a female user.
    expect(findFeminineSelfReferences('שמחה לשמוע!', 'female')).toEqual([]);
  });

  it('false positives: quotes, identical masc/fem spellings, feminine nouns', () => {
    expect(findFeminineSelfReferences('כתבת "אני לא בטוחה" אז בניתי לך אימון קל', 'female')).toEqual([]);
    expect(findFeminineSelfReferences('אני רוצה לעזור, אני בונה לך אימון ואני רואה שהתקדמת', 'male')).toEqual([]);
    expect(findFeminineSelfReferences('התוכנית מוכנה, והיא מתאימה לך.', 'male')).toEqual([]);
    expect(findFeminineSelfReferences('אני בטוח שהבנתי. אני יכול לבנות לך אימון.', 'male')).toEqual([]);
  });

  it('masculinizes exactly the detected forms (the deterministic last resort)', () => {
    expect(masculinizeSelfReferences(SLIP, 'male')).toEqual({ text: 'אני מניח שאתה מתכוון… אבל לא בטוח שהבנתי', changed: ['בטוחה→בטוח'] });
    expect(masculinizeSelfReferences('אני קלי, המאמנת הדיגיטלית. אני יכולה לעזור.', 'male').text).toBe('אני קלי, המאמן הדיגיטלי. אני יכול לעזור.');
    // The user's own feminine stays.
    const mixed = masculinizeSelfReferences('את בטוחה? אני צריכה לדעת כדי לבנות.', 'female');
    expect(mixed.text).toBe('את בטוחה? אני צריך לדעת כדי לבנות.');
  });

  it('reply guard: a feminine issue and its correction note', () => {
    const issues = checkReply(SLIP, null, 'male');
    expect(issues).toEqual([{ kind: 'feminine', forms: ['לא בטוחה'] }]);
    expect(correctionNote(issues)).toMatch(/Kelly is a man/);
  });
});

// ─── Turn engine: the slip is never shown ────────────────────────────────────

function msg(stop: Anthropic.StopReason, text: string): Anthropic.Message {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    stop_reason: stop,
    stop_sequence: null,
    content: [{ type: 'text', text, citations: null }],
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function harness(texts: string[]) {
  const events: CoachStreamEvent[] = [];
  const calls: Anthropic.MessageStreamParams[] = [];
  const deps: TurnDeps = {
    emit: (e) => events.push(e),
    callModel: vi.fn(async (params, onText) => {
      calls.push(JSON.parse(JSON.stringify(params)));
      const t = texts.shift() ?? 'סוף';
      onText(t);
      return msg('end_turn', t);
    }),
    executeServerTool: vi.fn(async () => ({ content: '{}' })),
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
  guards: { sheet: null, todayDow: 0, userGender: 'male' },
};

describe('turn engine: masculine voice guard', () => {
  it('re-prompts once; a corrected reply is what the user sees', async () => {
    const { deps, events, calls } = harness(['אבל לא בטוחה שהבנתי, תוכל לכתוב שוב?', 'לא בטוח שהבנתי, תוכל לכתוב שוב?']);
    const out = await runCoachTurn(CFG, newTurnState('היי חזרתי השצפרת'), deps);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1].messages)).toContain('Kelly is a man');
    expect(events).toEqual([{ type: 'text', delta: 'לא בטוח שהבנתי, תוכל לכתוב שוב?' }]);
    expect(out.state.log?.guards).toEqual([{ type: 'masculine_voice', action: 'reprompt: לא בטוחה' }]);
  });

  it('still feminine after the retry → rewritten deterministically', async () => {
    const slip = 'אני מניח שאתה מתכוון… אבל לא בטוחה שהבנתי';
    const { deps, events } = harness([slip, slip]);
    const out = await runCoachTurn(CFG, newTurnState('היי'), deps);
    expect(events).toEqual([{ type: 'text', delta: 'אני מניח שאתה מתכוון… אבל לא בטוח שהבנתי' }]);
    expect(out.state.log?.guards.map((g) => g.type)).toEqual(['masculine_voice', 'masculine_voice', 'masculine_voice']);
    expect(out.state.log?.guards[2]).toEqual({ type: 'masculine_voice', action: 'rewritten: בטוחה→בטוח' });
  });

  it('a female user addressed in the feminine passes untouched (no re-prompt)', async () => {
    const { deps, events, calls } = harness(['את בטוחה? אפשר גם אימון קצר יותר.']);
    await runCoachTurn({ ...CFG, guards: { sheet: null, todayDow: 0, userGender: 'female' } }, newTurnState('שעה וחצי'), deps);
    expect(calls).toHaveLength(1);
    expect(events).toEqual([{ type: 'text', delta: 'את בטוחה? אפשר גם אימון קצר יותר.' }]);
  });
});

// ─── 5. Internal ids never reach the reply ───────────────────────────────────

describe('internal ids in a reply', () => {
  const toolResult = JSON.stringify({ workoutId: 'ai-1734-park', title: 'אימון בטן בבית', exercises: [{ name: 'V-sit' }] });
  const facts = factsFromEvidence(OWNER_SHEET, [toolResult], 0);

  it('a JSON key from the evidence ("workoutId") is not a word the reply may use', () => {
    expect(findForeignWords('האימון שלך (workoutId) מוכן', facts.text)).toEqual(['workoutId']);
  });

  it('ids are flagged even when the evidence holds them as values', () => {
    expect(findForeignWords('בניתי לך את ai-1734-park', facts.text)).toEqual(['ai-1734-park']);
    expect(findForeignWords('הציוד שלך: 5Rkhxawxj8EwC4spTXVM', facts.text)).toEqual(['5Rkhxawxj8EwC4spTXVM']);
    expect(findForeignWords('אני אקרא ל get_schedule', facts.text)).toEqual(['get_schedule']);
  });

  it('real exercise names with Latin letters (values) are still allowed', () => {
    expect(findForeignWords('התרגיל הראשון הוא V-sit', facts.text)).toEqual([]);
  });

  it('stripping leaves clean Hebrew', () => {
    const reply = 'בניתי לך אימון בטן (workoutId=ai-1734-park). אפשר ללחוץ על הכרטיס.';
    const words = findForeignWords(reply, facts.text);
    expect(stripForeignWords(reply, words)).toBe('בניתי לך אימון בטן. אפשר ללחוץ על הכרטיס.');
  });

  it('the turn engine strips an id that survives the retry', async () => {
    const leak = 'בניתי לך אימון, workoutId=ai-1734-park.';
    const { deps, events } = harness([leak, leak]);
    await runCoachTurn(CFG, newTurnState('תבנה לי אימון'), deps);
    expect(events).toEqual([{ type: 'text', delta: 'בניתי לך אימון,.' }]);
  });
});

// ─── 2. Typos ─────────────────────────────────────────────────────────────────

describe('typo hints (a hint for the model, never applied)', () => {
  it('"השצפרת" → "השתפרת" (צ and ת are keyboard neighbours)', () => {
    expect(typoHints('היי חזרתי השצפרת')).toEqual([{ word: 'השצפרת', suggestion: 'השתפרת' }]);
  });

  it('transpositions and sound-alike swaps', () => {
    expect(typoHints('אמיון רגליים')).toEqual([{ word: 'אמיון', suggestion: 'אימון' }]);
    expect(typoHints('התקדנת?')).toEqual([{ word: 'התקדנת', suggestion: 'התקדמת' }]);
  });

  it('no hints for correct messages (prefixes included)', () => {
    for (const t of [
      'תן לי בטן אני רוצה לחזק',
      'מה מצפה לי השבוע? איך אני יודע מה יש לי באימונים',
      'בוא תבנה לי אימון לבית ל10 דק',
      'רגע יש לך זכרון?',
      'תגיד למה דוקטור הצעת 20 דק?',
      'איך אני מתקדם?',
    ]) {
      expect(typoHints(t)).toEqual([]);
    }
  });

  it('the hint reaches the session context, with the confirm instruction', () => {
    const ctx = buildSessionContext({
      firstName: 'דוד',
      gender: 'male',
      todayKey: '2026-10-18',
      israelDayOfWeek: 0,
      israelHour: 9,
      typoHints: typoHints('היי חזרתי השצפרת'),
    });
    expect(ctx).toContain('"השצפרת" probably means "השתפרת"');
    expect(ctx).toContain('התכוונת "השתפרת"?');
  });
});

// ─── 3. Weekly plan ───────────────────────────────────────────────────────────

describe('schedule entries, lines and chips', () => {
  it('per-entry: weekday, kind, planned minutes, buildNow; unknown program ids never shown', () => {
    const strength = sheetScheduleEntry({ date: '2026-10-20', type: 'training', programIds: ['pull', 'H2279XsRGDg9G370J7S9'], startTime: '18:00', scheduledCategories: ['strength'] });
    expect(strength).toMatchObject({ weekday: 'שלישי', kind: 'strength', programs: ['משיכה'], plannedMinutes: null, buildNow: { durationMin: null, domains: ['pull'] } });
    expect(JSON.stringify(strength)).not.toContain('H2279');

    const run = sheetScheduleEntry({ date: '2026-10-21', type: 'training', programIds: [], plannedRun: { goal: { type: 'time', value: 40 } } });
    expect(run).toMatchObject({ weekday: 'רביעי', kind: 'cardio', plannedMinutes: 40, buildNow: null });

    const done = sheetScheduleEntry({ date: '2026-10-18', type: 'training', programIds: ['full_body'], completed: true });
    expect(done.buildNow).toBeNull();
    expect(sheetScheduleEntry({ date: '2026-10-19', type: 'rest' }).buildNow).toBeNull();
  });

  it('renderSheet lists one line per planned day and today\'s buildable session', () => {
    const today = sheetScheduleEntry({ date: '2026-10-18', type: 'training', programIds: ['full_body'], startTime: '18:00', scheduledCategories: ['strength'] });
    const run = sheetScheduleEntry({ date: '2026-10-20', type: 'training', startTime: '07:30', plannedRun: { goal: { type: 'time', value: 30 } } });
    const out = renderSheet({ ...OWNER_SHEET, today: [today], thisWeek: [today, run] });
    expect(out).toContain('2 planned workouts:');
    expect(out).toContain('  יום ראשון 2026-10-18 18:00, כוח, כל הגוף');
    expect(out).toContain('  יום שלישי 2026-10-20 07:30, ריצה, 30 דק׳');
    expect(out).toContain("Today's planned session can be built now: generate_workout domains []");
    expect(scheduleLine({ ...today, title: 'אימון גב ומתח' })).toBe('יום ראשון 2026-10-18 18:00, אימון גב ומתח');
  });

  it('older sheet shapes (no new fields) still render', () => {
    expect(renderSheet(OWNER_SHEET)).toContain('4 planned workouts:');
  });

  it('schedule questions are recognised (and a build request is not one)', () => {
    expect(inferScheduleQuestion('מה מצפה לי השבוע? איך אני יודע מה יש לי באימונים')).toBe(true);
    expect(inferScheduleQuestion('מה בתוכנית השבוע?')).toBe(true);
    expect(inferScheduleQuestion('מה יש לי מחר?')).toBe(true);
    expect(inferScheduleQuestion('תבנה לי את האימון של היום')).toBe(false);
    expect(inferScheduleQuestion('תן לי בטן אני רוצה לחזק')).toBe(false);
  });

  it('chips: open the schedule for a schedule answer, build today when buildable, none after a build', () => {
    const today = [sheetScheduleEntry({ date: '2026-10-18', type: 'training', programIds: ['full_body'] })];
    expect(chipsForTurn({ userText: 'מה מצפה לי השבוע?', toolNames: [], sheet: { today } })).toEqual(['open_schedule', 'build_today']);
    expect(chipsForTurn({ userText: 'מה מצפה לי השבוע?', toolNames: [], sheet: { today: [] } })).toEqual(['open_schedule']);
    expect(chipsForTurn({ userText: 'ומה בשבוע הבא?', toolNames: ['get_schedule'], sheet: null })).toEqual(['open_schedule']);
    expect(chipsForTurn({ userText: 'תבנה לי את האימון של היום', toolNames: ['generate_workout'], sheet: { today } })).toEqual([]);
    expect(chipsForTurn({ userText: 'רגע יש לך זכרון?', toolNames: [], sheet: { today } })).toEqual([]);
  });

  it('chip specs: labels as the owner wrote them; ids validated', () => {
    expect(COACH_ACTIONS.open_schedule.label).toBe('פתח את הלו״ז');
    expect(COACH_ACTIONS.build_today.label).toBe('בנה את האימון של היום');
    expect(AI_COACH_CHIP_LINKS).toEqual(['/home?openPlanner=true', '/home?openPlanner=true&openBuilder=true', '/help']);
    expect(isCoachActionId('open_schedule')).toBe(true);
    expect(isCoachActionId('javascript:alert(1)')).toBe(false);
  });
});
