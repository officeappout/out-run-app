/**
 * Routes where <main> (src/app/ClientLayout.tsx) does NOT add the
 * env(safe-area-inset-top) padding. Moved verbatim out of ClientLayout so
 * other chrome (OnboardingLayout's v2 header) can tell whether <main> has
 * already reserved the notch — no behaviour change.
 */

// THE RULE: a route belongs on this list if some element of its own screen
// (a header bar, a hero image) is deliberately edge-to-edge — its own
// background/photo already reaches the TRUE top of the screen, with only
// its inner content/controls pushed down via that element's own
// env(safe-area-inset-top) padding. <main>'s global top padding (below)
// must NOT also apply to such a route — it would push the whole
// header/image down, leaving an empty gap above it that never reaches the
// true edge, which looks worse than having no padding at all. A route
// belongs here because of what ITS OWN top-most visual element does, not
// because of anything about the route's purpose or nesting.
//
//   /arena/create, /onboarding-new/profile, /progress, /debug/health-sync
//     — exact routes, no nested pages underneath.
//   /community/[id] — every community detail page; bare /community (the
//     list/tabs page) is unaffected and does NOT need the exemption.
//   /profile/[userId] — every user-profile page EXCEPT /profile/exercise/*,
//     which is a different, unrelated route nested under /profile/.
//   /workouts/[id]/overview — full-bleed hero photo, not a header bar; the
//     other 3 routes nested under /workouts/[id]/ (bare, /history, /active)
//     are NOT edge-to-edge and must stay off this list.
// /activity/steps: StepsAnalyticsView's sticky header pads the safe area itself
// (the doubled inset made it visibly thick).
export const TOP_PADDING_EXEMPT_EXACT_ROUTES = ['/arena/create', '/onboarding-new/profile', '/progress', '/debug/health-sync', '/activity/steps'];
export function isTopPaddingExemptRoute(pathname: string): boolean {
  if (TOP_PADDING_EXEMPT_EXACT_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith('/community/')) return true;
  if (pathname.startsWith('/profile/') && !pathname.startsWith('/profile/exercise/')) return true;
  if (pathname.startsWith('/workouts/') && pathname.endsWith('/overview')) return true;
  return false;
}
