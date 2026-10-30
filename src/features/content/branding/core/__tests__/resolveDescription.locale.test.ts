import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveContentTags, resolveDescription, resolveNotificationText } from '../branding.utils';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';

const HEBREW = /[֐-׿]/;
const ctx = { currentTime: new Date(2026, 9, 1, 13, 30) };

describe('tag resolver is locale-aware (names stay Hebrew, values follow the language)', () => {
  it('English: the cue tags resolve to English words, never Hebrew', () => {
    const text = '@מיקוד_פיזיולוגי, @סיבת_רצף, @עצימות, @מיקום, @מיקוד, @קטגוריה, @רמה, @רמה_הבאה, @פער_שבועי, @זמן_יום';
    const out = resolveContentTags(text, {
      ...ctx, avgRepCount: 4, streakDays: 8, difficulty: 3, location: 'gym', dominantMuscle: 'glutes',
      category: 'strength', experienceLevel: 'advanced', userGender: 'female', targetLevel: 5,
      weeklyGapDomain: 'דחיפה', weeklyGapPercent: 40,
    }, 'en');
    expect(out).toBe('maximal strength, A strong week: give your body what it needs, intense, the gym, glutes, strength, advanced, level 5, pushing (40%), afternoon');
    expect(HEBREW.test(out)).toBe(false);
  });

  it('English: gender and plural variants', () => {
    expect(resolveDescription('@את/ה @מוכן/ה', { ...ctx, userGender: 'female' }, 'en')).toBe('you ready');
    expect(resolveDescription('@את/ה @מוכן/ה', { ...ctx, userGender: 'female' }, 'he')).toBe('את מוכנה');
    expect(resolveDescription('@את/ה @מוכן/ה', { ...ctx }, 'he')).toBe('אתם מוכנים');
  });

  it('English: volume status, distances and weeks use placeholders', () => {
    expect(resolveDescription('@סטטוס_נפח', { ...ctx, weeklyCompletedSets: 20, weeklySetQuota: 24 }, 'en')).toBe('almost there: 20/24 sets (83%)');
    expect(resolveDescription('@מרחק', { ...ctx, distanceMeters: 1500 }, 'en')).toBe('1.5 km');
    expect(resolveDescription('@שבוע_מתוך', { ...ctx, weekNumber: 4, totalWeeks: 12 }, 'en')).toBe('week 4 of 12');
    expect(resolveDescription('@מרחק_יעד', { ...ctx, targetDistanceLabel: '5 ק"מ' }, 'en')).toBe('5 km');
  });

  it('English: a Hebrew caller-supplied value leaves the tag unresolved (the row is skipped, never mixed)', () => {
    expect(resolveDescription('@סקייל_נוכחי', { ...ctx, currentProgressionStep: 'שכיבות סמיכה' }, 'en')).toBe('@סקייל_נוכחי');
    expect(resolveDescription('@סיבת_עצימות', { ...ctx, intensityReason: 'מנוחה קצרה' }, 'en')).toBe('@סיבת_עצימות');
    expect(resolveDescription('@סיבת_עצימות', { ...ctx, intensityReason: 'short rests' }, 'en')).toBe('short rests');
  });

  it('English: running category and Hebrew category label map back through the catalog', () => {
    expect(resolveDescription('@סוג_ריצה', { ...ctx, runningCategory: 'tempo' }, 'en')).toBe('tempo run');
    expect(resolveDescription('@קטגוריה', { ...ctx, category: 'running', categoryLabel: 'ריצת טמפו' }, 'en')).toBe('tempo run');
  });

  it('English notification tags', () => {
    expect(resolveNotificationText('@שם_שותף @זמן_יום', { ...ctx, triggerType: 'Social_Matchmaking' }, 'en')).toBe('a partner afternoon');
  });

  it('default language is Hebrew', () => {
    expect(resolveContentTags('@עצימות', { ...ctx, difficulty: 3 })).toBe('שורף');
  });

  it('the Hebrew catalog keeps the running category labels of the shared label table', () => {
    const he = JSON.parse(readFileSync(join(process.cwd(), 'src/messages/he/brandingTags.json'), 'utf8')) as Record<string, string>;
    for (const [k, v] of Object.entries(RUNNING_WORKOUT_CATEGORY_LABELS_HE)) expect(he[`runCategory.${k}`]).toBe(v);
  });

  it('en catalog has exactly the Hebrew keys and no Hebrew letters or long dashes', () => {
    const dir = join(process.cwd(), 'src/messages');
    const he = JSON.parse(readFileSync(join(dir, 'he/brandingTags.json'), 'utf8')) as Record<string, string>;
    const en = JSON.parse(readFileSync(join(dir, 'en/brandingTags.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort());
    for (const v of Object.values(en)) { expect(HEBREW.test(v)).toBe(false); expect(v).not.toMatch(/[—―]/); }
  });
});
