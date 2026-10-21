/**
 * First-launch missions ("from the moment I download the app") — pure helpers.
 *
 * The real journey of a new user (agent-briefs/first-launch-journey.md):
 *   "/" signed out (landing) → "הרשמה מהירה" = an anonymous Firebase account + a MAP_ONLY users
 *   doc (runExploreMapFlow) → /intro (enable_entry_intro_v1, once per device) → /explorer (the
 *   location step) → /map (step 2 "מה בא לך עכשיו?") → /home (welcome drawer / start cards) →
 *   the track's onboarding. Never /gateway.
 *
 * A tester can't create that anonymous account (it would be a real production account), so a
 * first-launch mission runs in two phases:
 *   1. SIGNED OUT — a fresh browser, no token. The tester walks the screens before the account
 *      exists. Fence: every auth / account-creating request is aborted (AUTH_FENCE_*), and the
 *      runner refuses to go on if any account is signed in on the page.
 *   2. HANDOFF — the tester calls continue_signed_in where the real flow creates the account
 *      (the quick-signup button). The runner mints the tester token, signs in, and opens
 *      `firstLaunch.continueAt` (default /intro — the page the quick signup goes to; /intro
 *      itself goes on to /explorer when the intro flag is off). The tester account was seeded
 *      in the SAME state the quick signup writes (precondition map_only), so "/" routes it like
 *      a real new user (landing-decision: MAP_ONLY → /explorer), never to /gateway.
 */
import type { Checkpoint } from './design/checkpoints';

export interface FirstLaunch {
  /** Where the app continues after the account exists (the quick signup's target). */
  continueAt: string;
}

/** The page the landing's quick signup navigates to (intro-route.ts INTRO_ROUTE). */
export const DEFAULT_CONTINUE_AT = '/intro';

/** The precondition a first-launch account must start in (what runExploreMapFlow writes). */
export const FIRST_LAUNCH_PRECONDITION = 'map_only';

interface FirstLaunchFields {
  start: string;
  precondition?: string;
  firstLaunch?: FirstLaunch;
  checkpoints?: Checkpoint[];
}

const isPath = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

/** Validation of `firstLaunch` + `checkpoint.signedOut` (errors appended to `e`). */
export function validateFirstLaunch(m: Record<string, unknown>, e: string[]): void {
  const fl = m.firstLaunch as Record<string, unknown> | undefined;
  const cps = Array.isArray(m.checkpoints) ? (m.checkpoints as Array<Record<string, unknown>>) : [];
  if (fl !== undefined) {
    if (!fl || typeof fl !== 'object' || !isPath(fl.continueAt)) e.push('mission.firstLaunch.continueAt');
    if (m.precondition !== FIRST_LAUNCH_PRECONDITION) e.push(`mission.firstLaunch (needs precondition ${FIRST_LAUNCH_PRECONDITION})`);
  }
  const flags = cps.map((c) => c?.signedOut);
  if (flags.some((f) => f !== undefined && typeof f !== 'boolean')) e.push('mission.checkpoints.signedOut');
  if (flags.some((f) => f === true)) {
    if (fl === undefined) e.push('mission.checkpoints.signedOut (only in a firstLaunch mission)');
    // Signed-out screens come first: the handoff is one-way.
    const firstIn = flags.findIndex((f) => f !== true);
    if (firstIn >= 0 && flags.slice(firstIn).some((f) => f === true)) e.push('mission.checkpoints.signedOut (signed-out checkpoints must come first)');
  }
}

/** Is this checkpoint before the handoff? */
export function isSignedOutCheckpoint(m: FirstLaunchFields, checkpointId: string | null): boolean {
  if (!checkpointId) return false;
  return m.checkpoints?.find((c) => c.id === checkpointId)?.signedOut === true;
}

/**
 * Does this session (fresh or resumed at `resumeFrom`) start signed out? Only first-launch
 * missions, and only from their beginning or from a signed-out checkpoint.
 */
export function startsSignedOut(m: FirstLaunchFields, resumeFrom: string | null): boolean {
  if (!m.firstLaunch) return false;
  return resumeFrom === null || isSignedOutCheckpoint(m, resumeFrom);
}

/**
 * The start page of a session resumed at `checkpoint`: the checkpoint's own path; else, for a
 * first-launch mission resumed AFTER the handoff, the handoff target; else the mission start.
 */
export function resumeStart(m: FirstLaunchFields, checkpoint: string | null): string {
  const cp = checkpoint ? m.checkpoints?.find((c) => c.id === checkpoint) : undefined;
  if (cp?.path) return cp.path;
  if (m.firstLaunch && cp && !cp.signedOut) return m.firstLaunch.continueAt;
  return m.start;
}

// ── The signed-out fence ──────────────────────────────────────────────────────

/** Hosts that create / restore an account (anonymous sign-up, Google / Apple sign-in, token refresh). */
export const AUTH_FENCE_HOSTS = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'accounts.google.com', 'appleid.apple.com'] as const;

/** Route pattern handed to Playwright (the handler decides with isAuthFencedRequest). */
export const AUTH_FENCE_PATTERN = /(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|accounts\.google\.com|appleid\.apple\.com|\/__\/auth\/|\/api\/)/;

/**
 * While signed out, abort: anything to the auth hosts, the app's own auth handler (/__/auth/),
 * and any non-GET call to the app's /api (e.g. the signup-failure telemetry a blocked quick
 * signup would send — an anonymous request the demo filters could not tell apart from a user's).
 */
export function isAuthFencedRequest(url: string, method: string, appHosts: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const h = u.hostname;
  if (AUTH_FENCE_HOSTS.some((b) => h === b || h.endsWith(`.${b}`))) return true;
  if (!appHosts.includes(h)) return false;
  if (u.pathname.startsWith('/__/auth/')) return true;
  return u.pathname.startsWith('/api/') && method.toUpperCase() !== 'GET';
}

/** Signed-out phase: nobody may be signed in on the page (null = fine). */
export function signedOutGuardReason(uid: string | null): string | null {
  return uid ? 'signed_in_before_handoff' : null;
}

// ── The legacy gateway ────────────────────────────────────────────────────────

export const LEGACY_GATEWAY_PATH = '/gateway';

/**
 * A mission that follows the real first-launch path (precondition map_only) must never land on
 * /gateway — when it does, the runner records it (P1) once per session.
 */
export function isLegacyGatewayHit(m: { precondition?: string }, url: string): boolean {
  if (m.precondition !== FIRST_LAUNCH_PRECONDITION) return false;
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '') || '/';
    return p === LEGACY_GATEWAY_PATH;
  } catch {
    return false;
  }
}
