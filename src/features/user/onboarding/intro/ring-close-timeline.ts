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
 * Then: the rise waits (polling) for the slot, up to SLOT_WAIT_S; the veil never
 * lifts before the slot exists; the ring is scaled so its labels always fit.
 */

/**
 * Pilot note AF2 (30.10, "the five parts still feel stuck"): the old clock had a
 * dead hold. The logo was fully formed at 2.5 s but could not rise before 3.1 s
 * (and the slot was first looked for only then), so it sat frozen on a blank veil;
 * the ring shrank while the logo grew (two motions pulling opposite ways); and the
 * globe stayed hidden until the logo had already landed. Now every beat starts as
 * the previous one ends: the segments assemble (tight stagger), the ring closes,
 * it condenses into the logo (both shrink inward), the logo rises the moment it is
 * formed, and the veil lifts mid-flight so the globe appears under it.
 */

/** Ring, pop-in and logo beats (seconds). */
export const RING_CLOSE_BEATS = {
  /** first segment pops in */
  popDelay: 0.05,
  /** gap between segments: they assemble as one gesture, not five */
  popStagger: 0.12,
  /** one segment's pop */
  popS: 0.45,
  /** the gradient circle closes over the segments (right as the last one lands) */
  closeAt: 1.0,
  closeS: 0.4,
  /** the ring condenses into the logotype */
  crossfadeAt: 1.4,
  crossfadeEnd: 1.9,
  /** earliest moment the logo starts rising: the instant it is formed, no hold */
  riseAt: 1.9,
  /** the rise itself */
  riseS: 1.0,
  /** the veil starts lifting this far into the rise (fraction of riseS) */
  veilInFlight: 0.35,
  /** no slot found: the veil starts lifting this long before the logo lands */
  veilLeadS: 0.4,
  /** the veil fade */
  veilS: 0.9,
} as const;

/** Longest the logo waits on the centre for the headline slot to exist. */
export const SLOT_WAIT_S = 2.5;
/** How often the slot is looked for (from the overlay's first frame). */
export const SLOT_POLL_MS = 100;

/** When segment i (0..4) starts popping in. */
export function popDelay(i: number): number {
  return RING_CLOSE_BEATS.popDelay + RING_CLOSE_BEATS.popStagger * i;
}

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
 * found (null = never found within the wait). A slot found early rises right at
 * riseAt; a late one rises the moment it appears.
 */
export function ringClosePlan(slotReadyAt: number | null): RingClosePlan {
  const b = RING_CLOSE_BEATS;
  const latest = b.riseAt + SLOT_WAIT_S;
  const riseStart = slotReadyAt == null ? latest : Math.min(latest, Math.max(b.riseAt, slotReadyAt));
  const landAt = riseStart + b.riseS;
  // Found: the screen underneath is mounted, so the globe can appear while the
  // logo flies. Not found: keep the veil until the landing (nothing to show yet).
  const veilStart = slotReadyAt == null ? landAt - b.veilLeadS : riseStart + b.veilInFlight * b.riseS;
  const veilEnd = veilStart + b.veilS;
  return { riseStart, landAt, veilStart, veilEnd, doneAt: Math.max(landAt, veilEnd) };
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
