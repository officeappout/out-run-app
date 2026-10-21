/**
 * NeighborhoodLeaderboard copy — male / female / neutral (gender batch 2, owner decisions 21.10.2026;
 * src/lib/i18n/gender-copy.ts). Hebrew only: the component is not extracted yet; the
 * extraction PR moves these as they are.
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';

/** Gender batch 2 (21.10.2026): these were masculine for everyone. other = neutral. */
export const LEAGUE_COPY = {
  stepTrain: { male: 'אמן כאן את האימון הראשון', female: 'אמני כאן את האימון הראשון', other: 'אימון ראשון כאן' },
  stepInvite: { male: 'הזמן שותף לליגה', female: 'הזמיני שותף לליגה', other: 'מזמינים שותף לליגה' },
  stepPodium: {
    male: 'פתח את הליגה ותפוס את הפודיום',
    female: 'פתחי את הליגה ותפסי את הפודיום',
    other: 'פותחים את הליגה ותופסים את הפודיום',
  },
  lockedInvite: {
    male: 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה',
    female: 'הזמיני שותף אחד כדי לפתוח את הטבלה המלאה',
    other: 'עוד שותף אחד, והטבלה המלאה נפתחת',
  },
  lockedCity: {
    male: 'לחץ על העירייה כדי לפתוח את הליגה הרשמית',
    female: 'לחצי על העירייה כדי לפתוח את הליגה הרשמית',
    other: 'לוחצים על העירייה כדי לפתוח את הליגה הרשמית',
  },
} as const satisfies Record<string, GenderedText>;
