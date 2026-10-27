/**
 * Durable markers of the schedule tutorial (onboardingPrefs: survives a hard close on iOS).
 *
 * - seen: the tutorial ran to the end, or the user tapped "דלג" on ל1. Never offered again.
 * - home tour arm: written when ל5 closes. Part B (the home tour from today's cards) reads it with
 *   isHomeTourArmedAfterScheduleTutorial and clears it with consumeHomeTourArm once its tour starts.
 *
 * Keys are per uid, like the first-run tours (first-run-tour.ts firstRunTourSeenKey).
 */
import { getOnboardingPref, removeOnboardingPref, setOnboardingPref } from '@/lib/onboardingPrefs';

export const scheduleTutorialSeenKey = (uid: string | null | undefined): string => `schedule_tutorial_v1_seen:${uid || 'anon'}`;
export const homeTourArmKey = (uid: string | null | undefined): string => `schedule_tutorial_v1_home_tour:${uid || 'anon'}`;

export function markScheduleTutorialSeen(uid: string | null | undefined): void {
  setOnboardingPref(scheduleTutorialSeenKey(uid), '1');
}

/** ל5 closed: the home tour should start from today's cards on this home visit. */
export function armHomeTourAfterScheduleTutorial(uid: string | null | undefined): void {
  setOnboardingPref(homeTourArmKey(uid), String(Date.now()));
}

export function isHomeTourArmedAfterScheduleTutorial(uid: string | null | undefined): boolean {
  return !!getOnboardingPref(homeTourArmKey(uid));
}

export function consumeHomeTourArm(uid: string | null | undefined): void {
  removeOnboardingPref(homeTourArmKey(uid));
}
