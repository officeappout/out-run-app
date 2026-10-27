/** i18n batch au: onboarding `gateway.*` / `dynamicPage.*` / `locationStep.*` / `entryHeadline.*` = the old literals, verbatim. */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';

type Key = keyof typeof he;
const t = makeT('he', onboarding);

describe('onboarding batch au (he)', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['gateway.title', 'מה מתאים לך?'],
      ['gateway.overlay.status.routes', 'מאתר מסלולים אופטימליים...'],
      ['gateway.overlay.status.gps', 'מכייל GPS...'],
      ['gateway.overlay.status.terrain', 'מנתח נתוני שטח...'],
      ['gateway.overlay.status.dashboard', 'מכין את הדאשבורד שלך...'],
      ['gateway.overlay.error.title', 'החיבור לא הצליח'],
      ['gateway.overlay.error.body', 'משהו השתבש בהתחברות. בדקו את החיבור לאינטרנט ונסו שוב, או חזרו למסך הראשי.'],
      ['gateway.overlay.error.retry', 'נסה שוב'],
      ['gateway.overlay.error.exit', 'חזרה למסך הראשי'],
      ['landing.toast.connectFailed', 'החיבור לא הצליח. נסו שוב.'],
      ['gateway.card.map.title', 'גלו את המפה'],
      ['gateway.card.map.body', 'כניסה מהירה ללא הרשמה למציאת מסלולי ריצה, גינות כושר קרובות ומתאמנים סביבכם בלייב.'],
      ['gateway.card.running.title', 'תוכנית ריצה'],
      ['gateway.card.running.body', 'מ-0 ל-5K או שיפור זמנים'],
      ['gateway.card.strength.title', 'תוכנית כוח'],
      ['gateway.card.strength.body', 'אימון מותאם אישית למטרות שלך'],
      ['gateway.legal.label', 'מידע משפטי ונגישות'],
      ['gateway.legal.accessibility', 'הצהרת נגישות'],
      ['gateway.legal.privacy', 'מדיניות פרטיות'],
      ['dynamicPage.loadError', 'שגיאה בטעינת השאלון'],
      ['dynamicPage.answerError', 'שגיאה בעיבוד התשובה'],
      ['dynamicPage.nameRequired', 'יש למלא את השם כדי להמשיך'],
      ['dynamicPage.saveError', 'שגיאה בשמירת הפרופיל. אנא נסה שוב.'],
      ['dynamicPage.loadingQuestionnaire', 'טוען שאלון...'],
      ['dynamicPage.loadingResults', 'טוען תוצאות...'],
      ['dynamicPage.error.title', 'שגיאה'],
      ['dynamicPage.error.retryLegacy', 'נסה שוב'],
      ['locationStep.mapLoading', 'טוען מפה...'],
      ['locationStep.error.noFix', 'לא הצלחנו לאתר את המיקום שלך. נסה שוב או חפש ידנית.'],
      ['locationStep.you.alt', 'המיקום שלך'],
      ['entryHeadline.pre', 'בשביל'],
      ['entryHeadline.goal.train', 'להתאמן'],
      ['entryHeadline.goal.health', 'לשמור על הבריאות'],
      ['entryHeadline.goal.people', 'להכיר אנשים דרך הספורט'],
      ['entryHeadline.goal.strong', 'להיות חזקה'],
      ['entryHeadline.need', 'לא צריך'],
      ['entryHeadline.nothing', 'כלום'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values and branches', () => {
    expect(t('locationStep.heroRoute.km', { km: (3.456).toFixed(1) })).toBe(`${(3.456).toFixed(1)} ק״מ מסלול`);
    // old: gender === 'female' ? 'נסי שוב' : 'נסה שוב'
    for (const gender of ['female', 'male', 'other'] as const)
      expect(t('dynamicPage.error.retry', { gender })).toBe(gender === 'female' ? 'נסי שוב' : 'נסה שוב');
  });
});
