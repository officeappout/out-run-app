/**
 * enable_where_to_train_v1 — Hebrew of the new keys (born translated): `library` preview.where.*
 * and `map` trainingHere.*, every gender branch (owner rule: `other` is neutral, never masculine).
 */
import { describe, expect, it } from 'vitest';
import { library } from '@/messages/ns/library';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';
import he from '@/messages/he/map.json';

const tl = makeT('he', library);
const tm = makeT('he', map);

describe('library preview.where.*', () => {
  it('plain strings and values', () => {
    expect(tl('preview.location.title')).toBe('איפה מתאמנים?');
    expect(tl('preview.where.park')).toBe('פארק');
    expect(tl('preview.where.home')).toBe('בית');
    expect(tl('preview.where.service')).toBe('שירות');
    expect(tl('preview.where.homeGear', { gear: 'מתח · מקבילים' })).toBe('בבית · מתח · מקבילים');
    expect(tl('preview.where.homeBodyweight')).toBe('בבית · משקל גוף');
    expect(tl('preview.where.parksLabel')).toBe('גינות קרובות');
    expect(tl('preview.where.workoutLine', { title: 'אימון עליון', duration: '45 דק׳' })).toBe('אימון עליון · 45 דק׳');
  });
});

describe('map trainingHere.*', () => {
  const g = (key: Parameters<typeof tm>[0], values: Record<string, string> = {}) =>
    (['female', 'male', 'other'] as const).map((gender) => tm(key, { ...values, gender }));

  it('gendered titles, CTAs and the share switch', () => {
    expect(g('trainingHere.title.workout', { place: 'גינת הירקון' })).toEqual(['מתאמנת בגינת הירקון', 'מתאמן בגינת הירקון', 'אימון בגינת הירקון']);
    expect(g('trainingHere.title.running')).toEqual(['יוצאת לרוץ', 'יוצא לרוץ', 'יוצאים לרוץ']);
    expect(g('trainingHere.title.walking')).toEqual(['יוצאת ללכת', 'יוצא ללכת', 'יוצאים ללכת']);
    expect(g('trainingHere.place.change')).toEqual(['החליפי', 'החלף', 'החלפה']);
    expect(g('trainingHere.share.title')).toEqual(['שתפי שאני מתאמנת כאן', 'שתף שאני מתאמן כאן', 'לשתף את האימון כאן']);
    expect(g('trainingHere.share.sub.park')).toEqual([
      'תופיעי ב"מתאמנים כאן" בדף הפארק', 'תופיע ב"מתאמנים כאן" בדף הפארק', 'האימון יופיע ב"מתאמנים כאן" בדף הפארק',
    ]);
    expect(g('trainingHere.share.sub.route')).toEqual([
      'תופיעי ב"מתאמנים" בדף המסלול', 'תופיע ב"מתאמנים" בדף המסלול', 'האימון יופיע ב"מתאמנים" בדף המסלול',
    ]);
    expect(g('trainingHere.cta.startNow')).toEqual(['התחילי אימון עכשיו', 'התחל אימון עכשיו', 'התחלת אימון עכשיו']);
    expect(g('trainingHere.cta.shareNow')).toEqual(['שתפי עכשיו', 'שתף עכשיו', 'שיתוף עכשיו']);
    // No one-off reminder exists yet: the later CTA is a plain "שמור" and nothing promises a reminder.
    expect(g('trainingHere.cta.save')).toEqual(['שמור', 'שמור', 'שמור']);
    expect(g('trainingHere.later.hint.park')).toEqual(['תראי את זה בדף הפארק', 'תראה את זה בדף הפארק', 'זה יופיע בדף הפארק']);
    expect(g('trainingHere.later.hint.route')).toEqual(['תראי את זה בדף המסלול', 'תראה את זה בדף המסלול', 'זה יופיע בדף המסלול']);
    expect(Object.values(he).some((v) => v.includes('נזכיר'))).toBe(false);
    expect(g('trainingHere.cta.done')).toEqual(['סגרי', 'סגור', 'סגירה']);
  });

  it('plain strings', () => {
    const cases: Array<[Parameters<typeof tm>[0], string]> = [
      ['trainingHere.workout.label', 'האימון'],
      ['trainingHere.place.label', 'איפה'],
      ['trainingHere.when.label', 'מתי'],
      ['trainingHere.when.now', 'עכשיו'],
      ['trainingHere.when.later', 'מאוחר יותר'],
      ['trainingHere.when.other', 'אחר'],
      ['trainingHere.visibility.label', 'למי גלוי'],
      ['trainingHere.visibility.everyone', 'כולם'],
      ['trainingHere.visibility.partners', 'שותפי אימון'],
      ['trainingHere.cta.saving', 'שומר…'],
      ['trainingHere.pickOnly', 'או רק לבחור את הגינה, בלי לשתף'],
      ['trainingHere.error', 'לא הצלחנו לשתף. אפשר לנסות שוב.'],
    ];
    for (const [key, he] of cases) expect(tm(key)).toBe(he);
    expect(tm('trainingHere.place.line', { name: 'גינת הירקון', distance: '650 מ׳' })).toBe('גינת הירקון · 650 מ׳');
  });
});
