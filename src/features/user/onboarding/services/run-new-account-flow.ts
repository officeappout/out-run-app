/**
 * enable_landing_real_fallback — a signed-in user with NO users/{uid} doc (a brand-new
 * Google / Apple account from the landing's login drawer, or an anonymous user who lost the
 * doc) used to be sent to /gateway (the old track picker). Now they get exactly what
 * "הרשמה מהירה" gives: runExploreMapFlow writes the same overwrite-safe scaffold
 * (buildExploreMapProfileWrite), consumes a pending referral / group / session invite, and
 * lands on /intro (once per device, when enable_entry_intro_v1 is on) or /explorer.
 *
 * resolveUser() inside the flow keeps a provider (non-anonymous) session as-is, and for an
 * anonymous session signInAnonymously() returns the same user — no new uid is minted.
 *
 * Single-flight: `/`'s auth listener and redirectAfterAuth both reach this for the same
 * sign-in; concurrent calls share one run, so the referral / invite is consumed once and
 * only one navigation happens.
 */
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { INTRO_SEEN_PREF, isIntroSeen, withIntroRedirect } from '../intro/intro-route';
import { runExploreMapFlow, type ExploreMapRouter } from './run-explore-map-flow';

let inflight: Promise<boolean> | null = null;

export function runNewAccountFlow(router: ExploreMapRouter, opts: { introOn: boolean }): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const flowRouter = opts.introOn
      ? withIntroRedirect(router, {
          introOn: true,
          introSeen: isIntroSeen(await getOnboardingPrefAsync(INTRO_SEEN_PREF)),
        })
      : router;
    return runExploreMapFlow(flowRouter);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
