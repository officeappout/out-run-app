/**
 * Kelly phase 3 — every proactive template in every grammar: Hebrew, persona rules (no
 * slash, no emoji, no dash, no English), the user's grammar, valid chips. Pure.
 */
import { describe, expect, it } from 'vitest';
import { renderProactive, FORBIDDEN_COPY } from '../templates';
import { validateFlexSentence } from '../flex-guard';
import { COACH_ACTIONS } from '../../action-chips';
import { findFeminineSelfReferences } from '../../gender-voice';
import type { TemplateKey, TemplateVars } from '../types';
import type { CoachGender } from '../../persona';

const CASES: Array<[TemplateKey, TemplateVars]> = [
  ['morning', { label: 'אימון כוח', minutes: 30, time: '18:00', silent: null }],
  ['morning', { label: 'אימון כוח', minutes: null, time: null, silent: 1 }],
  ['morning_open', { label: 'ריצה', minutes: 25, time: null, silent: null }],
  ['weather_rain', { label: 'אימון כוח' }],
  ['weather_heat', { label: 'ריצה' }],
  ['weekly', { workouts: 1, activeDays: 1, minutes: 25, streak: null, avgSteps: null }],
  ['weekly', { workouts: 4, activeDays: 3, minutes: 160, streak: 5, avgSteps: 7420 }],
  ['assessment', { slug: 'core', name: 'ליבה' }],
  ['post_workout', { workoutId: 'w1', minutes: 32 }],
];
const GENDERS: CoachGender[] = ['male', 'female', 'other'];

describe('proactive templates', () => {
  for (const [key, vars] of CASES) {
    for (const gender of GENDERS) {
      for (const firstName of ['דני', '']) {
        it(`${key} ${gender} ${firstName ? 'named' : 'no name'}`, () => {
          const r = renderProactive({ templateKey: key, vars, gender, firstName });
          expect(r.text.length).toBeGreaterThan(10);
          expect(r.text.length).toBeLessThan(320);
          expect(r.text).toMatch(/[א-ת]/);
          expect(r.text).not.toMatch(FORBIDDEN_COPY);
          expect(r.text).not.toMatch(/[A-Za-z]/);
          expect(r.text).not.toMatch(/\s{2,}|undefined|null|NaN/);
          expect(findFeminineSelfReferences(r.text, gender)).toEqual([]);
          for (const a of r.actions) expect(COACH_ACTIONS[a]).toBeDefined();
          if (!firstName) expect(r.text).not.toContain('דני');
        });
      }
    }
  }

  it('addresses the user in their own grammar', () => {
    const heatM = renderProactive({ templateKey: 'weather_heat', vars: { label: 'ריצה' }, gender: 'male', firstName: '' }).text;
    const heatF = renderProactive({ templateKey: 'weather_heat', vars: { label: 'ריצה' }, gender: 'female', firstName: '' }).text;
    const heatO = renderProactive({ templateKey: 'weather_heat', vars: { label: 'ריצה' }, gender: 'other', firstName: '' }).text;
    expect(heatM).toContain('אם אתה יוצא לריצה');
    expect(heatF).toContain('אם את יוצאת לריצה');
    expect(heatO).not.toMatch(/אתה|את יוצאת/);
    const wM = renderProactive({ templateKey: 'weekly', vars: { workouts: 3, activeDays: 3, minutes: 90 }, gender: 'male', firstName: '' }).text;
    const wF = renderProactive({ templateKey: 'weekly', vars: { workouts: 3, activeDays: 3, minutes: 90 }, gender: 'female', firstName: '' }).text;
    expect(wM).toContain('אתה בונה');
    expect(wF).toContain('את בונה');
    const mornO = renderProactive({ templateKey: 'morning', vars: { label: 'אימון כוח' }, gender: 'other', firstName: '' }).text;
    expect(mornO).toContain('היום מתוכנן');
    expect(mornO).toContain('בכפתור למטה');
  });

  it('chips: build today / open schedule / build at home / level check / קל בדיוק קשה', () => {
    const r = (k: TemplateKey, v: TemplateVars = {}) => renderProactive({ templateKey: k, vars: v, gender: 'male', firstName: '' }).actions;
    expect(r('morning')).toEqual(['build_today']);
    expect(r('morning_open')).toEqual(['open_schedule']);
    expect(r('weather_rain')).toEqual(['build_home']);
    expect(r('assessment', { slug: 'core', name: 'ליבה' })).toEqual(['check_level_core']);
    expect(r('assessment', { slug: 'nope', name: 'x' })).toEqual([]);
    expect(r('post_workout', { minutes: 20 })).toEqual(['rate_easy', 'rate_right', 'rate_hard']);
  });

  it('the weekly copy never counts misses and reads naturally for one workout', () => {
    const one = renderProactive({ templateKey: 'weekly', vars: { workouts: 1, activeDays: 1, minutes: 20 }, gender: 'male', firstName: 'דני' }).text;
    expect(one).toContain('סיכום שבועי לדני: אימון אחד, 20 דקות בסך הכול.');
    expect(one).not.toMatch(/פספס|החמצ|לא התאמנת/);
  });

  it('silent only for the morning line after the reminder', () => {
    expect(renderProactive({ templateKey: 'morning', vars: { silent: 1 }, gender: 'male', firstName: '' }).silent).toBe(true);
    expect(renderProactive({ templateKey: 'morning', vars: {}, gender: 'male', firstName: '' }).silent).toBe(false);
  });

  it('a valid flex sentence replaces the default one', () => {
    const r = renderProactive({ templateKey: 'weekly', vars: { workouts: 3 }, gender: 'male', firstName: '', flex: 'שבוע חזק, ממשיכים ככה.' });
    expect(r.text).toContain('שבוע חזק, ממשיכים ככה.');
    expect(r.text).not.toContain('שגרה אמיתית');
  });
});

describe('flex guard (model-written sentence)', () => {
  it('accepts a short clean Hebrew sentence and adds the period', () => {
    expect(validateFlexSentence('כל צעד קטן מקרב אותך ליעד', 'male')).toBe('כל צעד קטן מקרב אותך ליעד.');
    expect(validateFlexSentence('"שבוע חזק, ממשיכים ככה!"', 'female')).toBe('שבוע חזק, ממשיכים ככה!');
  });
  it.each([
    ['English', 'Great week, ממשיכים.'],
    ['digits', 'עשית 3 אימונים.'],
    ['slash', 'את/ה בדרך הנכונה.'],
    ['emoji', 'כל הכבוד 💪'],
    ['question', 'מוכן למחר?'],
    ['two sentences', 'יפה מאוד. ממשיכים.'],
    ['dash', 'שבוע חזק — ממשיכים.'],
    ['empty', '   '],
  ])('rejects %s', (_n, s) => {
    expect(validateFlexSentence(s, 'male')).toBeNull();
  });
  it('rejects the wrong grammar for the user', () => {
    expect(validateFlexSentence('אתה בדרך הנכונה.', 'female')).toBeNull();
    expect(validateFlexSentence('את מוכנה לשבוע הבא.', 'male')).toBeNull();
    expect(validateFlexSentence('אתה בדרך הנכונה.', 'other')).toBeNull();
    expect(validateFlexSentence('אני שמחה לראות את ההתמדה.', 'male')).toBeNull(); // Kelly is male
  });
});
