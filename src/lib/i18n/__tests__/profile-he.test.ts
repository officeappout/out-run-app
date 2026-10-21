/**
 * Namespace `profile` (i18n wave 2 pilot): every Hebrew key returns exactly what
 * the code rendered before the extraction. The `old` side of each case is the
 * original literal / template expression, copied verbatim from the component.
 *
 * The static-markup parity snapshots (StepsAnalyticsView, ProgramInfoPanel
 * collapsed, TreePath/TreeNode) cover most keys in context; this test also
 * pins the ones a static render can't reach (expanded panel, swap sheet,
 * SkillTreeScreen's own copy, the "N days ago" fallback).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/profile.json';
import { profile } from '@/messages/ns/profile';
import { makeT } from '../t';

const t = makeT('he', profile);

describe('profile (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['skillTree.unavailable', 'המסלול הזה עדיין לא זמין כמפה — בקרוב.'],
      ['skillTree.back', 'חזרה'],
      ['skillTree.lockedNotice', '🔒 שים לב — זה עוד לא תרגיל ברמה שלך'],
      ['skillTree.unassessed.banner', 'עדיין לא יודעים את הרמה שלך — בצע מבדק כדי לסמן איפה אתה'],
      ['skillTree.unassessed.cta', 'בצע מבדק'],
      ['skillTree.empty', 'לא נמצאו תרגילים למסלול הזה כרגע.'],
      ['skillTree.node.youAreHere', 'אתה כאן'],
      ['skillTree.swap.title', 'גם ברמה הזו'],
      ['skillTree.swap.empty', 'אין תרגילים נוספים ברמה הזו כרגע.'],
      ['skillTree.swap.confirm', 'החלף לתרגיל זה'],
      ['programPanel.levelBadge', 'רמה'],
      ['programPanel.maxLevelReached', 'הגעת לרמה הגבוהה ביותר'],
      ['programPanel.status.label', 'סטטוס'],
      ['programPanel.status.done', 'הושלם'],
      ['programPanel.status.inProgress', 'בתהליך'],
      ['programPanel.reassess', 'עדכון הרמה שלי'],
      ['steps.header.back', 'חזור'],
      ['steps.header.eyebrow', 'ניתוח פעילות'],
      ['steps.header.title', 'צעדים'],
      ['steps.range.label', 'טווח זמן'],
      ['steps.range.day', 'יום'],
      ['steps.range.week', 'שבוע'],
      ['steps.range.month', 'חודש'],
      ['steps.range.year', 'שנה'],
      ['steps.day.today', 'היום'],
      ['steps.day.yesterday', 'אתמול'],
      ['steps.hero.today', 'היום'],
      ['steps.delta.vsLastWeek', 'מול שבוע שעבר'],
      ['steps.goal.progressLabel', 'התקדמות ליעד היומי'],
      ['steps.goal.reached', 'היעד הושג'],
      ['steps.unit.steps', 'צעדים'],
      ['steps.unit.days', 'ימים'],
      ['steps.unit.km', 'ק״מ'],
      ['steps.stat.total', 'סה״כ'],
      ['steps.stat.dailyAverage', 'ממוצע יומי'],
      ['steps.stat.best', 'שיא'],
      ['steps.stat.daysAtGoal', 'ימים ביעד'],
      ['steps.stat.streak', 'רצף'],
      ['steps.stat.distance', 'מרחק'],
      ['steps.chart.last7Days', 'צעדים בשבעת הימים האחרונים'],
      ['steps.chart.byMonth', 'צעדים לפי חודש'],
      ['steps.chart.byDay', 'צעדים לפי יום'],
      ['steps.chart.tapHint', 'הקש/י על עמודה לפרטים'],
      ['steps.connect.prompt', 'חבר/י את נתוני הבריאות כדי לראות את הצעדים האמיתיים שלך'],
      ['steps.connect.cta', 'התחבר לאפליקציית הבריאות'],
      ['steps.error.title', 'שגיאה בטעינת הנתונים'],
      ['steps.error.retry', 'נסה שוב מאוחר יותר'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('values', () => {
    const min = 2, max = 9, target = 'מתח ביד אחת', level = 4, from = 6, to = 7, name = 'שכיבת סמיכה';
    expect(t('skillTree.title.levelRange', { min, max })).toBe(`רמה ${min} מתוך ${max}` + '');
    expect(t('skillTree.title.levelRangeWithTarget', { min, max, target })).toBe(`רמה ${min} מתוך ${max}` + ` · היעד: ${target}`);
    expect(t('skillTree.gap.single', { level })).toBe(`${`רמה ${level}`} · אין תרגיל ייעודי`);
    expect(t('skillTree.gap.range', { from, to })).toBe(`${`רמות ${from}–${to}`} · אין תרגיל ייעודי`);
    expect(t('skillTree.node.targetName', { name })).toBe(`היעד · ${name}`);

    const pct = 37, nextLevel = 5, safeMaxLevel = 12, currentLevel = 4;
    expect(t('programPanel.toNextLevel', { remaining: 100 - pct, next: nextLevel, max: safeMaxLevel })).toBe(
      `עוד ${100 - pct}% לרמה ${nextLevel} · מתוך ${safeMaxLevel}`,
    );
    expect(t('programPanel.yourLevel', { level: currentLevel })).toBe(`הרמה שלך · ${currentLevel}: `);
    for (const unit of ['seconds', 'reps'] as const) {
      expect(t('programPanel.goal', { value: 8, unit })).toBe(`יעד: ${8} ${unit === 'seconds' ? 'שניות' : 'חזרות'}`);
    }

    expect(t('steps.day.daysAgo', { n: 3 })).toBe(`לפני ${3}`);
    expect(t('steps.ring.ofGoal', { goal: (8000).toLocaleString('he-IL') })).toBe(`מתוך ${(8000).toLocaleString('he-IL')} צעדים`);
  });

  it('rich (tagged) messages keep the text around the number', () => {
    const tag = (c: unknown[]) => `[${c.join('')}]`;
    expect(t.rich('steps.goal.percentOf', { pct: 54, num: tag }).join('')).toBe('[54%] מהיעד');
    expect(t.rich('steps.goal.target', { goal: '8,000', num: tag }).join('')).toBe('יעד [8,000]');
    expect(t.rich('steps.chart.dailyGoal', { goal: '8,000', num: tag }).join('')).toBe('יעד יומי [8,000]');
  });

  it('no key is left untested', () => {
    // Keep this list in step with the catalog: a new key needs a case above.
    expect(Object.keys(he).length).toBe(60);
  });
});
