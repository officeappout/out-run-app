/**
 * Budget light mode — the "why" lines (simple website voice, `map` catalog `budgetLight.*`; the Hebrew has separate
 * male / female strings, never "צא/י"). Pure.
 *
 *   card        — one short line on a recommendation card (map carousel / home card)
 *   description — the workout description (overview / workout card)
 */

import { makeLiveT } from '@/lib/i18n/live-t';
import { map } from '@/messages/ns/map';
import type { BudgetLightReasonKey } from './policy';

export type CopyGender = 'male' | 'female' | undefined | null;
export type BudgetLightCopyForm = 'card' | 'description';

const tMap = makeLiveT(map);

const KEYS = {
  'budget_light.weekly_spent': { card: 'budgetLight.weeklySpent.card', description: 'budgetLight.weeklySpent.description' },
  'budget_light.daily_spent': { card: 'budgetLight.dailySpent.card', description: 'budgetLight.dailySpent.description' },
} as const satisfies Record<BudgetLightReasonKey, Record<BudgetLightCopyForm, string>>;

export function budgetLightText(key: BudgetLightReasonKey, form: BudgetLightCopyForm, gender: CopyGender): string {
  return tMap(KEYS[key][form], { gender: gender === 'female' ? 'female' : 'male' });
}

/** profile.core.gender → copy gender ('other' / missing → male, the app-wide default). */
export function copyGenderOf(profile: { core?: { gender?: string | null } | null } | null | undefined): 'male' | 'female' {
  return profile?.core?.gender === 'female' ? 'female' : 'male';
}
