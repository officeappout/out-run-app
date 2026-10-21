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
    // Counted per prefix (pilot prefixes only): other batches add keys to profile.json.
    const pilot = Object.keys(he).filter((k) => /^(skillTree|programPanel|steps)\./.test(k));
    expect(pilot.length).toBe(60);
  });
});

/**
 * `exerciseAnalytics.*` (i18n wave 2): the exercise page v2 (/profile/exercise/[id], enable_home_v2).
 * The `old` side is the original literal / template, copied verbatim from the components. The jsdom
 * parity snapshots cover the page in context; this pins every key and branch (incl. a count ≥ 1000).
 */
describe('profile (he) — exerciseAnalytics.* byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['exerciseAnalytics.hero.back', 'חזרה'],
      ['exerciseAnalytics.hero.eyebrow', 'התקדמות בתרגיל'],
      ['exerciseAnalytics.hero.setGoal', 'הגדרת יעד'],
      ['exerciseAnalytics.page.error.title', 'לא הצלחנו לטעון את ההיסטוריה'],
      ['exerciseAnalytics.page.error.description', 'נסו שוב בעוד רגע.'],
      ['exerciseAnalytics.page.empty', 'אחרי האימון הראשון עם התרגיל הזה, ההתקדמות תופיע כאן.'],
      ['exerciseAnalytics.trend.deltaSuffix', 'מתחילת הטווח'],
      ['exerciseAnalytics.trend.unitReps', 'חזרות'],
      ['exerciseAnalytics.trend.goalReached', 'הגעת ליעד'],
      ['exerciseAnalytics.trend.range.label', 'טווח זמן'],
      ['exerciseAnalytics.trend.range.month', 'חודש'],
      ['exerciseAnalytics.trend.range.threeMonths', '3 חודשים'],
      ['exerciseAnalytics.trend.range.all', 'הכל'],
      ['exerciseAnalytics.trend.metric.label', 'מדד'],
      ['exerciseAnalytics.trend.metric.maxReps', 'שיא בסט'],
      ['exerciseAnalytics.trend.metric.totalVolume', 'נפח כולל'],
      ['exerciseAnalytics.trend.chartLabel', 'מגמה בתרגיל'],
      ['exerciseAnalytics.trend.noSessions', 'אין אימונים בטווח הזה'],
      ['exerciseAnalytics.trend.stat.sessions', 'אימונים'],
      ['exerciseAnalytics.trend.stat.totalReps', 'חזרות בסה״כ'],
      ['exerciseAnalytics.trend.stat.perWeek', 'בשבוע בממוצע'],
      ['exerciseAnalytics.best.title', 'הסט הטוב ביותר'],
      ['exerciseAnalytics.best.unitReps', 'חזרות'],
      ['exerciseAnalytics.best.setsThatDay', 'הסטים באותו אימון'],
      ['exerciseAnalytics.best.improvement.title', 'שיפור מהפעם הקודמת'],
      ['exerciseAnalytics.history.title', 'היסטוריה'],
      ['exerciseAnalytics.history.loadMore', 'טען עוד'],
      ['exerciseAnalytics.history.loadingMore', 'טוען…'],
      ['exerciseAnalytics.goalSheet.title.update', 'עדכון יעד'],
      ['exerciseAnalytics.goalSheet.title.set', 'הגדרת יעד אישי'],
      ['exerciseAnalytics.goalSheet.prompt', 'כמה חזרות בסט תרצו להגיע?'],
      ['exerciseAnalytics.goalSheet.pickerLabel', 'חזרות'],
      ['exerciseAnalytics.goalSheet.saving', 'שומר…'],
      ['exerciseAnalytics.goalSheet.save', 'שמירה'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values (counts passed as strings: no thousands separator, like the old templates)', () => {
    for (const n of [1, 12, 1234]) {
      expect(t('exerciseAnalytics.hero.goal', { goal: String(n) })).toBe(`יעד ${n} חזרות`);
      expect(t('exerciseAnalytics.page.chartShowsLast', { count: String(n) })).toBe(`הגרף מציג את ${n} האימונים האחרונים`);
      expect(t('exerciseAnalytics.trend.toGoal', { count: String(n) })).toBe(`עוד ${n} ליעד`);
      expect(t('exerciseAnalytics.trend.goalLine', { goal: String(n) })).toBe(`יעד ${n}`);
      expect(t('exerciseAnalytics.goalSheet.current', { goal: String(n) })).toBe(`יעד נוכחי: ${n} חזרות`);
      expect(t('exerciseAnalytics.best.improvement.line', { previous: String(n), latest: String(n + 2) })).toBe(
        `פעם קודמת ${n} · היום ${n + 2} חזרות בסט`,
      );
      expect(t('exerciseAnalytics.history.row.subtitle', { reps: String(n), sets: String(3) })).toBe(`${n} חזרות · ${3} סטים`);
    }
  });

  it('history row name — the old [target, best].filter(Boolean).join(" · ")', () => {
    const old = (target: number | null, max: number) =>
      [target != null ? `יעד ${target}` : null, `שיא ${max}`].filter(Boolean).join(' · ');
    for (const [target, max] of [[10, 14], [null, 12], [1500, 1234]] as const) {
      const got =
        target != null
          ? t('exerciseAnalytics.history.row.withTarget', { target: String(target), max: String(max) })
          : t('exerciseAnalytics.history.row.noTarget', { max: String(max) });
      expect(got).toBe(old(target, max));
    }
  });

  it('trend title — the old `שיא בסט · ${RANGE_LABEL[range]}` for every range', () => {
    const RANGE_LABEL: Record<string, string> = { '1m': 'חודש', '3m': '3 חודשים', all: 'הכל' };
    for (const range of ['1m', '3m', 'all']) {
      expect(t('exerciseAnalytics.trend.title', { range })).toBe(`שיא בסט · ${RANGE_LABEL[range]}`);
    }
  });

  it('no exerciseAnalytics.* key is left untested', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('exerciseAnalytics.')).length).toBe(44);
  });
});
