/** Kelly server locale, part 2: English proactive messages, greeting, quick replies, flex prompt + guard. */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { greeting, quickReplies, type CoachGender } from '../persona';
import { coachT, ensureCoachCatalog } from '../coach-locale';
import { renderProactive, FORBIDDEN_COPY } from '../proactive/templates';
import { flexSystem, flexUserContent, FLEX_SYSTEM } from '../proactive/flex-prompt';
import { validateFlexSentence } from '../proactive/flex-guard';
import { todayPlanOf } from '../proactive/context.server';
import type { TemplateKey, TemplateVars } from '../proactive/types';

const GENDERS: CoachGender[] = ['male', 'female', 'other'];
beforeAll(async () => {
  await ensureCoachCatalog('en');
});

const CASES: Array<[TemplateKey, TemplateVars]> = [
  ['morning', { label: 'Strength workout', minutes: 30, time: '18:00', silent: null }],
  ['morning_open', { label: 'Run', minutes: 25, time: null, silent: null }],
  ['weather_rain', { label: 'Strength workout' }],
  ['weather_heat', { label: 'Run' }],
  ['weekly', { workouts: 4, activeDays: 3, minutes: 160, streak: 5, avgSteps: 7420 }],
  ['assessment', { slug: 'core', name: 'Core' }],
  ['post_workout', { workoutId: 'w1', minutes: 32 }],
];

describe('English proactive templates', () => {
  for (const [key, vars] of CASES)
    for (const gender of GENDERS)
      it(`${key} ${gender}`, () => {
        const r = renderProactive({ templateKey: key, vars, gender, firstName: 'Dan', locale: 'en' });
        expect(r.text).toMatch(/[A-Za-z]/);
        expect(r.text).not.toMatch(/[֐-׿]/);
        expect(r.text).not.toMatch(FORBIDDEN_COPY);
        expect(r.text).not.toMatch(/\s{2,}|undefined|null|NaN/);
      });
});

describe('greeting and quick replies', () => {
  it('English', () => {
    const t = coachT('en');
    expect(greeting('female', 'Dan', t)).toMatch(/^Hi Dan, I’m Kelly/);
    expect(greeting('other', '', t)).toMatch(/^Hi, I’m Kelly/);
    expect(quickReplies('male', t)).toEqual(['Build me a workout for today', 'How am I progressing?', 'What’s in this week’s plan?']);
  });
  it('default stays Hebrew', () => {
    expect(quickReplies('male')[0]).toBe('תבנה לי אימון להיום');
    expect(greeting('male', '')).toMatch(/^היי, אני קלי/);
  });
});

describe('flex prompt and guard', () => {
  it('system prompt per locale; Hebrew is the original', () => {
    expect(flexSystem()).toBe(FLEX_SYSTEM);
    expect(flexSystem('he')).toBe(FLEX_SYSTEM);
    expect(flexSystem('en')).toMatch(/English only/);
    expect(flexUserContent('female', 'x', ['a'], 'en')).not.toMatch(/feminine/);
  });
  it('English guard', () => {
    const ok = (s: string) => validateFlexSentence(s, 'female', 'en');
    expect(ok('A short walk still counts.')).toBe('A short walk still counts.');
    expect(ok('Easy does it today')).toBe('Easy does it today.');
    for (const bad of ['', 'אימון טוב.', 'Great job 3 times.', 'See you on Monday.', 'Ready?', 'Go hard / go home.', 'One. Two.', 'x '.repeat(80)]) expect(ok(bad)).toBeNull();
    expect(validateFlexSentence('A short walk still counts.', 'male')).toBeNull(); // Hebrew guard rejects Latin
  });
});

describe('today plan labels per locale', () => {
  const sheet = (kind: string) => ({ today: [{ type: 'training', kind, completed: false }], lastWorkouts: [] }) as never;
  it('English', () => {
    expect(todayPlanOf(sheet('strength'), '2026-10-20', 'en').label).toBe('Strength workout');
    expect(todayPlanOf(sheet('weird'), '2026-10-20', 'en').label).toBe('Workout');
  });
});
