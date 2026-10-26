/**
 * i18n batch an (namespace `coach`): Kelly user-facing texts. Snapshots recorded BEFORE the extraction, from
 * unmodified origin/main; the extraction commit must pass them unchanged (Hebrew byte-identical).
 * Each snapshot is the JSON of every output the module can produce across the gender / branch matrix.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EMPTY_TEXT, REFUSAL_TEXT, TRUNCATED_TOOL_TEXT, TURN_FAILED_TEXT } from '../turn-engine';
import { safetyReply, type SafetyTrigger } from '../safety';
import { aiPauseReply, AI_PAUSE_CODES } from '../ai-pause';
import { describeCoachError, workoutCardLabel } from '../protocol';
import { COACH_ACTIONS, checkLevelLabel } from '../action-chips';
import { ASSESSABLE_SLUGS } from '../assessment-gaps';
import { C, tryPrefix } from '../suggestions/copy';
import { placeholderHints } from '../suggestions/placeholders';
import { suggestChips } from '../suggestions/suggest-chips';
import type { ChipSituation, LastTurn } from '../suggestions/types';
import type { CoachGender } from '../persona';

const GENDERS: CoachGender[] = ['male', 'female', 'other'];
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T10:07:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const snap = (name: string) => `./__snapshots__/kelly-texts-i18n/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

it('turn-engine fixed replies', async () => {
  await expect(json({ REFUSAL_TEXT, EMPTY_TEXT, TRUNCATED_TOOL_TEXT, TURN_FAILED_TEXT })).toMatchFileSnapshot(snap('turn-engine'));
});

it('safety replies', async () => {
  const triggers: SafetyTrigger[] = ['chest', 'breath', 'dizziness', 'pregnancy', 'injury'];
  const out: Record<string, string> = {};
  for (const t of triggers) for (const g of GENDERS) out[`${t}.${g}`] = safetyReply(t, g);
  await expect(json(out)).toMatchFileSnapshot(snap('safety'));
});

it('ai pause replies', async () => {
  const now = new Date('2026-10-20T10:07:00Z');
  const out: Record<string, string> = {};
  for (const code of AI_PAUSE_CODES)
    for (const g of GENDERS)
      for (const team of [true, false])
        for (const retryAfterSec of [undefined, 600, 3600, 3 * 3600, 20 * 3600, 30 * 3600])
          out[`${code}.${g}.team=${team}.retry=${retryAfterSec}`] = aiPauseReply(code, g, { retryAfterSec, now, teamChannel: team });
  await expect(json(out)).toMatchFileSnapshot(snap('ai-pause'));
});

it('protocol: coach errors and card label', async () => {
  const inputs = [
    { offline: true },
    { status: 429, retryAfterSec: 900 },
    { code: 'rate_limited' },
    { status: 503 },
    { code: 'over_budget' },
    { status: 403 },
    { status: 401 },
    { status: 500 },
    {},
  ];
  const out: Record<string, unknown> = {};
  for (const e of inputs) for (const g of GENDERS) out[`${JSON.stringify(e)}.${g}`] = describeCoachError(e, g);
  out.cardLabel1 = workoutCardLabel({ title: 'אימון בטן', minutes: 25, exerciseCount: 1 });
  out.cardLabel6 = workoutCardLabel({ title: 'אימון בטן', minutes: 25, exerciseCount: 6 });
  await expect(json(out)).toMatchFileSnapshot(snap('protocol'));
});

it('action chips', async () => {
  const out: Record<string, unknown> = {};
  for (const [id, spec] of Object.entries(COACH_ACTIONS)) out[id] = { label: spec.label, message: spec.message ?? null };
  for (const slug of ASSESSABLE_SLUGS) out[`checkLevelLabel.${slug}`] = checkLevelLabel(slug);
  await expect(json(out)).toMatchFileSnapshot(snap('action-chips'));
});

const base: ChipSituation = {
  gender: 'male', hour: 10, trainingDayToday: true, buildableToday: true, doneToday: false,
  daysAway: 1, newUser: false, gapName: null, weather: null,
};

describe('suggestions', () => {
  it('copy', async () => {
    const out: Record<string, unknown> = {};
    for (const [k, fn] of Object.entries(C)) {
      if (k === 'levelCheck') out[k] = (fn as (n: string) => unknown)('ליבה');
      else if (k === 'progress' || k === 'tiredSkip') for (const g of GENDERS) out[`${k}.${g}`] = (fn as (g: CoachGender) => unknown)(g);
      else out[k] = (fn as () => unknown)();
    }
    for (const g of GENDERS) out[`tryPrefix.${g}`] = tryPrefix(g);
    await expect(json(out)).toMatchFileSnapshot(snap('suggestions-copy'));
  });

  it('chips + placeholder hints across situations', async () => {
    const lasts: LastTurn[] = [
      { kind: 'opening' },
      { kind: 'workout', location: 'home', minutes: 25, domains: ['push'] },
      { kind: 'workout', location: 'park', minutes: 10, domains: ['pull'] },
      { kind: 'schedule' }, { kind: 'progress' }, { kind: 'app_help' }, { kind: 'proposal' }, { kind: 'handoff' }, { kind: 'safety' }, { kind: 'other' },
    ];
    const sits: ChipSituation[] = [];
    for (const gender of GENDERS)
      for (const weather of [null, 'rain', 'heat', 'cold'] as const)
        for (const extra of [
          {}, { hour: 21 }, { newUser: true, daysAway: null }, { daysAway: 9 }, { doneToday: true }, { trainingDayToday: false },
          { trainingDayToday: null }, { buildableToday: false }, { gapName: 'ליבה' },
        ])
          sits.push({ ...base, gender, weather, ...extra });
    const out = sits.map((s) => ({
      s,
      hints: placeholderHints(s),
      chips: lasts.map((l) => suggestChips(s, l)),
    }));
    await expect(json(out)).toMatchFileSnapshot(snap('suggestions-chips'));
  });
});

it('proactive templates', async () => {
  const { renderProactive } = await import('../proactive/templates');
  const keys = ['morning', 'morning_open', 'weather_rain', 'weather_heat', 'weekly', 'assessment', 'post_workout'] as const;
  const varSets: Array<Record<string, string | number>> = [
    {},
    { label: 'ריצה', minutes: 40, time: '18:30', silent: 1 },
    { label: 'אימון כוח', minutes: 25 },
    { time: '07:00' },
    { workouts: 1, activeDays: 1, minutes: 30 },
    { workouts: 2, activeDays: 1, minutes: 60, streak: 1, avgSteps: 900 },
    { workouts: 3, activeDays: 3, minutes: 90, streak: 2, avgSteps: 1049 },
    { workouts: 4, activeDays: 2, minutes: 150, streak: 12, avgSteps: 10450 },
    { workouts: 0 },
    { name: 'ליבה', slug: 'core' },
    { name: 'הליכה על ידיים', slug: 'handstand' },
    { slug: 'nonsense' },
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys)
    for (const g of GENDERS)
      for (const firstName of ['', 'דנה'])
        for (const [i, vars] of varSets.entries())
          for (const flex of [null, 'משפט גמיש.'])
            out[`${k}.${g}.${firstName || '-'}.v${i}.${flex ? 'flex' : 'noflex'}`] = renderProactive({ templateKey: k, vars, gender: g, firstName, flex });
  await expect(json(out)).toMatchFileSnapshot(snap('proactive-templates'));
});
