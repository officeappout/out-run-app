/**
 * Coverflow slider redesign — the old dot-track's static "מתחיל / בינוני / מתקדם"
 * labels (3 fixed positions under the dots) are replaced by a single pill in the
 * description card showing the CURRENTLY SELECTED level's tier. This pure resolver
 * covers both the coverflow strip (discrete step index / total steps) and the
 * degraded continuous-slider fallback (level's proportion between min/max) via
 * one shared 0-1 proportion input, matching the old labels' 3-way split.
 *
 * i18n (namespace `onboarding`, keys `tier.*`): the text lives in src/messages/he/onboarding.json;
 * the caller passes its own translator (`useT(onboarding)`), so these stay pure.
 */
import type { onboarding } from '@/messages/ns/onboarding';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import { genderArg, type MessageValues } from '@/lib/i18n/core/i18n-core';

/** The `onboarding` translator a caller passes in (`useT(onboarding)` / `makeT(locale, onboarding)`). */
export type OnboardingT = (key: NamespaceKey<typeof onboarding>, values?: MessageValues) => string;

/** Clamps to [0, 1] then buckets into the same thirds the old 3 static labels covered. */
export function resolveTierLabel(proportion: number, quizGender: unknown, t: OnboardingT): string {
  const p = Number.isFinite(proportion) ? Math.max(0, Math.min(1, proportion)) : 0;
  // The quiz's gender is the onboarding answer (a prop), not the profile — passed explicitly.
  // male / female / other (anything else → neutral copy, owner decision 21.10.2026).
  const gender = genderArg(quizGender);
  if (p < 1 / 3) return t('tier.beginner', { gender });
  if (p < 2 / 3) return t('tier.intermediate');
  return t('tier.advanced', { gender });
}

/**
 * Skill-path tier pill (planche/front_lever/muscle_up/handstand/etc.) — a 4-step
 * calisthenics ladder distinct from the plain 3-tier label above, which stays on
 * push/pull/legs/core only. Gender-neutral text, so no isFemale param.
 */
const SKILL_TIER_KEYS = [
  'tier.skill.beginner',
  'tier.skill.beginnerPlus',
  'tier.skill.intermediate',
  'tier.skill.advanced',
] as const;

/** Clamps to [0, 1] then buckets proportionally into the 4 skill tiers above. */
export function resolveSkillTierLabel(proportion: number, t: OnboardingT): string {
  const p = Number.isFinite(proportion) ? Math.max(0, Math.min(1, proportion)) : 0;
  const idx = Math.min(SKILL_TIER_KEYS.length - 1, Math.floor(p * SKILL_TIER_KEYS.length));
  return t(SKILL_TIER_KEYS[idx]);
}

/** Proportion for the coverflow strip — position of the selected step within the step list. */
export function stepProportion(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 1) return 0;
  return stepIndex / (totalSteps - 1);
}

/** Proportion for the degraded continuous slider — position of the real level within [min, max]. */
export function levelProportion(level: number, minLevel: number, maxLevel: number): number {
  if (maxLevel <= minLevel) return 0;
  return (level - minLevel) / (maxLevel - minLevel);
}
