/**
 * i18n wave 2 batch ay (namespaces common ui.* / library favorites.* / profile recentActivity.* / home / pages):
 * every key equals the old literal / template, copied verbatim — including what a static render can't reach (the
 * ErrorBoundary default UI, the link-account / report errors the roadmap + explorer toast).
 */
import { describe, expect, it } from 'vitest';
import { common } from '@/messages/ns/common';
import { library } from '@/messages/ns/library';
import { profile } from '@/messages/ns/profile';
import { home } from '@/messages/ns/home';
import { pages } from '@/messages/ns/pages';
import { makeT } from '../t';
import { pickGendered } from '../gender-copy';

const GENDERS = ['female', 'male', 'other'] as const;
const tc = makeT('he', common);

describe('common (plain)', () => {
  it('plain keys', () => {
    const cases: Array<[Parameters<typeof tc>[0], string]> = [
      ['actions.retry', 'נסו שוב'],
      ['actions.notNow', 'לא עכשיו'],
      ['ui.loading.label', 'טוען'],
      ['ui.connecting', 'מתחבר...'],
      ['ui.errorBoundary.title', 'שגיאה בטעינת הרכיב'],
      ['ui.errorBoundary.body', 'אירעה שגיאה בלתי צפויה. הנתונים שלך נשמרו באופן אוטומטי.'],
      ['ui.errorBoundary.details', 'פרטים טכניים'],
      ['ui.existingAccount.title', 'החשבון הזה כבר רשום אצלנו'],
      ['ui.linkAccount.defaultMessage', 'כדי לעקוב / לשלוח הודעה צריך לקשר חשבון'],
      ['ui.linkAccount.explain', 'פעולות שרואים אותן משתמשים אחרים (עקוב, הודעות) דורשות חשבון מקושר. זה לא חושף נתונים חדשים — רק מאבטח את החשבון שלך.'],
      ['ui.linkAccount.google', 'המשך עם Google'],
      ['ui.linkAccount.apple', 'המשך עם Apple'],
      ['ui.system.compact.title', 'לא הצלחנו לטעון את הכרטיס'],
      ['ui.system.compact.description', 'שאר המסך עובד כרגיל'],
      ['ui.system.live.title', 'משהו השתבש באימון'],
      ['ui.system.live.description', 'זמן האימון שלך נשמר. אפשר לחזור לאימון ולהמשיך.'],
      ['ui.system.live.resume', 'המשך אימון'],
      ['ui.system.live.backToMap', 'חזרה למפה'],
      ['ui.system.live.exitHome', 'יציאה לדף הבית'],
      ['ui.system.route.title', 'משהו השתבש'],
      ['ui.system.route.description', 'זה קורה לפעמים. אפשר לנסות שוב — שום דבר לא נמחק.'],
      ['ui.system.route.newVersionTitle', 'יש גרסה חדשה'],
      ['ui.system.route.newVersionBody', 'גרסה חדשה של האפליקציה זמינה. רעננו כדי להמשיך.'],
      ['ui.system.route.reload', 'רענן עמוד'],
      ['ui.pushToast.dismiss', 'סגור התראה'],
      ['ui.pushToast.region', 'התראות פוש בזמן אמת'],
      ['ui.communityLogo.alt', 'קהילה'],
      ['ui.done.aria', 'בוצע'],
      ['ui.sheet.collapse', 'כווץ'],
      ['ui.sheet.expand', 'הרחב'],
      ['ui.improvement.title', 'שיפור מהפעם הקודמת'],
      ['ui.journey.repeat', 'חזרות'],
      ['ui.chart.aria', 'גרף'],
      ['ui.stepBar.aria', 'התקדמות'],
      ['ui.report.button', 'דווח על בעיה'],
      ['ui.report.intro', 'מה לא הסתדר באימון או במסלול? זה עוזר לנו לשפר את מה שהאפליקציה בונה.'],
      ['ui.report.notePlaceholder', 'רוצה להוסיף משהו? (לא חובה)'],
      ['ui.report.sent', 'תודה! הדיווח נשלח.'],
      ['ui.report.sending', 'שולח…'],
      ['ui.report.send', 'שליחה'],
    ];
    for (const [key, old] of cases) expect(tc(key)).toBe(old);
  });

  it('values', () => {
    for (const provider of ['Google', 'Apple']) {
      expect(tc('ui.existingAccount.body', { provider })).toBe(`אפשר להיכנס לחשבון ה-${provider} הקיים, אבל מה שעשית עכשיו כאורח לא יעבור לשם.`);
      expect(tc('ui.existingAccount.enter', { provider })).toBe(`כניסה לחשבון ה-${provider} הקיים`);
    }
    expect(tc('ui.cart.aria', { done: String(3) })).toBe(`רשימת האימון · ${3} הושלמו`);
    expect(tc('ui.chart.goal', { goal: '2.5' })).toBe(`יעד ${'2.5'}`);
    expect(tc('ui.improvement.count', { n: 1 })).toBe('תרגיל אחד השתפר');
    for (const n of [2, 3, 12]) expect(tc('ui.improvement.count', { n })).toBe(`${n} תרגילים השתפרו`);
  });

  it('gendered link-account + report copy, every branch', () => {
    const g = (gender: string, male: string, female: string, other: string) => pickGendered(gender as never, { male, female, other });
    for (const gender of GENDERS) {
      expect(tc('ui.linkAccount.error.exists', { provider: 'Google', gender })).toBe(`חשבון ${'Google'} זה כבר בשימוש. ${g(gender, 'אנא נסה חשבון אחר.', 'אנא נסי חשבון אחר.', 'אנא נסו חשבון אחר.')}`);
      expect(tc('ui.linkAccount.error.timeout', { gender })).toBe(g(gender, 'החלון לא נפתח. אנא נסה שוב.', 'החלון לא נפתח. אנא נסי שוב.', 'החלון לא נפתח. אנא נסו שוב.'));
      expect(tc('ui.linkAccount.error.failed', { gender })).toBe(g(gender, 'שגיאה בחיבור החשבון. אנא נסה שוב.', 'שגיאה בחיבור החשבון. אנא נסי שוב.', 'שגיאה בחיבור החשבון. אנא נסו שוב.'));
      expect(tc('ui.linkAccount.error.unexpected', { gender })).toBe(g(gender, 'שגיאה בלתי צפויה. אנא נסה שוב.', 'שגיאה בלתי צפויה. אנא נסי שוב.', 'שגיאה בלתי צפויה. אנא נסו שוב.'));
      expect(tc('ui.report.notFound', { gender })).toBe(g(gender, 'לא מצאנו את האימון הזה. נסה לפתוח אותו שוב.', 'לא מצאנו את האימון הזה. נסי לפתוח אותו שוב.', 'לא מצאנו את האימון הזה. אפשר לנסות לפתוח אותו שוב.'));
      expect(tc('ui.report.failed', { gender })).toBe(g(gender, 'השליחה נכשלה. נסה שוב.', 'השליחה נכשלה. נסי שוב.', 'השליחה נכשלה. נסו שוב.'));
    }
  });
});

describe('library / profile / home / pages', () => {
  it('favorites', () => {
    const t = makeT('he', library);
    const DIFFICULTY_MAP: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };
    for (const level of [1, 2, 3, 4]) expect(t('favorites.difficulty', { level: String(level) })).toBe(DIFFICULTY_MAP[level] ?? '');
    expect(t('favorites.card.counts', { exercises: String(6), sets: String(12) })).toBe(`${6} תרגילים · ${12} סבבים`);
    expect(t('favorites.row.exercises', { exercises: String(6) })).toBe(`${6} תרגילים`);
    expect(t('favorites.row.offline')).toBe('זמין ללא אינטרנט');
    expect(t('favorites.row.start')).toBe('להתחיל');
    expect(t('favorites.loading')).toBe('טוען מועדפים...');
    expect(t('favorites.empty.title')).toBe('אין אימונים שמורים');
    expect(t('favorites.empty.body')).toBe('סמנ/י לב באימון שאהבת כדי לגשת אליו מכל מקום, גם ללא אינטרנט.');
    expect(t('favorites.savedCount', { count: String(1234) })).toBe(`${1234} אימונים שמורים`);
  });

  it('recent activity', () => {
    const t = makeT('he', profile);
    const old: Record<string, string> = { strength: 'אימון כוח', walking: 'הליכה', cycling: 'רכיבה', recovery: 'אימון התאוששות', running: 'ריצה' };
    for (const [kind, label] of Object.entries(old)) expect(t('recentActivity.kind', { kind })).toBe(label);
    expect(t('recentActivity.kind', { kind: '' })).toBe('ריצה');
    expect(t('recentActivity.title')).toBe('פעילות אחרונה');
    expect(t('recentActivity.empty')).toBe('עוד אין פעילויות.');
    for (const gender of GENDERS) {
      expect(t('recentActivity.cta', { gender })).toBe(pickGendered(gender, { male: 'תתחיל לזוז!', female: 'תתחילי לזוז!', other: 'בואו נזוז!' }));
    }
  });

  it('home / pages', () => {
    expect(makeT('he', home)('streakCelebration.milestoneDays')).toBe('ימים');
    const tp = makeT('he', pages);
    expect(tp('roadmap.welcome')).toBe('ברוכים הבאים!');
    expect(tp('roadmap.sub')).toBe('האימונים שלך מתחילים עכשיו');
    expect(tp('roadmap.done')).toBe('השלמת את תהליך ההרשמה בהצלחה!');
    expect(tp('roadmap.soon')).toBe('דף ה-Roadmap המלא יופיע כאן בקרוב');
    expect(tp('roadmap.home')).toBe('לך לדף הבית');
    expect(tp('roadmap.map')).toBe('צפה במפה');
    expect(tp('explorer.saveFailed')).toBe('לא הצלחנו לשמור את המיקום. בדקו חיבור לאינטרנט ונסו שוב.');
  });
});
