/**
 * Hebrew copy for the streak celebration (designs ST-1…ST-5). Gendered through g(); an
 * unknown gender gets the neutral form (owner's gender-copy decisions). Same rules as the
 * home streak card: no emoji, no slash, no blame.
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';
import { nextMilestone, type Celebration } from './celebration.core';

export interface CelebrationCopy {
  headline: string;
  sub: string;
  /** Under the big number (day / back variants). */
  unit: string;
}

function days(n: number): string {
  return n === 1 ? 'יום אחד' : `${n} ימים`;
}

/** g() with the neutral form for an unknown or "other" gender. */
function gn(gender: AppGender | null | undefined, male: string, female: string, neutral: string): string {
  return gender === 'male' || gender === 'female' ? g(gender, male, female) : neutral;
}

export function celebrationCopy(c: Celebration, gender: AppGender | null | undefined): CelebrationCopy {
  const unit = c.streak === 1 ? 'יום ברצף' : 'ימים ברצף';
  switch (c.variant) {
    case 'day':
      return {
        headline: `${c.streak} ימים ברצף`,
        sub: `עוד יום שמור. מחר ${c.streak + 1}.`,
        unit,
      };
    case 'week':
      return {
        headline: c.streak === 7 ? 'שבוע מלא' : c.streak === 14 ? 'שבועיים ברצף' : `${c.streak / 7} שבועות ברצף`,
        sub: 'שבעה ימים, שבע להבות. זה כבר הרגל.',
        unit,
      };
    case 'milestone': {
      const next = nextMilestone(c.streak);
      const ahead = next ? ` ${gn(gender, `אתה בדרך ל-${next}`, `את בדרך ל-${next}`, `הבא בתור: ${next}`)}.` : '';
      return {
        headline: `${c.streak} ימים ברצף`,
        sub: `אבן דרך של ממש.${ahead}`,
        unit,
      };
    }
    case 'shield': {
      const missed = c.shieldDays.length > 1 ? 'הימים בלי פעילות לא שברו' : 'היום בלי פעילות לא שבר';
      const left =
        c.shieldsLeft > 0 ? ` ${c.shieldsLeft === 1 ? 'נשאר מגן אחד' : 'נשארו שני מגנים'}.` : ' כל 7 ימי רצף מביאים מגן חדש.';
      return {
        headline: c.shieldDays.length > 1 ? 'המגנים שמרו לך על הרצף' : 'המגן שמר לך על הרצף',
        sub: `${missed} את הרצף.${left}`,
        unit,
      };
    }
    case 'back':
      return {
        headline: 'טוב לראות אותך שוב',
        sub: `רצף חדש מתחיל היום. השיא שלך, ${days(c.best)}, נשאר שלך.`,
        unit,
      };
  }
}

export const CELEBRATION_CONTINUE = 'המשך';
export const CELEBRATION_SHARE = 'שיתוף הרצף';
export const CELEBRATION_CLOSE = 'סגירה';

/** The share sheet text. */
export function shareText(c: Celebration): string {
  return `${days(c.streak)} ברצף ב-OUT.`;
}
