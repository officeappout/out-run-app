/**
 * iOS edge-swipe-back for the Capacitor app (home v2, David 17.10.2026:
 * "swipe back on every screen, like apps generally do").
 *
 * Pure decisions only — the gesture itself lives in
 * src/components/system/EdgeSwipeBack.tsx. Kept here so they are unit-tested.
 *
 * Direction: the app is RTL (Hebrew, back arrows point right), and iOS mirrors
 * the back swipe for RTL — it starts at the RIGHT edge and the page follows
 * the finger to the left. So: right edge, negative dx.
 */

/** Width of the right-edge strip a back swipe must start in (CSS px). */
export const EDGE_START_PX = 24;
/** Horizontal travel before the gesture is locked as a swipe (vs. a scroll). */
export const LOCK_SLOP_PX = 10;
/** Release past this fraction of the screen width → go back. */
export const COMMIT_FRACTION = 0.35;
/** …or a fast flick (px/ms, leftwards) past a small minimum distance. */
export const COMMIT_VELOCITY = 0.5;
export const COMMIT_MIN_PX = 40;

/**
 * Screens with no back: the bottom-bar tab roots (iOS has no back swipe on a
 * tab root either) and the landing page.
 */
const ROOT_ROUTES = new Set(['/', '/home', '/map', '/progression', '/community', '/profile']);

/**
 * Prefixes where a horizontal edge drag must stay the page's own, or where a
 * "back" would break a flow: the map (pan), workouts/runs in progress
 * (exiting has its own guarded path), onboarding/gateway (linear wizards),
 * admin/authority panels (desktop tools).
 */
const BLOCKED_PREFIXES = [
  '/map',
  '/run',
  '/onboarding',
  '/onboarding-new',
  '/gateway',
  '/workout-builder',
  '/admin',
  '/authority-portal',
  '/booth',
];

export function isSwipeBackRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (ROOT_ROUTES.has(path)) return false;
  if (path.includes('/active')) return false;
  return !BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

/** Did the touch start in the back-swipe edge strip? (right edge, RTL) */
export function startsAtBackEdge(clientX: number, viewportWidth: number): boolean {
  return clientX >= viewportWidth - EDGE_START_PX;
}

/**
 * On release: go back, or spring back? dx is negative while the page follows
 * the finger leftwards; vx is px/ms (negative = leftwards).
 */
export function shouldCommitSwipe(dx: number, vx: number, viewportWidth: number): boolean {
  if (dx >= 0) return false;
  const travel = -dx;
  if (travel >= viewportWidth * COMMIT_FRACTION) return true;
  return travel >= COMMIT_MIN_PX && vx <= -COMMIT_VELOCITY;
}

/**
 * In-app history tracked from pathname changes, so the swipe only exists when
 * there IS an in-app page to go back to (a cold start on a deep link has
 * none — router.back() there would leave the app's history). Going to the
 * previous path counts as a back and pops; anything else pushes.
 */
export function nextNavStack(stack: readonly string[], pathname: string): string[] {
  if (stack[stack.length - 1] === pathname) return [...stack];
  if (stack.length >= 2 && stack[stack.length - 2] === pathname) return stack.slice(0, -1);
  const next = [...stack, pathname];
  return next.length > 50 ? next.slice(-50) : next;
}
