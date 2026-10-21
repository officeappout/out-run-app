/**
 * Where the real flow sends people who used to land on /gateway (the old track picker)
 * — enable_landing_real_fallback, agent-briefs/gateway-retire-brief.md. Pure: no Firebase,
 * no browser APIs, no React. Every caller passes the flag in; flag off → callers keep their
 * old '/gateway' push, these helpers are never consulted.
 *
 * decideLandingRoute (src/lib/fast-startup/landing-decision.ts) stays the single source of
 * truth for a signed-in user whose doc exists; it calls resolveFallbackLanding below for the
 * branch that used to be '/gateway'.
 */

export const WELCOME_ROUTE = '/';
export const LEGACY_GATEWAY_ROUTE = '/gateway';

export type FallbackLanding = '/home' | '/explorer';

export interface ProgramFields {
  progression?: unknown;
  running?: unknown;
}

function nonEmptyRecord(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

/**
 * "Has a program": any strength domain (home's own hasProgram — progression.domains), an
 * active program entry, or a running program. The quick-signup scaffold has none of these.
 */
export function hasAnyProgram(data: ProgramFields | null | undefined): boolean {
  const progression = (data?.progression ?? null) as { domains?: unknown; activePrograms?: unknown } | null;
  if (nonEmptyRecord(progression?.domains)) return true;
  if (Array.isArray(progression?.activePrograms) && progression!.activePrograms.length > 0) return true;
  const running = (data?.running ?? null) as { activeProgram?: unknown } | null;
  return !!running?.activeProgram;
}

/** The '/gateway' branch of decideLandingRoute, flag on: a program → /home, else → /explorer. */
export function resolveFallbackLanding(data: ProgramFields | null | undefined): FallbackLanding {
  return hasAnyProgram(data) ? '/home' : '/explorer';
}

/**
 * Back button with no history (identity screen, OnboardingWizard) and the old /onboarding
 * page: /home for a signed-in user whose profile is loaded, else the welcome screen. Never `/`
 * for a profile holder — `/` would send an IN_PROGRESS user straight back to the same step.
 */
export function resolveBackFallback(hasProfile: boolean): '/home' | '/' {
  return hasProfile ? '/home' : WELCOME_ROUTE;
}

/** /gateway itself, flag on: the welcome screen, keeping ?ref= (other params are dropped). */
export function legacyGatewayRedirect(search: string | null | undefined): string {
  let ref: string | null = null;
  try {
    ref = new URLSearchParams(search ?? '').get('ref');
  } catch {
    ref = null;
  }
  return ref ? `${WELCOME_ROUTE}?ref=${encodeURIComponent(ref)}` : WELCOME_ROUTE;
}

/**
 * Push taps, flag on. Already-seeded push docs (and the Cloud Function's
 * ONBOARDING_DROPOFF_DEEP_LINK) still carry the 'gateway' target → '/gateway'; the app maps it
 * client-side so no function / seeded doc changes. It goes to `/`, which runs decideLandingRoute:
 * an IN_PROGRESS user resumes their saved step (what "continue signup" promises — the drop-off
 * push audience is IN_PROGRESS / ONBOARDING only), a finished user or one with a program lands
 * on /home, anyone else on /explorer; signed out → the welcome screen. Any other path is
 * returned unchanged. `pathAndSearch` is a same-origin pathname + search.
 */
export function mapLegacyPushPath(pathAndSearch: string): string {
  const [path] = pathAndSearch.split('?');
  if (path === LEGACY_GATEWAY_ROUTE || path === `${LEGACY_GATEWAY_ROUTE}/`) {
    return legacyGatewayRedirect(pathAndSearch.slice(path.length));
  }
  return pathAndSearch;
}
