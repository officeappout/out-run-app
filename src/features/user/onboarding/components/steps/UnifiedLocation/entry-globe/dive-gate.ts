/**
 * Entry globe — WHEN the dive may start (enable_entry_globe_v1). Pure, unit-tested.
 *
 * Owner note 21.10 #5: the dive used to start on the tap of "הראו לי מה יש לידי",
 * i.e. at the same moment the OS location prompt opened — the Earth flew in behind
 * the system dialog and the user, busy approving, missed the whole dive.
 *
 * The rule now: ask first, wait for the ANSWER, then dive.
 *   granted  → dive now (the fix is fetched while the Earth lifts; the flight bends
 *              to the user when it lands — globe-camera.ts "continue smoothly")
 *   denied   → no dive; back to the drawer with the error + manual search
 *   unknown  → the platform can't tell before the fix (web without the
 *              Permissions API, or a prompt still pending): the prompt IS the fix
 *              request, so dive once the first fix comes back
 *   timeout  → the OS never answered (a stuck plugin): same as unknown — the fix
 *              request carries its own timeout and error path
 */

export type LocationAnswer = 'granted' | 'denied' | 'unknown' | 'timeout';
export type DiveStart = 'now' | 'after-fix' | 'never';

/** How long the step waits for the OS dialog's answer before carrying on without it. */
export const LOCATION_ANSWER_TIMEOUT_MS = 30_000;

export function diveStartFor(answer: LocationAnswer): DiveStart {
  if (answer === 'granted') return 'now';
  if (answer === 'denied') return 'never';
  return 'after-fix';
}

/**
 * Resolves with the user's answer to the permission request, or 'timeout'.
 * A throwing / rejecting request counts as 'unknown' (let the fix path decide).
 */
export function awaitLocationAnswer(
  ask: () => Promise<'granted' | 'denied' | 'unknown'>,
  timeoutMs: number = LOCATION_ANSWER_TIMEOUT_MS,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): Promise<LocationAnswer> {
  return new Promise<LocationAnswer>((resolve) => {
    let settled = false;
    const finish = (a: LocationAnswer) => {
      if (settled) return;
      settled = true;
      timers.clear(timer);
      resolve(a);
    };
    const timer = timers.set(() => finish('timeout'), timeoutMs);
    let p: Promise<'granted' | 'denied' | 'unknown'>;
    try {
      p = ask();
    } catch {
      finish('unknown');
      return;
    }
    p.then(finish, () => finish('unknown'));
  });
}
