/**
 * Mini Domain Assessment — Launcher
 *
 * Thin wrapper that runs the EXISTING `/onboarding-new/assessment-visual` page
 * for a SINGLE category/domain only (e.g. `categories=['legs']`), instead of
 * the full push/pull/legs/core assessment a brand-new user goes through.
 *
 * Not a rebuild of the slider: this reuses the page's existing `body_focus`
 * path (`getPathConfigSync()` in `assessment-path-config.service.ts`), which
 * already restricts `pathConfig.categories` to whatever is stored in
 * `sessionStorage['onboarding_muscle_focus']` and already skips tier selection
 * (`skipTier: true`). Seeding that ONE key (plus demographics, so the page's
 * own auth/demographics gate doesn't bounce the user back to
 * `/onboarding-new/profile`) is the entire "single-category" mechanism.
 *
 * The page also needs to know (a) that this is a MINI top-up on an
 * already-onboarded profile — so it should call the single-domain writer and
 * return to the caller instead of running the full sync + advancing to
 * `/onboarding-new/health` — and (b) where to return to. Both are passed via
 * the `mini_assessment_*` sessionStorage keys consumed by
 * assessment-visual/page.tsx's `handleAcceptResult` (guarded branch — see
 * that file; behaviour for every other caller is unchanged).
 */

import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { PrimaryCategory } from './single-domain-assessment.service';

export const MINI_ASSESSMENT_ACTIVE_KEY = 'mini_assessment_active';
export const MINI_ASSESSMENT_DOMAIN_KEY = 'mini_assessment_domain';
export const MINI_ASSESSMENT_RETURN_TO_KEY = 'mini_assessment_return_to';

const ASSESSMENT_VISUAL_ROUTE = '/onboarding-new/assessment-visual';

/** Minimal router shape needed here — matches both `next/navigation`'s useRouter() and AppRouterInstance. */
interface MiniAssessmentRouter {
  push: (href: string) => void;
}

/**
 * Seeds sessionStorage so `/onboarding-new/assessment-visual` runs its
 * existing body_focus/single-category path for `domain`, then navigates
 * there. Call this from any entry point that wants to send an already-
 * onboarded user to assess exactly one more domain (push/pull/legs/core).
 *
 * @param router    Next.js router (from `useRouter()` in the calling component).
 * @param domain    The single category to assess (push/pull/legs/core).
 * @param returnTo  Path to navigate back to once the mini-questionnaire
 *                  completes and the single-domain write succeeds. Defaults
 *                  to the current path (or '/home' when unavailable).
 */
export function startMiniDomainAssessment(
  router: MiniAssessmentRouter,
  domain: PrimaryCategory | string,
  returnTo?: string,
): void {
  if (typeof window === 'undefined') return;

  const resolvedReturnTo = returnTo ?? window.location?.pathname ?? '/home';

  try {
    // Path B (body_focus) config — restricts the slider to this ONE category
    // and skips tier selection (assessment-path-config.service.ts).
    sessionStorage.setItem('onboarding_program_path', 'body_focus');
    sessionStorage.setItem('onboarding_muscle_focus', JSON.stringify([domain]));

    // Mini-mode flags consumed by assessment-visual/page.tsx's accept handler.
    sessionStorage.setItem(MINI_ASSESSMENT_ACTIVE_KEY, '1');
    sessionStorage.setItem(MINI_ASSESSMENT_DOMAIN_KEY, domain);
    sessionStorage.setItem(MINI_ASSESSMENT_RETURN_TO_KEY, resolvedReturnTo);

    // Demographics fallback — the page redirects to /onboarding-new/profile
    // when `onboarding_personal_dob` / `onboarding_personal_gender` are
    // missing. An already-onboarded user has these on their profile even
    // though they may not be in sessionStorage this session (mirrors the
    // exact fallback already used by home/page.tsx's own assessment redirect).
    const profile = useUserStore.getState().profile;
    if (!sessionStorage.getItem('onboarding_personal_gender') && profile?.core?.gender) {
      sessionStorage.setItem('onboarding_personal_gender', profile.core.gender);
    }
    if (!sessionStorage.getItem('onboarding_personal_dob') && profile?.core?.birthDate) {
      const bd = profile.core.birthDate;
      const dobStr = bd instanceof Date ? bd.toISOString().split('T')[0] : String(bd);
      sessionStorage.setItem('onboarding_personal_dob', dobStr);
    }
    if (!sessionStorage.getItem('onboarding_personal_name') && profile?.core?.name) {
      sessionStorage.setItem('onboarding_personal_name', profile.core.name);
    }
  } catch (e) {
    console.warn('[MiniDomainAssessment] sessionStorage seed failed (non-fatal):', e);
  }

  router.push(ASSESSMENT_VISUAL_ROUTE);
}

/** True while a mini-domain assessment is in progress (checked by assessment-visual/page.tsx). */
export function isMiniAssessmentActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MINI_ASSESSMENT_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Pure resolver: given a program id/slug (e.g. 'planche', 'front_lever') and a
 * "category → enrollment slugs" map (e.g. WorkoutBuilderSheet's
 * `DOMAIN_ENROLLMENT_SLUGS`), returns the single push/pull/legs/core category
 * the mini-questionnaire should assess. Falls back to the (optionally
 * slug-resolved) id itself when no mapping matches — callers that already
 * deal directly in push/pull/legs/core (ProgramsSection, StatsOverview) get
 * an identity passthrough. Kept here (rather than inline per-component) so
 * it is independently unit-testable without rendering any component.
 */
export function resolveBaseCategoryForProgramId(
  id: string,
  categorySlugs: Record<string, string[]>,
  slugResolver?: (id: string) => string,
): string {
  const slug = slugResolver ? (slugResolver(id) || id) : id;
  for (const [category, slugs] of Object.entries(categorySlugs)) {
    if (slugs.includes(slug) || slugs.includes(id)) return category;
  }
  return slug;
}

/** Reads + clears the mini-assessment flags. Call once, after persisting the result. */
export function consumeMiniAssessmentState(): { domain: string | null; returnTo: string } {
  if (typeof window === 'undefined') return { domain: null, returnTo: '/home' };
  let domain: string | null = null;
  let returnTo = '/home';
  try {
    domain = sessionStorage.getItem(MINI_ASSESSMENT_DOMAIN_KEY);
    returnTo = sessionStorage.getItem(MINI_ASSESSMENT_RETURN_TO_KEY) || '/home';
    sessionStorage.removeItem(MINI_ASSESSMENT_ACTIVE_KEY);
    sessionStorage.removeItem(MINI_ASSESSMENT_DOMAIN_KEY);
    sessionStorage.removeItem(MINI_ASSESSMENT_RETURN_TO_KEY);
  } catch (e) {
    console.warn('[MiniDomainAssessment] sessionStorage cleanup failed (non-fatal):', e);
  }
  return { domain, returnTo };
}
