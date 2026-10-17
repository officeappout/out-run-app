/**
 * weight-status — "does this user still need to tell us their weight?"
 *
 * Every signup path (auth.service, firestore.service, AuthModal,
 * onboarding-sync) writes `core.weight: 70` as a PLACEHOLDER, so a stored 70
 * alone can't tell "never entered" apart from "really weighs 70". The old
 * FreeRunDrawer check (`!weight || weight === 70`) therefore nagged every
 * user who genuinely weighs 70kg, forever — saving 70 changed nothing.
 *
 * Real signal: `core.weightSetByUser === true`, written by every explicit
 * weight save (the free-run inline nudge, the shared WeightInlineRow nudge,
 * the profile editor). Once set, the stored weight is trusted whatever its
 * value. Without the flag, only a missing/invalid weight or the untouched
 * signup placeholder counts as missing (legacy docs have no flag; a user who
 * typed 70 before the flag existed sees the nudge one more time, and saving
 * it sets the flag for good).
 */

/** The value every signup path writes before the user enters anything. */
export const SIGNUP_PLACEHOLDER_WEIGHT_KG = 70;

export interface WeightStatusInput {
  weight?: number | null;
  weightSetByUser?: boolean | null;
}

export function isWeightMissing(core: WeightStatusInput | null | undefined): boolean {
  const w = core?.weight;
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return true;
  if (core?.weightSetByUser === true) return false;
  return w === SIGNUP_PLACEHOLDER_WEIGHT_KG;
}
