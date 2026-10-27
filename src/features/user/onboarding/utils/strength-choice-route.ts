/**
 * Owner decision 27.10.2026, new users: choosing strength goes to a short details screen
 * (name, gender, birth date: /onboarding-new/profile) and then straight into the strength
 * questionnaire v3 intro (/onboarding-new/program-path, StrengthQuizV3Gate). Not via /home.
 *
 * The map's first drawer (what-now) plan card is that strength choice while running and
 * walking programs are frozen (enable_running_programs off). With them open, the card stays
 * the "strength, running or both" choice and keeps landing on /home's start cards.
 *
 * PURE: no Firebase, no browser APIs, no React. The caller seeds gateway_track.
 */
import { onboardingEntryHref } from './onboarding-entry';

export interface WhatNowPlanInput {
  /** useAerobicProgramsOpen().open: running / walking programs are open to this viewer. */
  aerobicOpen: boolean;
  /** The viewer already has a program (hasAnyProgram): nothing to sign up for. */
  hasProgram: boolean;
  /** name + gender + birth date already known (hasKnownIdentity): skip the details screen. */
  identityKnown: boolean;
}

export type WhatNowPlanHref = '/home' | '/onboarding-new/profile' | '/onboarding-new/program-path';

/** Where the drawer's plan card leads. '/home' = today's behavior. */
export function whatNowPlanHref({ aerobicOpen, hasProgram, identityKnown }: WhatNowPlanInput): WhatNowPlanHref {
  if (aerobicOpen || hasProgram) return '/home';
  return onboardingEntryHref('STRENGTH', identityKnown) as WhatNowPlanHref;
}

/** True when the plan card starts the strength signup (gateway_track must be STRENGTH). */
export function isStrengthSignupHref(href: string): boolean {
  return href !== '/home';
}
