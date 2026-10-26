/**
 * i18n wave 2 batch ao (namespace `common`, prefix ui.*): small shared UI. Every key equals the old literal /
 * template, copied verbatim — including what a static render can't reach (toasts, the access-code error map, the
 * gendered upload error, the deleting button, the interpolated lines).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/common.json';
import { common } from '@/messages/ns/common';
import { makeT } from '../t';

const t = makeT('he', common);
type Key = keyof typeof he;

describe('ui (plain strings)', () => {
  it('every plain key equals the old literal', () => {
    const cases: Array<[Key, string]> = [
      ["ui.health.title", "גישה לנתוני בריאות"],
      ["ui.health.close", "סגור"],
      ["ui.health.steps.label", "צעדים יומיים"],
      ["ui.health.steps.purpose", "מעקב אחר יעד הצעדים היומי שלך"],
      ["ui.health.steps.access", "קריאה"],
      ["ui.health.exercise.label", "דקות פעילות (Exercise Time)"],
      ["ui.health.exercise.purpose", "מעקב אחר עמידה ביעד 150 דקות WHO"],
      ["ui.health.exercise.access", "קריאה + כתיבה"],
      ["ui.health.commitments", "ההתחייבויות שלנו:"],
      ["ui.health.commit.1", "✓ נתוני הבריאות משמשים אך ורק להצגה אישית עבורך"],
      ["ui.health.commit.2", "✓ לא מועברים לצדדים שלישיים, ספקי פרסום או חברות ביטוח"],
      ["ui.health.commit.3", "✓ ערכי הדאטה לא נשמרים בשרתי OUT — מוצגים ישירות מהמכשיר"],
      ["ui.health.commit.4", "✓ נשמרים רק סכומי פעילות מצטברים, כדי להציג לך התקדמות"],
      ["ui.health.commit.5", "✓ הכל נמחק עם מחיקת החשבון"],
      ["ui.health.commit.6", "✓ ניתן לבטל גישה בכל עת דרך הגדרות הטלפון"],
      ["ui.health.privacyLink", "קרא/י את מדיניות הפרטיות המלאה (סעיף 2)"],
      ["ui.health.allow", "אפשר גישה"],
      ["ui.health.notNow", "לא עכשיו"],
      ["ui.accessCode.error.notFound", "קוד גישה לא נמצא. בדקו ונסו שוב."],
      ["ui.accessCode.error.expired", "קוד הגישה פג תוקף."],
      ["ui.accessCode.error.max", "קוד הגישה הגיע למכסה המקסימלית."],
      ["ui.accessCode.error.inactive", "קוד הגישה אינו פעיל יותר."],
      ["ui.accessCode.error.completeProfile", "יש להשלים את הפרופיל שלך (כולל תאריך לידה) לפני הזנת קוד גישה."],
      ["ui.accessCode.error.underAge", "לא ניתן להשתמש בקוד גישה בשלב זה."],
      ["ui.accessCode.error.generic", "שגיאה בבדיקת הקוד. נסו שוב."],
      ["ui.accessCode.error.empty", "יש להזין קוד גישה"],
      ["ui.accessCode.senderFallback", "משתמש/ת"],
      ["ui.accessCode.titleOptional", "קוד גישה (לא חובה)"],
      ["ui.accessCode.titleRequired", "נדרש קוד גישה"],
      ["ui.accessCode.hintOptional", "קיבלתם קוד מהארגון? הזינו אותו כאן"],
      ["ui.accessCode.hintRequired", "הזינו את הקוד שקיבלתם מהארגון"],
      ["ui.accessCode.submit", "אישור"],
      ["ui.accessCode.or", "או"],
      ["ui.accessCode.skip", "דלג — המשך בלי קוד"],
      ["ui.weight.title", "⚖️ משקלך לחישוב מדויק"],
      ["ui.weight.body", "עדיין לא הזנת משקל — הערך הנוכחי הוא ברירת מחדל. כדי שחישוב הקלוריות יהיה מדויק, שווה לעדכן."],
      ["ui.weight.decrease", "הפחת ק״ג"],
      ["ui.weight.inputLabel", "משקל בקילוגרם"],
      ["ui.weight.increase", "הוסף ק״ג"],
      ["ui.weight.save", "שמור"],
      ["ui.weight.hint", "אפשר לדלג — יישמר לפרופיל אם תבחר"],
      ["ui.deleteWorkout.title", "למחוק את האימון?"],
      ["ui.deleteWorkout.deleting", "מוחק..."],
      ["ui.deleteWorkout.confirm", "מחק אימון"],
      ["ui.photo.nativeOnly", "עדכון תמונת פרופיל זמין באפליקציה הנייטיב בלבד"],
      ["ui.photo.noUser", "לא נמצא משתמש מחובר."],
      ["ui.photo.permission", "לא ניתן לקבל הרשאות מצלמה/גלריה."],
      ["ui.photo.updated", "תמונת הפרופיל עודכנה"],
      ["ui.photo.edit", "עדכון תמונת פרופיל"],
      ["ui.header.userFallback", "משתמש"],
      ["ui.header.profile", "פרופיל"],
      ["ui.header.messages", "הודעות"],
      ["ui.header.search", "חיפוש"],
      ["ui.offline.banner", "אין חיבור לאינטרנט — מציג אימונים שמורים בלבד"],
      ["ui.coach.skip", "דלג"],
      ["ui.coach.next", "הבא"],
      ["ui.coach.done", "הבנתי"],
      ["ui.streak.label", "אימונים ברצף"],
      ["ui.streak.sub", "להבה בכל יום אימון"],
      ["ui.streak.week", "השבוע"],
      ["ui.streak.today", "היום"],
      ["ui.sets.aria", "סטים"],
      ["ui.programRing.title", "התקדמות בתוכניות שלי"],
      ["ui.programRing.today", "האימון של היום"],
      ["ui.recommendation.eyebrow", "ממליצים לך"],
      ["ui.repPace.title", "קצב בכל חזרה"],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });
});

describe('ui (values and branches)', () => {
  it('health intro (rich) keeps the spaces around the platform label', () => {
    const out = t.rich<string>('ui.health.intro', { platform: 'HealthKit / Health Connect', b: (chunks: unknown) => `[${(chunks as string[]).join('')}]` }).join('');
    expect(out).toBe('OUT מבקשת גישה ל[ HealthKit / Health Connect ]כדי להציג לך נתוני פעילות אישיים. להלן פירוט מדויק של מה שנקרא ולמה:');
  });

  it('access-code lines', () => {
    expect(t('ui.accessCode.contactMessage', { sender: 'חייל סדיר', org: 'גדוד 7' })).toBe(`שלום, אני ${'חייל סדיר'} ואשמח לקבל קוד גישה עבור ${'גדוד 7'}.`);
    expect(t('ui.accessCode.contact', { contact: 'מנהל הארגון' })).toBe(`פנה ל${'מנהל הארגון'}`);
  });

  it('delete-workout body: with and without XP', () => {
    const activityLabel = 'ריצה';
    const dateLabel = '12.08.2026';
    const xpToReverse = 1200;
    expect(t('ui.deleteWorkout.bodyXp', { activity: activityLabel, date: dateLabel, xp: String(xpToReverse) })).toBe(
      `${activityLabel} מ-${dateLabel} יימחק לצמיתות, וה-${xpToReverse} XP שצברת בזכותו יוחזרו בחזרה.`,
    );
    expect(t('ui.deleteWorkout.body', { activity: activityLabel, date: dateLabel })).toBe(
      `${activityLabel} מ-${dateLabel} יימחק לצמיתות. אי אפשר לשחזר אותו.`,
    );
  });

  it('upload error — male / female / neutral', () => {
    expect(t('ui.photo.uploadFailed', { gender: 'male' })).toBe('שגיאה בהעלאת התמונה. נסה שוב.');
    expect(t('ui.photo.uploadFailed', { gender: 'female' })).toBe('שגיאה בהעלאת התמונה. נסי שוב.');
    expect(t('ui.photo.uploadFailed', { gender: 'other' })).toBe('שגיאה בהעלאת התמונה. נסו שוב.');
  });

  it('app header aria labels', () => {
    const streak = 7;
    expect(t('ui.header.profileStreak', { streak: String(streak) })).toBe(`פרופיל · ${streak} ימים ברצף`);
    for (const n of [3, 120]) {
      const activityUnread = n;
      expect(t('ui.header.notifications', { count: String(activityUnread > 99 ? '99+' : activityUnread) })).toBe(
        `התראות — ${activityUnread > 99 ? '99+' : activityUnread} חדשות`,
      );
    }
  });

  it('offline banner counts', () => {
    expect(t('ui.offline.workouts', { count: String(1500) })).toBe(`${1500} אימונים ממתינים לסנכרון`);
    expect(t('ui.offline.samples', { count: String(2) })).toBe(`${2} מדידות סנסור ממתינות`);
  });

  it('streak best + set legend select', () => {
    expect(t('ui.streak.best', { best: String(12) })).toBe(`השיא: ${12}`);
    const old = { in: 'ביעד', below: 'מתחת ליעד', missed: 'לא בוצע' } as const;
    for (const tone of ['in', 'below', 'missed'] as const) expect(t('ui.sets.legend', { tone })).toBe(old[tone]);
  });
});
