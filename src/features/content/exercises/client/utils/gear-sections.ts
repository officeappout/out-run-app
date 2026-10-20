/**
 * Which section of the equipment sheet a gear doc sits in. Pure.
 *
 *   park       — anchored / mounted gear (category 'stationary')
 *   improvised — things you already have at home (chair, wall, towel …)
 *   personal   — gear you own / bring along (bands, TRX, rings, weights …)
 *
 * enable_home_v2 (owner 20.10.2026): a stationary item whose defaultLocation is 'home'
 * — "מתח לדלת" (door pull-up bar, iconKey pullup_bar_door), "מקבילים נמוכים", "חבל טיפוס"
 * — is gear you OWN at home, so it moves to "ציוד אישי" and is pinned first there. Before,
 * it sat under "ציוד פארק", which the profile editor hides entirely — a home user
 * could not tell the app they have a pull-up bar after onboarding, and upper days at
 * home came out push-only. Same catalog ids, no new data field. Off → today's split.
 */
export type GearSection = 'park' | 'improvised' | 'personal';

export interface GearSectionInput {
  category?: string | null;
  defaultLocation?: string | null;
}

export function gearSectionOf(g: GearSectionInput, v2: boolean): GearSection {
  if (g.category === 'stationary') return v2 && g.defaultLocation === 'home' ? 'personal' : 'park';
  // Belt-and-braces: a doc with no category but explicitly tagged as park-only.
  if (!g.category && g.defaultLocation === 'park') return 'park';
  if (g.category === 'improvised') return 'improvised';
  return 'personal';
}

/** v2: home-owned stationary gear (the door pull-up bar) first in "ציוד אישי". */
export function isPinnedHomeGear(g: GearSectionInput, v2: boolean): boolean {
  return v2 && g.category === 'stationary' && g.defaultLocation === 'home';
}
