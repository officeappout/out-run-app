/**
 * Budget light mode — the Hebrew "why" lines (simple website voice, separate male / female
 * strings, never "צא/י"). Pure.
 *
 *   card        — one short line on a recommendation card (map carousel / home card)
 *   description — the workout description (overview / workout card)
 */

import type { BudgetLightReasonKey } from './policy';

export type CopyGender = 'male' | 'female' | undefined | null;
export type BudgetLightCopyForm = 'card' | 'description';

type Variants = { male: string; female: string };

export const BUDGET_LIGHT_COPY: Record<BudgetLightReasonKey, Record<BudgetLightCopyForm, Variants>> = {
  'budget_light.weekly_spent': {
    card: {
      male: 'השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר. תן לשרירים להתאושש',
      female: 'השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר. תני לשרירים להתאושש',
    },
    description: {
      male: 'השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר כדי שהשרירים יתאוששו. פחות סטים, אותם תרגילים ברמה שלך, ואתה ממשיך לזוז.',
      female: 'השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר כדי שהשרירים יתאוששו. פחות סטים, אותם תרגילים ברמה שלך, ואת ממשיכה לזוז.',
    },
  },
  'budget_light.daily_spent': {
    card: {
      male: 'היום כבר עשית את הכוח שלך, אז עכשיו משהו קל יותר. תן לשרירים להתאושש',
      female: 'היום כבר עשית את הכוח שלך, אז עכשיו משהו קל יותר. תני לשרירים להתאושש',
    },
    description: {
      male: 'היום כבר עשית את הכוח שלך, אז עכשיו משהו קל יותר כדי שהשרירים יתאוששו. פחות סטים, אותם תרגילים ברמה שלך, ואתה ממשיך לזוז.',
      female: 'היום כבר עשית את הכוח שלך, אז עכשיו משהו קל יותר כדי שהשרירים יתאוששו. פחות סטים, אותם תרגילים ברמה שלך, ואת ממשיכה לזוז.',
    },
  },
};

export function budgetLightText(key: BudgetLightReasonKey, form: BudgetLightCopyForm, gender: CopyGender): string {
  const v = BUDGET_LIGHT_COPY[key][form];
  return gender === 'female' ? v.female : v.male;
}

/** profile.core.gender → copy gender ('other' / missing → male, the app-wide default). */
export function copyGenderOf(profile: { core?: { gender?: string | null } | null } | null | undefined): 'male' | 'female' {
  return profile?.core?.gender === 'female' ? 'female' : 'male';
}
