/**
 * FreeRunDrawer copy — male / female / neutral (gender batch 2, owner decisions 21.10.2026;
 * src/lib/i18n/gender-copy.ts). Hebrew only: the component is not extracted yet; the
 * extraction PR moves these as they are.
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';

/** Gender batch 2 (21.10.2026): these were masculine for everyone. other = neutral. */
export const FREE_RUN_COPY = {
  startFree: { male: 'התחל חופשי', female: 'התחילי חופשי', other: 'בלי מסלול' },
  startFreeAria: { male: 'התחל אימון חופשי', female: 'התחילי אימון חופשי', other: 'יוצאים לאימון חופשי' },
  startRouteAria: {
    male: 'התחל אימון עם מסלול מותאם',
    female: 'התחילי אימון עם מסלול מותאם',
    other: 'יוצאים לאימון עם מסלול מותאם',
  },
  skipWeight: {
    male: 'אפשר לדלג — יישמר לפרופיל אם תבחר',
    female: 'אפשר לדלג — יישמר לפרופיל אם תבחרי',
    other: 'אפשר לדלג — מה שנבחר יישמר לפרופיל',
  },
  tapToChange: { male: 'הקש לשינוי היעד', female: 'הקישי לשינוי היעד', other: 'הקשה לשינוי היעד' },
  routeToAddress: {
    male: 'מסלול מכאן לכתובת שתבחר',
    female: 'מסלול מכאן לכתובת שתבחרי',
    other: 'מסלול מכאן לכתובת לבחירתך',
  },
  startToAddress: { male: 'התחל לכתובת הזו', female: 'התחילי לכתובת הזו', other: 'יוצאים לכתובת הזו' },
  compileError: {
    male: 'משהו השתבש בהרכבת המסלול. נסה שוב.',
    female: 'משהו השתבש בהרכבת המסלול. נסי שוב.',
    other: 'משהו השתבש בהרכבת המסלול. נסו שוב.',
  },
  noStops: {
    male: 'עדיין לא הוספת עצירות. הוסף עצירה כדי להתחיל להרכיב את המסלול.',
    female: 'עדיין לא הוספת עצירות. הוסיפי עצירה כדי להתחיל להרכיב את המסלול.',
    other: 'עדיין אין עצירות. אפשר להוסיף עצירה כדי להתחיל להרכיב את המסלול.',
  },
} as const satisfies Record<string, GenderedText>;
