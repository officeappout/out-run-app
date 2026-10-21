/**
 * The ring-close overlay's timeline (enable_entry_intro_v1) — pure, unit-tested.
 *
 * Owner note 21.10 #4 ("the screen after the characters doesn't sit well — the
 * closing circle"): the overlay ran on a fixed 5 s clock. At 3.1 s it measured the
 * globe headline's logo slot ONCE; when the location step underneath hadn't
 * mounted yet (lazy chunk + the saved-location check), the logo flew to a made-up
 * spot and faded, the white veil lifted on schedule over a half-mounted screen,
 * and the real logo then popped in on its own — the "jump". The ring's labels
 * (radius 178 + half a label) also ran off the edge of a 390 px phone.
 *
 * Now: the rise waits (polling) for the slot, up to SLOT_WAIT_S; the veil only
 * lifts once the logo has landed; the ring is scaled so its labels always fit.
 */

/** Ring, pop-in and logo beats (seconds) — the mockup's own (intro-G1). */
export const RING_CLOSE_BEATS = {
  /** the gradient circle closes over the segments */
  closeAt: 1.5,
  /** the ring shrinks/fades as the logotype crossfades in */
  crossfadeAt: 2.0,
  crossfadeEnd: 2.5,
  /** earliest moment the logo starts rising to the headline slot */
  riseAt: 3.1,
  /** the rise itself */
  riseS: 1.1,
  /** the veil starts lifting this long before the logo lands */
  veilLeadS: 0.4,
  /** the veil fade */
  veilS: 0.7,
} as const;

/** Longest the logo waits on the centre for the headline slot to exist. */
export const SLOT_WAIT_S = 2.5;
/** How often the slot is looked for while waiting. */
export const SLOT_POLL_MS = 100;

export interface RingClosePlan {
  /** when the logo starts to rise (s from the overlay's start) */
  riseStart: number;
  /** when it lands in the slot */
  landAt: number;
  /** veil fade window */
  veilStart: number;
  veilEnd: number;
  /** the overlay unmounts */
  doneAt: number;
}

/**
 * `slotReadyAt` = seconds from the overlay's start at which the slot was first
 * found (null = never found within the wait).
 */
export function ringClosePlan(slotReadyAt: number | null): RingClosePlan {
  const b = RING_CLOSE_BEATS;
  const latest = b.riseAt + SLOT_WAIT_S;
  const riseStart = slotReadyAt == null ? latest : Math.min(latest, Math.max(b.riseAt, slotReadyAt));
  const landAt = riseStart + b.riseS;
  const veilStart = landAt - b.veilLeadS;
  const veilEnd = veilStart + b.veilS;
  return { riseStart, landAt, veilStart, veilEnd, doneAt: veilEnd };
}

/** Ring box 300, labels at radius 178, 68 wide → 424 px of ring + labels. */
export const RING_CLOSE_SPAN = 2 * 178 + 68;
/** Side gutter the labels keep from the screen edge. */
export const RING_CLOSE_GUTTER = 12;

/** The ring's scale on a viewport this wide — labels never leave the screen. */
export function ringCloseScale(viewportWidth: number): number {
  if (!(viewportWidth > 0)) return 1;
  return Math.min(1, (viewportWidth - 2 * RING_CLOSE_GUTTER) / RING_CLOSE_SPAN);
}
