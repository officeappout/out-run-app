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
    // The later CTA promises a reminder only via saveRemind (shown when enableTrainingHereReminders is on).
    expect(g('trainingHere.cta.save')).toEqual(['שמור', 'שמור', 'שמור']);
    expect(g('trainingHere.later.hint.park')).toEqual(['תראי את זה בדף הפארק', 'תראה את זה בדף הפארק', 'זה יופיע בדף הפארק']);
    expect(g('trainingHere.later.hint.route')).toEqual(['תראי את זה בדף המסלול', 'תראה את זה בדף המסלול', 'זה יופיע בדף המסלול']);
    expect(Object.entries(he).filter(([, v]) => v.includes('נזכיר')).map(([k]) => k)).toEqual(['trainingHere.cta.saveRemind']);
    expect(tm('trainingHere.cta.saveRemind', { time: '17:45' })).toBe('שמור · נזכיר לך ב-17:45');
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

describe('training partners (mutual follow) — community trainingShares.*, profile profile.partners.*', () => {
  it('feed lines (author gender), join (viewer gender), titles', async () => {
    const { community } = await import('@/messages/ns/community');
    const { profile } = await import('@/messages/ns/profile');
    const tc = makeT('he', community);
    const tp = makeT('he', profile);
    const v = { name: 'נועה', place: 'גינת הירקון', time: '18:00' };
    expect((['female', 'male', 'other'] as const).map((gender) => tc('trainingShares.now', { ...v, gender }))).toEqual([
      'נועה מתאמנת עכשיו בגינת הירקון', 'נועה מתאמן עכשיו בגינת הירקון', 'נועה · אימון עכשיו בגינת הירקון',
    ]);
    expect((['female', 'male', 'other'] as const).map((gender) => tc('trainingShares.later', { ...v, gender }))).toEqual([
      'נועה מגיעה ב-18:00 לגינת הירקון', 'נועה מגיע ב-18:00 לגינת הירקון', 'נועה · ב-18:00 בגינת הירקון',
    ]);
    expect((['female', 'male', 'other'] as const).map((gender) => tc('trainingShares.join', { gender }))).toEqual(['מצטרפת', 'מצטרף', 'הצטרפות']);
    expect(tc('trainingShares.title')).toBe('השותפים שלך מתאמנים');
    expect(tp('profile.partners.title')).toBe('שותפי אימון');
    expect(tp('profile.partners.empty')).toBe('עוד אין שותפי אימון. שותף = עוקבים אחד אחרי השני.');
  });
});

describe('park list own row (phone 7) — map parkDetail.session.*', () => {
  it('workout line + cancel', () => {
    expect(tm('parkDetail.session.withWorkout', { name: 'דנה', workout: 'אימון עליון' })).toBe('דנה · אימון עליון');
    expect(tm('parkDetail.session.cancel')).toBe('ביטול');
  });
});
