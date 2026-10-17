import { describe, it, expect } from 'vitest';
import { resolveContentTags, hasUnresolvedTagArtifacts } from '../branding.utils';
import type { TagResolverContext } from '../branding.utils';

/**
 * Tags used to be replaced one after another in source order with unanchored
 * regexes, so a short tag that is a prefix of a longer one ate the longer
 * tag's head and left a dangling fragment in the UI:
 *   "@רמה_הבאה"          → "כל הרמות_הבאה"
 *   "@מיקוד_פיזיולוגי"   → "גוף מלא_פיזיולוגי"
 *   "@אחוז_התקדמות_רמה"  → "0%_רמה"
 * Every tag now matches only as a whole tag (negative lookahead, `u` flag).
 */
describe('resolveContentTags — prefix-colliding tags resolve as whole tags', () => {
  const ctx: TagResolverContext = {
    experienceLevel: 'advanced',
    userGender: 'male',
    targetLevel: 7,
    avgRepCount: 10,
    dominantMuscle: 'chest',
    programProgress: 40,
    goalProgressPercent: 85,
    distanceMeters: 500,
    targetDistanceLabel: '5 ק"מ',
    userName: 'דנה כהן',
    currentProgram: 'pulling',
    muscles: ['back', 'chest'],
  };

  it('@רמה vs @רמה_הבאה', () => {
    expect(resolveContentTags('אתגר @רמה_הבאה', ctx)).toBe('אתגר רמה 7');
    expect(resolveContentTags('@רמה → @רמה_הבאה', ctx)).toBe('מתקדם → רמה 7');
  });

  it('@רמה_הבאה without a target level uses its own fallback, not @רמה\'s', () => {
    expect(resolveContentTags('אתגר @רמה_הבאה', {})).toBe('אתגר הרמה הבאה');
  });

  it('@מיקוד vs @מיקוד_פיזיולוגי', () => {
    expect(resolveContentTags('@מיקוד_פיזיולוגי', ctx)).toBe('היפרטרופיה');
    expect(resolveContentTags('@מיקוד / @מיקוד_פיזיולוגי', ctx)).toBe('חזה / היפרטרופיה');
    expect(resolveContentTags('@מיקוד_פיזיולוגי', {})).toBe('אימון כללי');
  });

  it('@אחוז_התקדמות vs @אחוז_התקדמות_רמה', () => {
    expect(resolveContentTags('@אחוז_התקדמות_רמה', ctx)).toBe('85%');
    expect(resolveContentTags('@אחוז_התקדמות · @אחוז_התקדמות_רמה', ctx)).toBe('40% · 85%');
    expect(resolveContentTags('@אחוז_התקדמות_רמה', {})).toBe('0%');
  });

  it('@מרחק vs @מרחק_יעד', () => {
    expect(resolveContentTags('יעד: @מרחק_יעד', ctx)).toBe('יעד: 5 ק"מ');
    expect(resolveContentTags('@מרחק ממך, יעד @מרחק_יעד', ctx)).toBe('500 מטר ממך, יעד 5 ק"מ');
  });

  it('@שם vs @שם_תוכנית', () => {
    expect(resolveContentTags('תוכנית @שם_תוכנית', ctx)).toBe('תוכנית משיכה');
    expect(resolveContentTags('@שם, תוכנית @שם_תוכנית', ctx)).toBe('דנה, תוכנית משיכה');
  });

  it('@שריר vs @שרירים', () => {
    expect(resolveContentTags('מתמקד ב-@שרירים', ctx)).toBe('מתמקד ב-גב ו-חזה');
    expect(resolveContentTags('@שריר | @שרירים', ctx)).toBe('גב | גב ו-חזה');
  });

  it('a tag glued to a Hebrew prefix letter still resolves (ב@מיקום)', () => {
    expect(resolveContentTags('אימון ב@מיקום', { location: 'park' })).toBe('אימון בפארק');
  });

  it('no resolved output contains a dangling "_word" fragment', () => {
    const text = '@רמה_הבאה @מיקוד_פיזיולוגי @אחוז_התקדמות_רמה @מרחק_יעד @שם_תוכנית @שרירים';
    const out = resolveContentTags(text, ctx);
    expect(hasUnresolvedTagArtifacts(out)).toBe(false);
  });
});

describe('@סקייל_נוכחי / @סטטוס_נפח — no word-duplicating fallback', () => {
  it('resolves to the step name when known', () => {
    expect(resolveContentTags('שלב @סקייל_נוכחי', { currentProgressionStep: 'שכיבות יהלום' }))
      .toBe('שלב שכיבות יהלום');
  });

  it('stays unresolved when unknown (never "שלב השלב הנוכחי") so the row is rejected', () => {
    const out = resolveContentTags('פרוטוקול כוח: שלב @סקייל_נוכחי', {});
    expect(out).not.toContain('השלב הנוכחי');
    expect(hasUnresolvedTagArtifacts(out)).toBe(true);
  });

  it('@סטטוס_נפח resolves with data, stays unresolved without it', () => {
    expect(resolveContentTags('@סטטוס_נפח', { weeklyCompletedSets: 10, weeklySetQuota: 10 }))
      .toBe('הושלם (10/10 סטים)');
    expect(hasUnresolvedTagArtifacts(resolveContentTags('@סטטוס_נפח השבועי שלך מעולה', {}))).toBe(true);
  });
});

describe('hasUnresolvedTagArtifacts', () => {
  it('detects Hebrew and English leftover tags', () => {
    expect(hasUnresolvedTagArtifacts('אימון ב-@שם_הפארק')).toBe(true);
    expect(hasUnresolvedTagArtifacts('קצב @basePace')).toBe(true);
  });

  it('detects dangling fragments from a partially-resolved tag', () => {
    expect(hasUnresolvedTagArtifacts('אתגר כל הרמות_הבאה')).toBe(true);
    expect(hasUnresolvedTagArtifacts('0%_רמה')).toBe(true);
    expect(hasUnresolvedTagArtifacts('גוף מלא_פיזיולוגי')).toBe(true);
  });

  it('passes clean copy', () => {
    expect(hasUnresolvedTagArtifacts('אימון כוח בפארק: רמה 7')).toBe(false);
    expect(hasUnresolvedTagArtifacts('הגוף יודה לך מחר!')).toBe(false);
    expect(hasUnresolvedTagArtifacts('')).toBe(false);
    expect(hasUnresolvedTagArtifacts(null)).toBe(false);
  });
});
