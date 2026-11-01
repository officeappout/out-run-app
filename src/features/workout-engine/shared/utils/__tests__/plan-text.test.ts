import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { useLocaleStore } from '@/store/useLocaleStore';
import {
  planExerciseNames,
  planPeakSetText,
  planPerSideText,
  planPyramidText,
  planRepsRangeText,
  planRepsText,
  planRepsUnitText,
  planSecsRangeText,
  planSecsText,
  planSecsUnitText,
  planTabataFinisherTitle,
  savedExerciseName,
} from '../plan-text';
import { equipmentLabelEn, programLabelEn } from '@/lib/i18n/static-labels';

const setLocale = (locale: 'he' | 'en') =>
  useLocaleStore.getState().setLocaleState({ locale, contentLocaleOn: locale === 'en', i18nEnabled: locale === 'en' });

describe('plan text, Hebrew = the old literals', () => {
  beforeAll(() => setLocale('he'));
  it('reps / seconds', () => {
    expect(planRepsText(1)).toBe('חזרה אחת');
    expect(planRepsText(12)).toBe('12 חזרות');
    expect(planSecsText(1)).toBe('שנייה אחת');
    expect(planSecsText(45)).toBe('45 שניות');
    expect(planRepsRangeText(8, 12)).toBe('8-12 חזרות');
    expect(planSecsRangeText(15, 30)).toBe('15-30 שניות');
    expect(planRepsUnitText('3×8-12')).toBe('3×8-12 חזרות');
    expect(planSecsUnitText('3×45')).toBe('3×45 שניות');
    expect(planPerSideText()).toBe(' (לכל צד)');
    expect(planPeakSetText()).toBe('1-2 חזרות (סט שיא)');
    expect(planPyramidText('wave')).toBe('פירמידה עולה-יורדת');
    expect(planPyramidText('peak')).toBe('סט שיא');
    expect(planTabataFinisherTitle()).toBe('טבטה — פיניש');
  });
  it('names stay Hebrew with no nameHe', () => {
    expect(planExerciseNames({ he: 'מתח', en: 'Pull-up' })).toEqual({ name: 'מתח' });
    expect(savedExerciseName({ name: 'מתח' })).toBe('מתח');
  });
  it('static labels are off in Hebrew', () => {
    expect(programLabelEn('push')).toBeUndefined();
    expect(equipmentLabelEn('rings')).toBeUndefined();
  });
});

describe('plan text, English', () => {
  beforeAll(async () => {
    await ensureCatalog('en', 'player');
    await ensureCatalog('en', 'common');
    setLocale('en');
  });
  afterAll(() => setLocale('he'));
  it('reps / seconds', () => {
    expect(planRepsText(1)).toBe('1 rep');
    expect(planRepsText(12)).toBe('12 reps');
    expect(planSecsText(45)).toBe('45 seconds');
    expect(planRepsRangeText(8, 12)).toBe('8-12 reps');
    expect(planRepsUnitText('3×8-12')).toBe('3×8-12 reps');
    expect(planPerSideText()).toBe(' (per side)');
    expect(planPyramidText('peak')).toBe('Peak set');
    expect(planTabataFinisherTitle()).toBe('Tabata finisher');
  });
  it('names: English shown, Hebrew kept for saving', () => {
    const n = planExerciseNames({ he: 'מתח', en: 'Pull-up' });
    expect(n).toEqual({ name: 'Pull-up', nameHe: 'מתח' });
    expect(savedExerciseName(n)).toBe('מתח');
    expect(planExerciseNames({ he: 'מתח', en: '' })).toEqual({ name: 'מתח' });
  });
  it('static labels', () => {
    expect(programLabelEn('pushing')).toBe('Push');
    expect(programLabelEn('J0fLpmJhG0KDN2tQouxh')).toBe('Push');
    expect(programLabelEn('no_such_slug')).toBeUndefined();
    expect(equipmentLabelEn('pullup_bar')).toBe('Pull-up bar');
    expect(equipmentLabelEn('nothing_here')).toBeUndefined();
  });
});
