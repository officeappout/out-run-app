/**
 * Kelly server locale, part 2 (proactive, greeting, quick replies): Hebrew baseline.
 * Snapshots recorded from unmodified origin/main BEFORE the locale threading; they must pass unchanged
 * after it (flag off or locale he = byte-identical output).
 */
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { greeting, quickReplies, type CoachGender } from '../persona';
import { renderProactive } from '../proactive/templates';
import { FLEX_SYSTEM, flexUserContent } from '../proactive/flex-prompt';
import { validateFlexSentence } from '../proactive/flex-guard';
import { todayPlanOf } from '../proactive/context.server';
import type { TemplateKey, TemplateVars } from '../proactive/types';

const snap = (name: string) => `./__snapshots__/proactive-he/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const GENDERS: CoachGender[] = ['male', 'female', 'other'];

const CASES: Array<[TemplateKey, TemplateVars]> = [
  ['morning', { label: 'אימון כוח', minutes: 30, time: '18:00', silent: null }],
  ['morning', { label: 'אימון כוח', minutes: null, time: null, silent: 1 }],
  ['morning', {}],
  ['morning_open', { label: 'ריצה', minutes: 25, time: null, silent: null }],
  ['weather_rain', { label: 'אימון כוח' }],
  ['weather_heat', { label: 'ריצה' }],
  ['weather_heat', {}],
  ['weekly', { workouts: 1, activeDays: 1, minutes: 25, streak: null, avgSteps: null }],
  ['weekly', { workouts: 3, activeDays: 2, minutes: 90, streak: 2, avgSteps: 1050 }],
  ['weekly', { workouts: 4, activeDays: 3, minutes: 160, streak: 5, avgSteps: 7420 }],
  ['assessment', { slug: 'core', name: 'ליבה' }],
  ['assessment', {}],
  ['post_workout', { workoutId: 'w1', minutes: 32 }],
  ['post_workout', { workoutId: 'w2' }],
];

it('proactive templates', async () => {
  const out = CASES.flatMap(([templateKey, vars]) =>
    GENDERS.flatMap((gender) =>
      ['דני', ''].flatMap((firstName) =>
        [null, 'משפט אישי.'].map((flex) => ({ templateKey, vars, gender, firstName, flex, r: renderProactive({ templateKey, vars, gender, firstName, flex }) })),
      ),
    ),
  );
  await expect(json(out)).toMatchFileSnapshot(snap('templates'));
});

it('greeting and quick replies', async () => {
  const out = GENDERS.map((gender) => ({ gender, quick: quickReplies(gender), named: greeting(gender, 'דני'), anon: greeting(gender, '') }));
  await expect(json(out)).toMatchFileSnapshot(snap('greeting-quick'));
});

it('flex prompt and guard', async () => {
  const samples = ['אימון טוב מחכה לך.', 'כל צעד נחשב!', 'איך היה?', 'hello there', 'ביום שלישי נתאמן.', 'תתחיל לאט.', 'תתחילי לאט.', 'נעים להתחיל בקלילות'];
  const out = {
    system: FLEX_SYSTEM,
    user: GENDERS.map((g) => flexUserContent(g, 'one short sentence', ['main goal: x', 'streak: a few days'])),
    guard: GENDERS.flatMap((g) => samples.map((s) => ({ g, s, v: validateFlexSentence(s, g) }))),
  };
  await expect(json(out)).toMatchFileSnapshot(snap('flex'));
});

it('today plan labels', async () => {
  const kinds = ['strength', 'cardio', 'walking', 'maintenance', 'weird', null] as const;
  const out = kinds.map((kind) =>
    todayPlanOf({ today: [{ type: 'training', kind, completed: false, startTime: '18:00', plannedMinutes: 30 }], lastWorkouts: [] } as never, '2026-10-20'),
  );
  await expect(json(out)).toMatchFileSnapshot(snap('today-plan'));
});
