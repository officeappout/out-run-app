/**
 * Entry flow v2 — where the quick signup goes, and the "seen once" / "arriving
 * from the intro" signals (enable_entry_intro_v1).
 *
 *   landing "הרשמה מהירה" → runExploreMapFlow (unchanged) → it pushes `/explorer`
 *     → with the flag on and the intro not yet seen on this device, that one push
 *       becomes `/intro` instead. Every other push (the pending group / session
 *       invite redirects) passes through untouched.
 *   /intro → on finish or "דלג": the durable `entry_intro_seen` pref (onboardingPrefs,
 *     axioms §19 — survives a hard close on native) + the short-lived sessionStorage
 *     hint `entry_intro_arrival`, then `/explorer`, which plays the ring-close overlay
 *     exactly once (consumeIntroArrival removes the hint).
 *
 * Pure: no React / Next imports; storage is passed in (testable).
 */

export const INTRO_ROUTE = '/intro';
export const EXPLORER_ROUTE = '/explorer';
/** onboardingPrefs key — durable, "1" once the intro finished or was skipped. */
export const INTRO_SEEN_PREF = 'entry_intro_seen';
/** sessionStorage key — "1" while the hop /intro → /explorer is in flight. */
export const INTRO_ARRIVAL_KEY = 'entry_intro_arrival';
/** The globe headline's logo slot — where the ring-close logo comes to rest. */
export const LOGO_SLOT_ATTR = 'data-entry-intro-logo-slot';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isIntroSeen(prefValue: string | null | undefined): boolean {
  return prefValue === '1';
}

/**
 * The href the quick signup should actually navigate to. Only the plain
 * `/explorer` landing is redirected; invite redirects keep their own target.
 */
export function resolveQuickSignupHref(
  href: string,
  opts: { introOn: boolean; introSeen: boolean },
): string {
  if (!opts.introOn || opts.introSeen) return href;
  return href === EXPLORER_ROUTE ? INTRO_ROUTE : href;
}

/** Wraps a router so runExploreMapFlow's final push honours resolveQuickSignupHref. */
export function withIntroRedirect<R extends { push: (href: string) => void }>(
  router: R,
  opts: { introOn: boolean; introSeen: boolean },
): { push: (href: string) => void } {
  return { push: (href: string) => router.push(resolveQuickSignupHref(href, opts)) };
}

/** Called by /intro right before navigating to /explorer. */
export function markIntroArrival(storage: KeyValueStorage | null | undefined): void {
  try {
    storage?.setItem(INTRO_ARRIVAL_KEY, '1');
  } catch {
    /* private mode / quota — the overlay is a nicety, the globe still shows */
  }
}

/** True once for the /explorer visit that follows the intro; clears the hint. */
export function consumeIntroArrival(storage: KeyValueStorage | null | undefined): boolean {
  let arriving = false;
  try {
    arriving = storage?.getItem(INTRO_ARRIVAL_KEY) === '1';
    storage?.removeItem(INTRO_ARRIVAL_KEY);
  } catch {
    return false;
  }
  return arriving;
}
