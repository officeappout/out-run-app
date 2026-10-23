/**
 * i18n wave 2 batch aj (namespace `home`): adjuster.* / nextRun.* / dayDisplay.* / weekStrip.* / statsOverview.* —
 * byte-identical to the literals they replaced (copied verbatim from the components as they were), including what a
 * render can't reach (the day peek bubble, the train-ahead modal, the step-deficit route card, the failed-rebuild copy).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';

const t = makeT('he', home);
const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;

describe('home (he) — batch aj, UserWorkoutAdjuster', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['adjuster.title', 'התאמת אימון'],
      ['adjuster.close', 'סגור'],
      ['adjuster.cta.loading', 'מייצר אימון…'],
      ['adjuster.cta.update', 'עדכן אימון'],
      ['adjuster.location.title', 'מיקום'],
      ['adjuster.location.outdoor.label', 'בחוץ'],
      ['adjuster.location.outdoor.sub', 'פארק / מגרש'],
      ['adjuster.location.indoor.label', 'בבית'],
      ['adjuster.location.indoor.sub', 'אימון ביתי'],
      ['adjuster.duration.title', `משך זמן`],
      ['adjuster.muscles.title', 'אזור אימון'],
      ['adjuster.muscles.sub', '(ריק = כל הגוף)'],
      ['adjuster.skills.title', 'מיקוד סקיל'],
      ['adjuster.skills.sub', '(כלי לאימון ממוקד)'],
      ['adjuster.skill.handstand', 'עמידת ידיים'],
      ['adjuster.skill.frontLever', 'פרונט לבר'],
      ['adjuster.skill.backLever', 'בק לבר'],
      ['adjuster.skill.oap', 'משיכה חד ידנית'],
      ['adjuster.skill.muscleUp', 'מוסל אפ'],
      ['adjuster.skill.planche', 'פלאנש'],
      ['adjuster.skill.pullUpPro', 'מתח מתקדם'],
      ['adjuster.skill.lSit', 'L-Sit'],
      ['adjuster.intensity.title', 'עוצמה'],
      ['adjuster.intensity.easy.label', '⚡ קל'],
      ['adjuster.intensity.easy.sub', 'שחזור'],
      ['adjuster.intensity.medium.label', '⚡⚡ בינוני'],
      ['adjuster.intensity.medium.sub', 'מאוזן'],
      ['adjuster.intensity.hard.label', '⚡⚡⚡ עצים'],
      ['adjuster.intensity.hard.sub', 'פרו'],
      ['adjuster.equipment.title', 'ציוד'],
      ['adjuster.equipment.yes.title', 'יש לי ציוד'],
      ['adjuster.equipment.yes.sub', 'מוטות, רצועות, משקולות'],
      ['adjuster.equipment.no.title', 'רק משקל גוף'],
      ['adjuster.equipment.no.sub', 'ללא ציוד כלל'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(count('adjuster.')).toBe(cases.length + 3); // + error, duration.value, skills.focus
  });

  it('values', () => {
    for (const n of [5, 30, 60, 1234]) expect(t('adjuster.duration.value', { n: String(n) })).toBe(`${n} דק׳`);
    expect(t('adjuster.skills.focus', { skill: 'עמידת ידיים' })).toBe('האימון יתמקד ב-עמידת ידיים');
  });

  it('the failed-generation message by gender (pickGendered: male / female / other)', () => {
    const old = { male: 'לא הצלחנו ליצור אימון. נסה שוב.', female: 'לא הצלחנו ליצור אימון. נסי שוב.', other: 'לא הצלחנו ליצור אימון. נסו שוב.' };
    for (const gender of ['male', 'female', 'other'] as const) expect(t('adjuster.error', { gender })).toBe(old[gender]);
    expect(t('adjuster.error', { gender: 'zzz' })).toBe(old.other);
  });
});

describe('home (he) — batch aj, NextRunWorkoutCard', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['nextRun.stuck.title', 'לא הצלחנו להכין את תוכנית הריצה שלך.'],
      ['nextRun.stuck.failedTitle', 'עדיין לא מצליח.'],
      ['nextRun.stuck.body', 'כל מה שמילאת שמור. לחיצה אחת ונבנה אותה.'],
      ['nextRun.stuck.failedBody', 'בדוק את החיבור לאינטרנט ונסה שוב.'],
      ['nextRun.stuck.cta.build', 'בנה את התוכנית'],
      ['nextRun.stuck.cta.building', 'בונה...'],
      ['nextRun.stuck.cta.retry', 'נסה שוב'],
      ['nextRun.missing.title', 'משהו חסר בהגדרת הריצה שלך.'],
      ['nextRun.missing.body', 'נעבור שוב על ההגדרה — זה ייקח דקה.'],
      ['nextRun.none.preparing.title', 'התוכנית שלך בהכנה'],
      ['nextRun.none.preparing.body', 'לוח האימונים ייווצר בכניסה הבאה'],
      ['nextRun.none.empty.title', 'אין תוכנית ריצה'],
      ['nextRun.none.empty.body', 'השלם/י את ההרשמה כדי ליצור תוכנית'],
      ['nextRun.label.interval', 'אינטרוולים קצרים'],
      ['nextRun.label.tempo', 'ריצת טמפו'],
      ['nextRun.label.long', 'ריצה ארוכה'],
      ['nextRun.rest.title', 'היום זה להתאושש 🧘'],
      ['nextRun.rest.undo', 'ביטול — אני בכל זאת רוצה להתאמן'],
      ['nextRun.fallbackName', 'אימון ריצה'],
      ['nextRun.today.title', 'האימון שלך היום'],
      ['nextRun.today.start', 'התחל ריצה'],
      ['nextRun.today.skip', 'אין לי כוח היום — דלג לעוד'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(count('nextRun.')).toBe(cases.length + 6); // + label.easy, programLabel, rest.tomorrow / inDays / next, today.minutes
  });

  it('values: the old DIST_LABEL / templates for every distance', () => {
    const DIST_LABEL: Record<string, string> = { '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ', maintenance: '5 ק״מ' };
    const DIST_KM: Record<string, number> = { '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5 };
    for (const dist of ['2k', '3k', '5k', '10k', 'maintenance', 'weird']) {
      const distLabel = DIST_LABEL[dist] ?? '5 ק״מ';
      const km = String(DIST_KM[dist] ?? 5);
      expect(t('nextRun.label.easy', { km })).toBe(`ריצה קלה — ${distLabel}`);
      expect(t('nextRun.programLabel', { km })).toBe(`תוכנית ${distLabel}`);
    }
    for (const name of ['ריצת טמפו', 'אימון ריצה']) {
      expect(t('nextRun.rest.tomorrow', { name })).toBe(`מחר מחכה לך: ${name}`);
      expect(t('nextRun.rest.inDays', { days: '3', name })).toBe(`בעוד 3 ימים: ${name}`);
      expect(t('nextRun.rest.inDays', { days: '1234', name })).toBe(`בעוד 1234 ימים: ${name}`);
      expect(t('nextRun.rest.next', { name })).toBe(`הבא בתור: ${name}`);
    }
    for (const m of [12, 60, 1234]) expect(t('nextRun.today.minutes', { minutes: String(m) })).toBe(`~${m} דקות`);
  });
});

describe('home (he) — batch aj, day-display.utils', () => {
  it('short labels, category fallbacks, rest / bonus / steps', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['dayDisplay.label.upper', 'עליון'],
      ['dayDisplay.label.pull', 'מתח'],
      ['dayDisplay.label.full', 'שלם'],
      ['dayDisplay.label.lower', 'תחתון'],
      ['dayDisplay.label.core', 'ליבה'],
      ['dayDisplay.label.run', 'ריצה'],
      ['dayDisplay.label.walk', 'הליכה'],
      ['dayDisplay.label.health', 'בריאות'],
      ['dayDisplay.label.easy', 'קלה'],
      ['dayDisplay.label.volume', 'נפח'],
      ['dayDisplay.label.sprint', 'ספרינט'],
      ['dayDisplay.label.interval', 'אינטרוול'],
      ['dayDisplay.label.fartlek', 'פארטלק'],
      ['dayDisplay.label.tempo', 'טמפו'],
      ['dayDisplay.label.hills', 'גבעות'],
      ['dayDisplay.label.strides', 'סטריידס'],
      ['dayDisplay.label.recovery', 'שחזור'],
      ['dayDisplay.category.strength', 'כוח'],
      ['dayDisplay.category.cardio', 'ריצה'],
      ['dayDisplay.category.maintenance', 'גמישות'],
      ['dayDisplay.restLabel', 'מנוחה'],
      ['dayDisplay.restAria', 'מנוחה'],
      ['dayDisplay.bonus', 'בונוס'],
      ['dayDisplay.steps', 'צעדים'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(count('dayDisplay.')).toBe(cases.length);
  });
});

describe('home (he) — batch aj, SmartWeeklySchedule', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['weekStrip.loading', 'טוען לו״ז שבועי...'],
      ['weekStrip.title', 'לו״ז אימונים'],
      ['weekStrip.toMonth.title', 'הצג תצוגה חודשית'],
      ['weekStrip.toMonth.aria', 'תצוגה חודשית'],
      ['weekStrip.toWeek.title', 'הצג תצוגה שבועית'],
      ['weekStrip.toWeek.aria', 'תצוגה שבועית'],
      ['weekStrip.sync', 'סנכרון ליומן'],
      ['weekStrip.edit', 'שינוי לוז'],
      ['weekStrip.overlay.assess', 'התחל אבחון'],
      ['weekStrip.overlay.schedule', 'קבע לו״ז אימונים'],
      ['weekStrip.run.fallback', 'אימון ריצה'],
      ['weekStrip.run.today', 'האימון שלך היום'],
      ['weekStrip.run.todayBadge', 'היום'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(count('weekStrip.')).toBe(cases.length + 9); // + dayAria, run.progress / workoutN / duration, peek.* (5)
  });

  it('the day cell aria-label: every combination', () => {
    const names = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];
    for (const name of names) {
      for (const isToday of [false, true]) {
        for (const planned of [false, true]) {
          const old = `${name}${isToday ? ', היום' : ''}${planned ? ', אימון מתוכנן' : ', יום מנוחה'}`;
          expect(t('weekStrip.dayAria', { day: name, today: isToday ? 'yes' : 'no', planned: planned ? 'yes' : 'no' })).toBe(old);
        }
      }
    }
  });

  it('running cards: progress, workout number, duration hint for every category', () => {
    expect(t('weekStrip.run.progress', { week: '3', done: '1', total: '4' })).toBe('שבוע 3 · 1/4');
    expect(t('weekStrip.run.progress', { week: '1234', done: '1000', total: '2000' })).toBe('שבוע 1234 · 1000/2000');
    expect(t('weekStrip.run.workoutN', { n: '2' })).toBe('אימון 2');
    const CATEGORY_DURATION_ESTIMATE: Record<string, string> = {
      easy_run: '25–35 דק׳',
      recovery: '20–25 דק׳',
      short_intervals: '30–40 דק׳',
      long_intervals: '35–45 דק׳',
      fartlek_easy: '30–35 דק׳',
      fartlek_structured: '35–40 דק׳',
      tempo: '30–40 דק׳',
      long_run: '45–60 דק׳',
      hill_long: '35–45 דק׳',
      hill_short: '25–35 דק׳',
      hill_sprints: '25–30 דק׳',
      strides: '25–30 דק׳',
    };
    for (const category of [...Object.keys(CATEGORY_DURATION_ESTIMATE), '', 'zzz']) {
      expect(t('weekStrip.run.duration', { category }), category).toBe(CATEGORY_DURATION_ESTIMATE[category] ?? '30 דק׳');
    }
  });

  it('the day peek bubble (behind a tap on a flame day)', () => {
    for (const min of [5, 35, 1234]) {
      expect(t('weekStrip.peek.strength', { min: String(min) })).toBe(`כוח · ${min} דק׳`);
      expect(t('weekStrip.peek.cardio', { min: String(min) })).toBe(`אירובי · ${min} דק׳`);
      expect(t('weekStrip.peek.maintenance', { min: String(min) })).toBe(`גמישות · ${min} דק׳`);
    }
    for (const steps of [800, 4321, 12345]) expect(t('weekStrip.peek.steps', { steps: steps.toLocaleString('he-IL') })).toBe(`${steps.toLocaleString('he-IL')} צעדים`);
    expect(t('weekStrip.peek.aria', { day: 'יום שלישי' })).toBe('מה עשית ביום שלישי');
    expect(count('weekStrip.peek.')).toBe(5);
  });
});

describe('home (he) — batch aj, StatsOverview', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['statsOverview.hero.title', 'האימון היומי שלך'],
      ['statsOverview.hero.locked', 'התאימו את האימונים לרמה שלכם .'],
      ['statsOverview.hero.ready', 'מוכן להתחיל?'],
      ['statsOverview.stepRoute.cta', 'הליכה עד היעד'],
      ['statsOverview.teaser.aria', 'בואו נגלה כמה אתם חזקים'],
      ['statsOverview.teaser.title', 'בואו נגלה כמה אתם חזקים'],
      ['statsOverview.teaser.sub', 'שאלון של דקה — והכול נפתח'],
      ['statsOverview.trainAhead.title', 'רוצה להקדים את האימון שלך?'],
      ['statsOverview.trainAhead.confirm', 'אני רוצה לעשות את האימון היום!'],
      ['statsOverview.trainAhead.dismiss', 'תשאירו ביום המקורי'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
    expect(count('statsOverview.')).toBe(cases.length + 3); // + stepRoute.km / minutes, trainAhead.body
  });

  it('the step-deficit route card and the train-ahead modal (behind a trio / a tap)', () => {
    for (const d of [0.4, 2.345, 12]) expect(t('statsOverview.stepRoute.km', { km: d.toFixed(1) })).toBe(`${d.toFixed(1)} ק״מ`);
    for (const m of [9, 27, 1234]) expect(t('statsOverview.stepRoute.minutes', { min: String(m) })).toBe(`~${m} דק׳`);
    for (const targetDayName of ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']) {
      expect(t('statsOverview.trainAhead.body', { day: targetDayName })).toBe(`האימון הזה מתוכן ליום ${targetDayName}. רוצה לבצע אותו עכשיו ולשמור להיום?`);
    }
  });
});
