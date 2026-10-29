/**
 * Entry globe — WHEN the dive may start (enable_entry_globe_v1). Pure, unit-tested.
 *
 * Owner note 21.10 #5: the dive used to start on the tap of "הראו לי מה יש לידי",
 * i.e. at the same moment the OS location prompt opened — the Earth flew in behind
 * the system dialog and the user, busy approving, missed the whole dive.
 *
 * Pilot note AC1 (29.10): asking BEFORE the dive was wrong too: the OS dialog
 * covered the resting Earth and the dive started only after it closed.
 *
 * The rule now: the dive starts on the tap (Earth lifts, flies to the country,
 * no prompt), the OS dialog opens once the Earth HOLDS over Israel, and the
 * answer decides the rest:
 *   granted  → the fix is fetched; the street flight starts when it lands
 *              (globe-camera.ts "continue smoothly")
 *   denied   → back to the resting Earth, the drawer with the error + manual search
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

/**
 * Longest wait for the Earth to hold over the country before asking anyway
 * (lift 1100 + region 1700 + slack, and room for a globe that loads late).
 */
export const DIVE_HOLD_TIMEOUT_MS = 6_000;

type Timers = { set: typeof setTimeout; clear: typeof clearTimeout };
const REAL_TIMERS: Timers = { set: setTimeout, clear: clearTimeout };

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
  timers: Timers = REAL_TIMERS,
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

/**
 * AC1 order: start the dive, wait until the Earth holds over the country (or
 * the hold timeout), THEN ask. `waitForHold` is armed before the dive starts so
 * an instant hold (reduced motion, no globe) is never missed.
 */
export async function askAfterDiveHold(opts: {
  startDive: () => void;
  waitForHold: () => Promise<void>;
  ask: () => Promise<'granted' | 'denied' | 'unknown'>;
  holdTimeoutMs?: number;
  answerTimeoutMs?: number;
  timers?: Timers;
}): Promise<LocationAnswer> {
  const timers = opts.timers ?? REAL_TIMERS;
  const hold = opts.waitForHold();
  opts.startDive();
  await new Promise<void>((resolve) => {
    const timer = timers.set(resolve, opts.holdTimeoutMs ?? DIVE_HOLD_TIMEOUT_MS);
    hold.then(
      () => { timers.clear(timer); resolve(); },
      () => { timers.clear(timer); resolve(); },
    );
  });
  return awaitLocationAnswer(opts.ask, opts.answerTimeoutMs, timers);
}
