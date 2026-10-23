/**
 * i18n wave 2 batch al (namespace `home`, prefixes page.* / calmReturnCard.* / runCatchUp.* / streakCard.* /
 * firstWeekCard.* / ghostUpsell.* / processing.* / topUp.* / runWeekList.* / runReturn.*): every key equals the
 * old literal / template, copied verbatim — including what a first render can't reach (toasts, the "checking
 * profile" line, intensity pills, the step-goal / past-day cards, the dev panel, every streak / plural branch).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';
import { noticeCard, pickStreakCard } from '@/features/home/components/streak/streak-notice';
import { firstWeekChipLabel } from '@/features/home/components/first-week/FirstWeekCard';
import { topUpTitleHe } from '@/features/home/utils/strength-top-up';

const t = makeT('he', home);
type Key = keyof typeof he;

describe('home page (page.*)', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['page.activity.title', 'פעילות שבועית'],
      ['page.activity.who', 'המלצת ארגון הבריאות העולמי'],
      ['page.stepGoalCard.title', 'יעד הצעדים הושג'],
      ['page.pastDay.empty.scheduled', 'לא הסתדר הפעם — מחכה לך אימון הבא'],
      ['page.pastDay.empty.rest', 'רגוע, נחת — איזה כיף'],
      ['page.pastDay.title', 'מה עשית ביום הזה'],
      ['page.intensity.trio.light', 'קלה'],
      ['page.intensity.trio.balanced', 'מאוזנת'],
      ['page.intensity.trio.intense', 'אינטנסיבית'],
      ['page.toast.noLocation', 'לא הצלחנו לאתר את המיקום שלך. אפשר לנסות שוב מאוחר יותר.'],
      ['page.toast.noRoute', 'לא מצאנו מסלול מתאים כרגע. אפשר לנסות שוב מאוחר יותר.'],
      ['page.checkingProfile', 'בודק פרופיל...'],
      ['page.redirecting', 'מעביר להרשמה...'],
      ['page.tabs.strength', 'התקדמות שבועית'],
      ['page.tabs.health', 'מדדי בריאות'],
      ['page.preWorkout.readyFallback', 'מוכן להתחיל?'],
      ['page.preWorkout.dailyTitle', 'האימון היומי שלך'],
      ['page.addButton.title', 'הוסף'],
      ['page.gearToast.title', 'הציוד עודכן!'],
      ['page.gearToast.body', 'תמיד אפשר לערוך אותו בפרופיל האישי'],
      ['page.lookupFailed.title', 'לא הצלחנו לבדוק את האימון'],
      ['page.lookupFailed.body', 'נסו ללחוץ שוב בעוד רגע'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('greeting by the hour, with and without a name', () => {
    const old = (h: number) =>
      h >= 5 && h < 12 ? 'בוקר טוב' : h >= 12 && h < 17 ? 'צהריים טובים' : h >= 17 && h < 21 ? 'ערב טוב' : 'לילה טוב';
    const part = (h: number) => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'noon' : h >= 17 && h < 21 ? 'evening' : 'night');
    for (let h = 0; h < 24; h++) {
      const hello = t('page.greeting', { part: part(h) });
      expect(hello).toBe(old(h));
      expect(t('page.greetingName', { hello, name: 'דוד' })).toBe(`${old(h)}${`, ${'דוד'}`}`);
    }
  });

  it('weekly activity target, park intensity labels, dev tier line', () => {
    expect(t('page.activity.ofTarget', { amount: '150 דק׳' })).toBe(`מתוך ${150} דק׳`);
    const OLD_PARK = { easy: 'קל', medium: 'בינוני', hard: 'קשה' } as const;
    for (const d of ['easy', 'medium', 'hard'] as const) expect(t('page.intensity.park', { difficulty: d })).toBe(OLD_PARK[d]);
    const rich = makeT('he', home).rich<string>('page.dev.currentTier', { tier: '2', b: (c: string[]) => `[${c.join('')}]` });
    expect(rich.join('')).toBe('רמה נוכחית: [Tier 2]');
  });
});

describe('small home components', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['calmReturnCard.close', 'סגירה'],
      ['runCatchUp.close', 'סגירה'],
      ['streakCard.close', 'סגירה'],
      ['firstWeekCard.close', 'סגירה'],
      ['ghostUpsell.cta', 'להתחיל →'],
      ['processing.updating', 'מעדכן אימון...'],
      ['runWeekList.label', 'השבוע שלך'],
      ['runWeekList.title', 'השבוע שלך'],
      ['runWeekList.skip', 'אין לי כוח היום — דלג לעוד'],
      ['runWeekList.undo', 'ביטול — אני בכל זאת רוצה להתאמן'],
      ['runReturn.title', 'חוזרים לרוץ'],
      ['runReturn.levelCheck', 'אפשר גם לבדוק רמה בדרך'],
      ['runReturn.raceQuestion', 'יש לך מירוץ / יעד בתאריך?'],
      ['runReturn.shorterGoal', 'אפשר גם לבחור יעד קצר יותר'],
      ['runReturn.recommended', 'כמו שהמלצנו'],
      ['runReturn.resume', 'להמשיך מאיפה שעצרתי'],
      ['runReturn.resumeBlocked', 'אחרי הפסקה ארוכה זה מעמיס מדי — עדיף לחזור בהדרגה'],
      ['runReturn.rebuildForRace', 'לבנות לי מחדש לפי המירוץ'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('run week header and count', () => {
    for (const [week, total] of [[1, 8], [12, 1234]] as const) {
      expect(t('runWeekList.programWeekOf', { program: 'תוכנית 5 ק״מ', week: String(week), total: String(total) })).toBe(
        `${'תוכנית 5 ק״מ'} · ${`שבוע ${week} מתוך ${total}`}`,
      );
      expect(t('runWeekList.programWeek', { program: 'P', week: String(week) })).toBe(`${'P'} · ${`שבוע ${week}`}`);
    }
    expect(t('runWeekList.count', { n: String(1234) })).toBe(`${1234} אימונים`);
  });

  it('first-week chip and strength top-up title (old helpers, every branch)', () => {
    const oldChip = (day: number) => (day === 0 ? 'היום הראשון' : `השבוע הראשון · יום ${day}`);
    for (const d of [0, 1, 7, 1234]) expect(firstWeekChipLabel(d, t)).toBe(oldChip(d));
    const oldTopUp = (r: number) => {
      const n = Math.max(0, Math.round(r));
      return n === 1 ? 'השלמת סטים · נשאר סט אחד להיום' : `השלמת סטים · נשארו ${n} סטים להיום`;
    };
    for (const r of [-2, 0, 0.6, 1, 1.4, 2, 6, 1234]) expect(topUpTitleHe(r, t)).toBe(oldTopUp(r));
  });

  it('streak card copy (old noticeCard / MILESTONE_COPY, every branch)', () => {
    const OLD_MILESTONES: Record<number, { title: string; body: string }> = {
      3: { title: '3 ימים ברצף', body: 'ההתחלה הכי קשה כבר מאחור. ממשיכים מחר.' },
      7: { title: 'שבוע שלם', body: '7 ימים ברצף. ככה נראה הרגל שנולד.' },
      14: { title: 'שבועיים ברצף', body: '14 ימים. הגוף כבר מחכה לזה.' },
      30: { title: 'חודש. וואו', body: '30 ימים ברצף. זה כבר לא ניסיון, זה הרגל.' },
      50: { title: '50 ימים ברצף', body: 'חצי הדרך למאה. ממשיכים בקצב שלך.' },
      100: { title: '100. מישהו פה רציני', body: '100 ימים ברצף. השכנים מדברים.' },
      365: { title: 'שנה שלמה ברצף', body: '365 ימים. אין מילים, רק כבוד.' },
    };
    const T = '2026-10-21';
    for (const [n, copy] of Object.entries(OLD_MILESTONES)) {
      const card = pickStreakCard({ notice: null, currentStreak: Number(n), lastStreakDate: T, todayKey: T, seen: new Set() }, t)!;
      expect({ title: card.title, body: card.body }).toEqual(copy);
    }
    const days = (n: number) => (n === 1 ? 'יום אחד' : `${n} ימים`);
    for (const best of [1, 2, 23, 1234]) {
      const c = noticeCard({ kind: 'broken', previous: 1, best, on: T }, t);
      expect(c.title).toBe('הרצף נעצר. השיא נשאר');
      expect(c.body).toBe(`${days(best)} זה שלך לתמיד. מתחילים רצף חדש היום?`);
    }
    for (const dayCount of [1, 2, 3]) {
      for (const left of [0, 1, 2]) {
        const dd = Array.from({ length: dayCount }, () => T);
        const c = noticeCard({ kind: 'shield_used', days: dd, left, on: T }, t);
        expect(c.title).toBe(dd.length > 1 ? 'המגנים שמרו על הרצף' : 'המגן שמר על הרצף');
        expect(c.body).toBe(
          left > 0
            ? `${dd.length > 1 ? 'הימים בלי פעילות לא שברו' : 'היום בלי פעילות לא שבר'} את הרצף. נשאר עוד מגן ${left === 1 ? 'אחד' : 'שניים'}.`
            : `${dd.length > 1 ? 'הימים בלי פעילות לא שברו' : 'היום בלי פעילות לא שבר'} את הרצף. כל 7 ימי רצף מביאים מגן חדש.`,
        );
      }
    }
    for (const [streak, held] of [[7, 1], [1400, 2]] as const) {
      const c = noticeCard({ kind: 'shield_earned', held, streak, on: T }, t);
      expect(c.title).toBe('מגן רצף חדש');
      expect(c.body).toBe(`${streak} ימים ברצף שווים מגן. ביום שלא נסגר הוא שומר על הרצף לבד. ${held} מתוך ${2}.`);
    }
  });
});
