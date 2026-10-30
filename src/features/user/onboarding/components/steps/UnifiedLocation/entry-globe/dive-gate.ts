/**
 * Entry globe — WHEN the dive may start (enable_entry_globe_v1). Pure, unit-tested.
 *
 * Owner note 21.10 #5: the dive used to start on the tap of "הראו לי מה יש לידי",
 * i.e. at the same moment the OS location prompt opened — the Earth flew in behind
 * the system dialog and the user, busy approving, missed the whole dive.
 *
 * Pilot note AC1 (29.10) then moved the ask to AFTER the dive held over the
 * country (PR #960). Pilot note AF4 (30.10) supersedes that on purpose: the
 * owner wants the blue "search my area" tap itself to open the OS dialog, and
 * the dive to start from the answer, straight to the user's real location.
 *
 * The rule now: nothing asks before the tap; the tap opens the OS dialog while
 * the Earth rests; the answer decides the rest:
 *   granted  → dive now; the fix is fetched meanwhile and the street flight
 *              starts when it lands (globe-camera.ts "continue smoothly")
 *   denied   → no dive; the city search opens (picking a place dives to it)
 *   unknown  → the platform can't tell before the fix (web without the
 *              Permissions API, or Android "approximate only"): the fix request
 *              decides, dive once the first fix comes back
 *   timeout  → the OS never answered (a stuck plugin): same as unknown, the fix
 *              request carries its own timeout and error path
 */

export type LocationAnswer = 'granted' | 'denied' | 'unknown' | 'timeout';
export type DiveStart = 'now' | 'after-fix' | 'never';

/** How long the step waits for the OS dialog's answer before carrying on without it. */
export const LOCATION_ANSWER_TIMEOUT_MS = 30_000;

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
 * AF4 order: ask first (the tap's own gesture opens the OS dialog), then start
 * the dive only if the answer allows it. `isCurrent` drops a late answer when
 * the user moved on meanwhile (e.g. "search manually"): no dive behind them.
 * Resolves null for a dropped answer.
 */
export async function askBeforeDive(opts: {
  ask: () => Promise<'granted' | 'denied' | 'unknown'>;
  isCurrent: () => boolean;
  startDive: () => void;
  answerTimeoutMs?: number;
  timers?: Timers;
}): Promise<{ answer: LocationAnswer; start: DiveStart } | null> {
  const answer = await awaitLocationAnswer(opts.ask, opts.answerTimeoutMs, opts.timers ?? REAL_TIMERS);
  if (!opts.isCurrent()) return null;
  const start = diveStartFor(answer);
  if (start === 'now') opts.startDive();
  return { answer, start };
}
