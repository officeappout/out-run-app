/**
 * Workout summary praise + guest CTA — male / female / neutral (gender batch 2, owner decisions 21.10.2026;
 * src/lib/i18n/gender-copy.ts). Hebrew only: the component is not extracted yet; the
 * extraction PR moves these as they are.
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';

/** Gender batch 2 (21.10.2026): was masculine for everyone. Neutral = unknown / "other". */
export const SUMMARY_COPY = {
  keepGoing: { male: 'כל הכבוד! המשך כך!', female: 'כל הכבוד! המשיכי כך!', other: 'כל הכבוד! ככה ממשיכים!' },
  claimBonus: {
    male: 'השלם פרופיל וקבל בונוס',
    female: 'השלימי פרופיל וקבלי בונוס',
    other: 'משלימים פרופיל ומקבלים בונוס',
  },
} as const satisfies Record<string, GenderedText>;
