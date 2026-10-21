/**
 * SettingsModal error copy — male / female / neutral (gender batch 2, owner decisions
 * 21.10.2026; src/lib/i18n/gender-copy.ts). Until 21.10 the two coupon lines were
 * feminine for everyone and the rest masculine for everyone. Hebrew only: SettingsModal
 * is not extracted yet; the extraction PR moves these as they are.
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';

export const SETTINGS_COPY = {
  couponNotFound: {
    male: 'קוד לא נמצא. בדוק ונסה שוב.',
    female: 'קוד לא נמצא. בדקי ונסי שוב.',
    other: 'קוד לא נמצא. בדקו ונסו שוב.',
  },
  couponError: {
    male: 'שגיאה בבדיקת הקוד. נסה שוב.',
    female: 'שגיאה בבדיקת הקוד. נסי שוב.',
    other: 'שגיאה בבדיקת הקוד. נסו שוב.',
  },
  signOutError: {
    male: 'שגיאה בהתנתקות. נסה שוב.',
    female: 'שגיאה בהתנתקות. נסי שוב.',
    other: 'שגיאה בהתנתקות. נסו שוב.',
  },
  deleteSessionExpired: {
    male: 'תוקף החיבור פג. התחבר מחדש ונסה שוב.',
    female: 'תוקף החיבור פג. התחברי מחדש ונסי שוב.',
    other: 'תוקף החיבור פג. התחברו מחדש ונסו שוב.',
  },
  deleteNetwork: {
    male: 'בעיית חיבור - נסה שוב',
    female: 'בעיית חיבור - נסי שוב',
    other: 'בעיית חיבור - נסו שוב',
  },
  deleteFailed: {
    male: 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסה שוב.',
    female: 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסי שוב.',
    other: 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסו שוב.',
  },
} as const satisfies Record<string, GenderedText>;
