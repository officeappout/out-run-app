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
 * Progress tab v2 (`hub.*`, i18n wave 2 batch 1): every key equals the literal /
 * template the component had before the extraction, copied verbatim. The
 * static-markup parity snapshots (src/features/progression-hub/v2/components/
 * __tests__/progress-hub-i18n-parity.test.tsx) cover most keys in context; this
 * test also pins the ones a static render can't reach ("הצג פחות" behind a tap)
 * and counts ≥ 1000.
 */
describe('profile hub.* (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['hub.screen.title', 'התקדמות'],
      ['hub.screen.subtitle', 'מה עשית, איפה השתפרת, לאן ממשיכים'],
      ['hub.screen.periodLabel', 'תקופה'],
      ['hub.screen.period.week', 'השבוע'],
      ['hub.screen.period.month', 'החודש'],
      ['hub.screen.error.title', 'לא הצלחנו לטעון את הסיכום'],
      ['hub.screen.error.description', 'נסו שוב בעוד רגע.'],
      ['hub.tabs.title', 'לפי פעילות'],
      ['hub.tabs.pickerLabel', 'בחירת פעילות'],
      ['hub.tabs.option.run', 'ריצה'],
      ['hub.tabs.option.walk', 'הליכה'],
      ['hub.tabs.option.steps', 'צעדים'],
      ['hub.tabs.option.strength', 'כוח'],
      ['hub.tabs.error.title', 'לא הצלחנו לטעון את הנתונים'],
      ['hub.tabs.error.retry', 'נסו שוב'],
      ['hub.days.legend.strength', 'כוח'],
      ['hub.days.legend.cardio', 'ריצה'],
      ['hub.days.legend.steps', 'הליכה'],
      ['hub.days.lightHint', 'בהיר = פחות מ-20 דק׳'],
      ['hub.consistency.title', 'התמדה'],
      ['hub.consistency.notCounted', 'לא נספר'],
      ['hub.consistency.notCountedToday', 'עוד לא נספר'],
      ['hub.consistency.showLess', 'הצג פחות'],
      ['hub.compare.sheetTitle', 'השוואה'],
      ['hub.compare.now.week', 'השבוע'],
      ['hub.compare.now.month', 'החודש'],
      ['hub.compare.before.week', 'שבוע שעבר'],
      ['hub.compare.empty', 'עוד אין מה להשוות — אימון אחד ויש לנו נקודת התחלה.'],
      ['hub.summary.vs.week', 'מול שבוע שעבר'],
      ['hub.summary.stat.workouts', 'אימונים'],
      ['hub.summary.stat.kmUnit', 'ק״מ'],
      ['hub.summary.stat.km', 'ריצה והליכה'],
      ['hub.summary.stat.steps.week', 'צעדים'],
      ['hub.summary.stat.steps.month', 'צעדים ליום'],
      ['hub.programs.running', 'תוכנית ריצה'],
      ['hub.run.empty', 'עוד אין ריצות שמורות. הריצה הראשונה תופיע כאן.'],
      ['hub.run.hero.unit', 'ק״מ'],
      ['hub.run.hero.label', 'החודש'],
      ['hub.run.stat.count', 'ריצות'],
      ['hub.run.stat.pace', 'קצב ממוצע'],
      ['hub.run.stat.timeUnit', 'שע׳'],
      ['hub.run.stat.time', 'זמן ריצה'],
      ['hub.run.chart.km.title', 'ק״מ לשבוע'],
      ['hub.run.chart.km.hint', '8 שבועות'],
      ['hub.run.chart.km.aria', 'ק״מ ריצה לשבוע, 8 שבועות'],
      ['hub.run.chart.pace.title', 'מגמת קצב'],
      ['hub.run.chart.pace.hint', 'דק׳ לק״מ · למעלה = מהיר יותר'],
      ['hub.run.chart.pace.aria', 'קצב ב-10 הריצות האחרונות'],
      ['hub.run.prediction.title', 'חיזוי זמנים'],
      ['hub.run.prediction.basis', 'לפי קצב הבסיס שלך'],
      ['hub.run.recent.title', 'ריצות אחרונות'],
      ['hub.run.recent.fallbackTitle', 'ריצה'],
      ['hub.walk.empty', 'עוד אין הליכות שתועדו כאימון. ההליכה הראשונה תופיע כאן.'],
      ['hub.walk.subtitle', 'הליכות שתועדו כאימון'],
      ['hub.walk.hero.unit', 'ק״מ'],
      ['hub.walk.hero.label', 'החודש'],
      ['hub.walk.stat.count', 'הליכות'],
      ['hub.walk.stat.timeUnit', 'שע׳'],
      ['hub.walk.stat.time', 'זמן הליכה'],
      ['hub.walk.stat.pace', 'קצב ממוצע'],
      ['hub.walk.chart.title', 'דקות הליכה לשבוע'],
      ['hub.walk.chart.hint', '8 שבועות'],
      ['hub.walk.chart.aria', 'דקות הליכה לשבוע, 8 שבועות'],
      ['hub.walk.recent.title', 'הליכות אחרונות'],
      ['hub.walk.recent.fallbackTitle', 'הליכה'],
      ['hub.steps.empty', 'עוד אין נתוני צעדים. חברו את אפליקציית הבריאות כדי לראות אותם כאן.'],
      ['hub.steps.title', 'ממוצע יומי · השבוע'],
      ['hub.steps.subtitle', 'מול שבוע שעבר'],
      ['hub.steps.unit', 'צעדים'],
      ['hub.steps.daysInGoal', 'ימים ביעד השבוע'],
      ['hub.steps.goalStreakUnit', 'ימים'],
      ['hub.steps.goalStreak', 'רצף ביעד'],
      ['hub.steps.kmUnit', 'ק״מ'],
      ['hub.steps.weekKm', 'מרחק השבוע'],
      ['hub.steps.chart.title', '30 הימים האחרונים'],
      ['hub.steps.chart.hint', 'צעדים ביום'],
      ['hub.steps.chart.aria', 'צעדים ב-30 הימים האחרונים'],
      ['hub.steps.fullAnalysis', 'לניתוח הצעדים המלא · יום · שבוע · חודש · שנה'],
      ['hub.strength.empty', 'עוד אין אימוני כוח שמורים. האימון הראשון יופיע כאן.'],
      ['hub.strength.title', 'כוח · השבוע'],
      ['hub.strength.subtitle', 'מול שבוע שעבר'],
      ['hub.strength.hero.unit', 'סטים'],
      ['hub.strength.hero.label', 'השבוע'],
      ['hub.strength.stat.count', 'אימונים'],
      ['hub.strength.stat.timeUnit', 'שע׳'],
      ['hub.strength.stat.time', 'זמן אימון'],
      ['hub.strength.domains.title', 'לפי קבוצת שרירים'],
      ['hub.strength.chart.title', 'סטים לשבוע'],
      ['hub.strength.chart.hint', '8 שבועות'],
      ['hub.strength.chart.aria', 'סטים לשבוע, 8 שבועות'],
      ['hub.strength.exercises.title', 'התרגילים שלך'],
      ['hub.strength.exercises.lastWorkout', 'אימון אחרון'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(cases.length).toBe(92);
  });

  it('values — the old templates, verbatim, including counts ≥ 1000', () => {
    const n = 1234;
    const active = n, bestRun = n, currentStreak = n, longestStreak = n;
    const counted = { length: n }, days = { length: 1500 };
    const STREAK_MINIMUM_MINUTES = 10;
    expect(t('hub.days.active', { count: String(active) })).toBe(`${active} ימי פעילות`);
    expect(t('hub.days.bestRun', { count: String(bestRun) })).toBe(`רצף שיא החודש · ${bestRun} ימים`);
    expect(t('hub.consistency.titleWithStreak', { count: String(currentStreak) })).toBe(`התמדה${currentStreak > 0 ? ` · רצף ${currentStreak} ימים` : ''}`);
    expect(t('hub.consistency.countedWithBest', { best: String(longestStreak), counted: String(counted.length), total: String(days.length) })).toBe(
      `${longestStreak > 1 ? `השיא שלך ${longestStreak} ימים · ` : ''}${counted.length} מתוך ${days.length} הימים נספרו`,
    );
    expect(t('hub.consistency.counted', { counted: String(counted.length), total: String(days.length) })).toBe(
      `${counted.length} מתוך ${days.length} הימים נספרו`,
    );
    expect(t('hub.consistency.rule', { minutes: String(STREAK_MINIMUM_MINUTES) })).toBe(
      `יום נספר לרצף כשיש לפחות ${STREAK_MINIMUM_MINUTES} דק׳ פעילות (כוח, ריצה, הליכה, התאוששות) או כשהגעת ליעד הצעדים היומי.`,
    );
    for (const isToday of [false, true]) {
      const d = { minutes: n, isToday };
      expect(t(d.isToday ? 'hub.consistency.dayMinutesToday' : 'hub.consistency.dayMinutes', { minutes: String(d.minutes) })).toBe(
        `${d.minutes} דק׳ פעילות${d.isToday ? ' · היום' : ''}`,
      );
    }
    expect(t('hub.consistency.showAll', { count: String(days.length) })).toBe(`הצג את כל ${days.length} הימים`);

    // NewRecordHighlight: the meta line joins the pieces with " · " exactly as the old JSX did.
    const top = { label: 'מתח', value: '12', unit: 'חזרות', date: '20 באוק׳' };
    const more = 1234;
    expect(t('hub.newRecord.title', { label: top.label })).toBe(`שיא חדש · ${top.label}`);
    const detail = [`${top.value} ${top.unit}`, top.date, t('hub.newRecord.more', { count: String(more) })].join(' · ');
    expect(t('hub.newRecord.meta', { detail })).toBe(`${top.value}${` ${top.unit}`}${` · ${top.date}`}${` · ועוד ${more}`} · לכל השיאים בפרופיל`);

    const range = '19–25 באוק׳', month = 'אוקטובר', year = 2026, beforeLabel = 'ספטמבר', nowLabel = 'החודש';
    for (const p of ['compare', 'summary'] as const) {
      expect(t(`hub.${p}.title.week`, { range })).toBe(`השבוע שלך · ${range}`);
      expect(t(`hub.${p}.title.month`, { month, year: String(year) })).toBe(`${month} ${year} · עד היום`);
    }
    expect(t('hub.compare.vs', { before: beforeLabel })).toBe(`מול ${beforeLabel} באותו שלב`);
    expect(t('hub.compare.splitTitle', { now: nowLabel })).toBe(`${nowLabel} לפי פעילות`);

    const vs = `מול ${month} באותו שלב`, label = 'אימונים', time = { value: '1,234', unit: 'דק׳' };
    expect(t('hub.summary.vs.month', { month })).toBe(vs);
    expect(t('hub.summary.compareStatAria', { label })).toBe(`השוואה · ${label}`);
    expect(t('hub.summary.compareRingAria', { vs })).toBe(`השוואה ${vs}`);
    expect(t('hub.summary.ringLabel', { value: time.value, unit: time.unit })).toBe(`${time.value} ${time.unit} פעילות`);
    expect(t('hub.summary.ringUnit', { unit: time.unit })).toBe(`${time.unit} פעילות`);
    expect(t('hub.summary.chipAria', { label: 'כוח', minutes: String(n) })).toBe(`${'כוח'} · ${n} דקות`);

    const plan = { currentWeek: 3, weeks: 8, done: 1234, dueSoFar: 1500 };
    expect(t('hub.runningPlan.progress', { week: String(plan.currentWeek), weeks: String(plan.weeks), done: String(plan.done), due: String(plan.dueSoFar) })).toBe(
      `שבוע ${plan.currentWeek} מתוך ${plan.weeks} · ${plan.done}/${plan.dueSoFar} אימונים בוצעו`,
    );
    expect(t('hub.weekStrip.activeDays', { count: String(n) })).toBe(`${n} ימי פעילות השבוע`);
    expect(t('hub.weekStrip.streak', { count: String(n) })).toBe(`רצף ${n} ימים`);

    const prevMonth = 'ספטמבר', day = 'אתמול', km = '11.4', pace = '5:27', minutes = 1234;
    expect(t('hub.run.title', { month })).toBe(`ריצה · ${month}`);
    expect(t('hub.run.subtitle', { month: prevMonth })).toBe(`עד היום, מול ${prevMonth} באותו שלב`);
    for (const title of [undefined, 'ריצת בוקר']) {
      expect(t('hub.run.recent.rowTitle', { title: title ?? t('hub.run.recent.fallbackTitle'), km })).toBe(`${title ?? 'ריצה'} · ${km} ק״מ`);
      expect(t('hub.walk.recent.rowTitle', { title: title ?? t('hub.walk.recent.fallbackTitle'), km })).toBe(`${title ?? 'הליכה'} · ${km} ק״מ`);
    }
    expect(t('hub.run.recent.rowMeta', { day, pace, minutes: String(minutes) })).toBe(`${day} · ${pace} דק׳/ק״מ · ${minutes} דק׳`);
    expect(t('hub.walk.title', { month })).toBe(`הליכה · ${month}`);
    expect(t('hub.walk.recent.rowMeta', { day, minutes: String(minutes) })).toBe(`${day} · ${minutes} דק׳`);

    const s = { today: '4,321', goal: '10,000', date: '9 באוק׳' }, pct = 43;
    expect(t('hub.steps.todayLine', { today: s.today, pct: String(pct), goal: s.goal })).toBe(`היום ${s.today} · ${pct}% מהיעד (${s.goal})`);
    expect(t('hub.steps.best', { date: s.date })).toBe(`שיא · ${s.date}`);
    expect(t('hub.steps.chart.goal', { goal: s.goal })).toBe(`יעד ${s.goal}`);

    const lastBest = 1234;
    expect(t('hub.strength.exercises.lastBest', { best: String(lastBest) })).toBe(`הסט הטוב באימון האחרון ${lastBest}`);
  });

  it('rich: "{sets} <unit>סטים</unit>" keeps the number, the space and the unit', () => {
    const tag = (c: unknown[]) => `[${c.join('')}]`;
    expect(t.rich('hub.strength.domains.sets', { sets: String(1234), unit: tag }).join('')).toBe('1234 [סטים]');
  });

  it('every hub.* key has a case', () => {
    const hub = Object.keys(he).filter((k) => k.startsWith('hub.'));
    expect(hub.length).toBe(131);
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
