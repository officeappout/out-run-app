/**
 * Owner decision 27.10.2026: every NEW sign-up sees the entry intro (/intro) and then the
 * globe dive, not only the landing's quick signup. One helper for every new-account flow
 * (landing quick signup, Google / Apple new account via runNewAccountFlow, /gateway's
 * explore-map card): wraps the router so the flow's final plain `/explorer` push becomes
 * `/intro` while the intro is not yet seen on this device (resolveQuickSignupHref).
 * Invite redirects keep their own target; flag off returns the router untouched.
 *
 * Never used for edit-intent pushes (usePersonalInfoEditor's city edit) or the recovery
 * pushes of returning MAP_ONLY users: those call router.push('/explorer') directly.
 */
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { INTRO_SEEN_PREF, isIntroSeen, withIntroRedirect } from './intro-route';

type PushRouter = { push: (href: string) => void };

export async function introAwareRouter(
  router: PushRouter,
  opts: { introOn: boolean; preview?: boolean },
): Promise<PushRouter> {
  if (opts.preview) return withIntroRedirect(router, { introOn: true, introSeen: false, preview: true });
  if (!opts.introOn) return router;
  return withIntroRedirect(router, {
    introOn: true,
    introSeen: isIntroSeen(await getOnboardingPrefAsync(INTRO_SEEN_PREF)),
  });
}
