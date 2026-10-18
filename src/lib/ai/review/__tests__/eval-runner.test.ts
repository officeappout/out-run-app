/**
 * The regression runner: the assertion engine on its own, and full replays of the
 * committed fixtures (the owner's 6 cases) through the real turn engine with a mocked
 * model — a GOOD mock must pass every case, a BAD one (the failure modes) must fail.
 * No API calls, no Firestore.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { EvalCaseSchema, checkAssertions, defaultAssertions, caseIdFor, type EvalCase, type EvalRunResult } from '../eval-case';
import { runEvalCase, scriptedMockModel, simulateServerTool, stubWorkoutGenerator, type CallModel } from '../eval-runner';

const FIXTURE_DIR = path.join(process.cwd(), 'evals', 'ai-coach');
const cases: EvalCase[] = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => (JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8')) as unknown[]).map((c) => EvalCaseSchema.parse(c)));
const byId = (id: string) => cases.find((c) => c.id === id)!;

function message(content: unknown[], stop: Anthropic.StopReason): Anthropic.Message {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

/** A scripted model: each call returns the next step (tool uses or a final text). */
function script(steps: Array<{ tools?: Array<{ name: string; input: unknown }>; text?: string }>): CallModel {
  let i = 0;
  return async (_params, onText) => {
    const s = steps[Math.min(i++, steps.length - 1)];
    if (s.tools) {
      return message(s.tools.map((t, k) => ({ type: 'tool_use', id: `toolu_${i}_${k}`, name: t.name, input: t.input })), 'tool_use');
    }
    onText(s.text ?? '');
    return message([{ type: 'text', text: s.text ?? '', citations: null }], 'end_turn');
  };
}

describe('fixtures', () => {
  it('the owner cases (round 1 + round 2) parse and are unique', () => {
    expect(cases.map((c) => c.id).sort()).toEqual([
      'owner-01-week-plan',
      'owner-02-doctor-question',
      'owner-03-home-10min',
      'owner-04-hard-home-10min',
      'owner-05-abs',
      'owner-06-memory',
      'owner-07-feminine-slip',
      'owner-08-female-user-no-false-positive',
      'owner-09-typo-improved',
      'owner-10-week-per-day',
      'owner-11-abs-strengthen',
    ]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it('a GOOD (scripted mock) coach passes every case through the real turn engine', async () => {
    for (const c of cases) {
      const r = await runEvalCase(c, { callModel: scriptedMockModel(c), model: 'claude-haiku-5-5' });
      expect({ id: c.id, pass: r.pass, failed: r.assertions.filter((a) => !a.pass) }).toEqual({ id: c.id, pass: true, failed: [] });
      expect(r.costUsd).toBe(0);
    }
  });
});

describe('the owner failure modes fail', () => {
  it('case 1: invented days fail (the English word is stripped by the reply guard)', async () => {
    const r = await runEvalCase(byId('owner-01-week-plan'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ text: 'השבוע יש לך workout ביום שני וביום רביעי.' }]),
    });
    expect(r.pass).toBe(false);
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name).sort()).toEqual(['namesAllScheduledDays', 'noInventedDays']);
    expect(r.run.finalText).not.toContain('workout');
    expect(r.costUsd).toBeGreaterThan(0);
  });

  it('case 1: a schedule-backed answer naming only planned days passes', async () => {
    const r = await runEvalCase(byId('owner-01-week-plan'), {
      model: 'claude-haiku-5-5',
      callModel: script([
        { tools: [{ name: 'get_schedule', input: { from: '2026-10-18', to: '2026-10-24' } }] },
        { text: 'השבוע מתוכננים לך אימונים ביום שלישי וביום חמישי בשש בערב.' },
      ]),
    });
    expect(r.assertions.filter((a) => !a.pass)).toEqual([]);
    const sched = r.run.toolCalls.find((c) => c.name === 'get_schedule')!;
    expect((sched.result as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('case 2: a model-written safety reply fails noSafetyReply', async () => {
    const r = await runEvalCase(byId('owner-02-doctor-question'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ text: 'אני עוצר כאן רגע. אם יש כאב בחזה צריך להתקשר למד״א 101.' }]),
    });
    expect(r.assertions.find((a) => a.name === 'noSafetyReply')).toMatchObject({ pass: false, detail: 'the model wrote a safety reply' });
  });

  it('case 3/4: a park workout of 25 minutes fails location + minutes; difficulty checked', async () => {
    const r = await runEvalCase(byId('owner-04-hard-home-10min'), {
      model: 'claude-haiku-5-5',
      callModel: script([
        { tools: [{ name: 'generate_workout', input: { durationMin: 25, location: 'park', difficulty: 2, domains: [] } }] },
        { text: 'בניתי לך אימון.' },
      ]),
    });
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name).sort()).toEqual(['difficulty', 'location', 'minutes']);
  });

  it('case 4: too few exercises from the engine + LEVEL_CEILING not mentioned', async () => {
    const r = await runEvalCase(byId('owner-04-hard-home-10min'), {
      model: 'claude-haiku-5-5',
      callModel: script([
        { tools: [{ name: 'generate_workout', input: { durationMin: 10, location: 'home', difficulty: 3, domains: [] } }] },
        { text: 'בניתי לך אימון קצר.' },
      ]),
      simulateWorkout: async (input) => {
        const result = { workoutId: 'ai-thin-0001', title: 'אימון', minutes: 10, location: input.location, exercises: [{ name: 'ברפי', sets: 5, reps: 10, seconds: null }] };
        return { outcome: { ok: true, result }, record: { ...result, decisionRecord: { reasons: [{ code: 'LEVEL_CEILING' }] } } };
      },
    });
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name).sort()).toEqual(['mentionLevelCeiling', 'minExercises']);
  });

  it('case 5: no core domain requested → domains fails; off-domain exercises fail too', async () => {
    const noDomain = await runEvalCase(byId('owner-05-abs'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ tools: [{ name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2 } }] }, { text: 'בניתי לך אימון.' }]),
    });
    expect(noDomain.assertions.find((a) => a.name === 'domains')?.pass).toBe(false);

    const offDomain = await runEvalCase(byId('owner-05-abs'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ tools: [{ name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: ['core'] } }] }, { text: 'בניתי לך אימון בטן.' }]),
      simulateWorkout: async (input) => {
        const exercises = [
          { name: 'פלאנק', sets: 3, reps: 0, seconds: 30, domain: 'core', locations: ['home'] },
          { name: 'שכיבות סמיכה', sets: 3, reps: 10, seconds: null, domain: 'push', locations: ['home'] },
          { name: 'כפיפות בטן', sets: 3, reps: 15, seconds: null, domain: 'core', locations: ['home'] },
        ];
        const result = { workoutId: 'ai-off-00001', title: 'בטן', minutes: 20, location: input.location, exercises: exercises.map(({ name, sets, reps, seconds }) => ({ name, sets, reps, seconds })) };
        return { outcome: { ok: true, result }, record: { ...result, exercises } };
      },
    });
    expect(offDomain.assertions.find((a) => a.name === 'domains')).toMatchObject({ pass: false, detail: 'off-domain exercises: push' });
  });

  it('case 6: too long fails; the feminine voice is rewritten by the reply guard', async () => {
    const r = await runEvalCase(byId('owner-06-memory'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ text: 'כן! אני זוכרת הכל. אני שומרת סיכום. אני יכולה לעזור. מה עוד? בוא נתחיל.' }]),
    });
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name).sort()).toEqual(['maxSentences']);
    expect(r.run.finalText).toContain('אני זוכר הכל');
    expect(r.run.finalText).toContain('אני יכול לעזור');
  });

  it('round 2, weekly plan: a count-only answer fails (no days named), the chips are still there', async () => {
    const r = await runEvalCase(byId('owner-10-week-per-day'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ text: 'השבוע מתוכננים לך 3 אימונים. בהצלחה!' }]),
    });
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name)).toEqual(['namesAllScheduledDays']);
    expect(r.run.chips).toEqual(['open_schedule', 'build_today']);
  });

  it('round 2, typo: guessing "הצפרת" fails', async () => {
    const r = await runEvalCase(byId('owner-09-typo-improved'), {
      model: 'claude-haiku-5-5',
      callModel: script([{ text: 'אני מניח שאתה מתכוון להצפרת. לא בטוח שהבנתי.' }]),
    });
    expect(r.assertions.filter((a) => !a.pass).map((a) => a.name).sort()).toEqual(['mustMatch /השתפרת/', 'mustMatch /הצוות/', 'mustNotMatch /הצפרת/'].sort());
  });

  it('round 2, typo: the session context carries the hint for the model', async () => {
    let system = '';
    await runEvalCase(byId('owner-09-typo-improved'), {
      model: 'claude-haiku-5-5',
      callModel: async (params, onText) => {
        system = (params.system as Anthropic.TextBlockParam[]).map((b) => b.text).join('\n');
        return script([{ text: 'התכוונת "השתפרת"? כן, הצוות משפר אותי לפי השיחות.' }])(params, onText);
      },
    });
    expect(system).toContain('"השצפרת" probably means "השתפרת"');
  });

  it('the deterministic safety gate runs first (no model call)', async () => {
    const c: EvalCase = { ...byId('owner-06-memory'), id: 'chest-pain', message: 'יש לי כאב בחזה', assertions: { safetyReply: true } };
    let called = 0;
    const r = await runEvalCase(c, { model: 'm', callModel: async (...a) => (called++, script([{ text: 'x' }])(...a)) });
    expect(r.run.safetyGate).toBe(true);
    expect(called).toBe(0);
    expect(r.pass).toBe(true);
  });
});

describe('assertion engine + helpers', () => {
  const run = (p: Partial<EvalRunResult>): EvalRunResult => ({ finalText: '', safetyGate: false, toolCalls: [], ...p });

  it('a workout assertion with no workout fails clearly', () => {
    expect(checkAssertions({ minExercises: 3 }, run({}))).toEqual([{ name: 'workout', pass: false, detail: 'no successful generate_workout result to check' }]);
  });

  it('mustMatch, mustNotCallTool, today counts as a known day', () => {
    const res = checkAssertions(
      { mustMatch: ['לחץ על הכרטיס'], mustNotCallTool: ['handoff_to_human'], noInventedDays: true },
      run({ finalText: 'היום יום ראשון, לחץ על הכרטיס', todayDayOfWeek: 0, toolCalls: [{ name: 'handoff_to_human', input: {}, result: {}, isError: false }] }),
    );
    expect(res.map((r) => [r.name, r.pass])).toEqual([
      ['mustNotCallTool', false],
      ['noInventedDays', true],
      ['mustMatch /לחץ על הכרטיס/', true],
    ]);
  });

  it('defaultAssertions derives the expectations of a flagged turn', () => {
    expect(defaultAssertions('בוא תבנה לי אימון לבית ל10 דק')).toEqual({
      noEnglish: true,
      masculineSelfReference: true,
      noSafetyReply: true,
      mustCallTool: 'generate_workout',
      location: 'home',
      minutes: 10,
      minExercises: 3,
    });
    expect(defaultAssertions('תבנה לי אימון בטן')).toMatchObject({ domains: ['core'], minExercises: 3 });
    expect(defaultAssertions('אימון ברמה גבוהה לבית 10 דק')).toMatchObject({ difficulty: 3, mentionLevelCeilingIfPresent: true });
    expect(defaultAssertions('מה בתוכנית השבוע?')).toMatchObject({ noInventedDays: true, namesAllScheduledDays: true, chips: ['open_schedule'] });
    expect(defaultAssertions('מה בתוכנית השבוע?').mustCallTool).toBeUndefined();
    expect(defaultAssertions('יש לי כאב בחזה')).toMatchObject({ safetyReply: true });
    expect(defaultAssertions('רגע יש לך זכרון?', 'tone_gender')).toMatchObject({ maxSentences: 4, noSafetyReply: true });
  });

  it('caseIdFor makes a schema-valid id', () => {
    const id = caseIdFor('AbC123_2026-10-18-lq3x', 'llm-2');
    expect(id).toBe('rv-abc123_2026-10-18-lq3x-llm-2');
    expect(EvalCaseSchema.shape.id.safeParse(id).success).toBe(true);
  });

  it('server tool simulation answers from the frozen sheet only', () => {
    const ctx = byId('owner-01-week-plan').context;
    const r = simulateServerTool('get_schedule', { from: '2026-10-21', to: '2026-10-24' }, ctx, new Map());
    expect(JSON.parse(r.content).entries.map((e: { date: string }) => e.date)).toEqual(['2026-10-22']);
    expect(simulateServerTool('handoff_to_human', { summary: 'hello there' }, ctx, new Map()).content).toBe('{"sent":true}');
    expect(simulateServerTool('explain_workout', { workoutId: 'nope' }, ctx, new Map()).isError).toBe(true);
  });

  it('the stub generator obeys the input (domains, location, ≥3 exercises)', async () => {
    const s = await stubWorkoutGenerator({ durationMin: 10, location: 'home', difficulty: 3, domains: ['core'], equipment: [] }, byId('owner-05-abs').context);
    expect(s.outcome.ok).toBe(true);
    const ex = (s.record as { exercises: Array<{ domain: string; locations: string[] }> }).exercises;
    expect(ex.length).toBeGreaterThanOrEqual(3);
    expect(ex.every((e) => e.domain === 'core' && e.locations.includes('home'))).toBe(true);
  });
});
