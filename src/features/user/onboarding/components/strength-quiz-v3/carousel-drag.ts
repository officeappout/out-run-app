/**
 * The slider's card-switch motion (owner 30.10, AD6). Pure (tested): while the finger drags, the
 * centre card shrinks and fades a little, the card being pulled in grows to full size, and the row
 * follows the finger (damped). Same direction rule as swipeDirection: toward the reading end brings
 * the easier card in.
 */

/** Drag distance at which the switch look is complete. */
export const DRAG_FULL_PX = 120;
/** The row moves this share of the finger's distance. */
export const DRAG_FOLLOW = 0.35;
/** Side cards at rest: a little smaller and faded (the centre one reads as chosen). */
export const SIDE_REST = { scale: 0.92, opacity: 0.9 } as const;
/** Settle / switch timing (ms), used once the finger lifts or a side card is tapped. */
export const SETTLE_MS = 260;

export interface CardLook {
  scale: number;
  opacity: number;
}

export interface DragLook {
  rowX: number;
  center: CardLook;
  easier: CardLook;
  harder: CardLook;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const round = (n: number) => Math.round(n * 1000) / 1000;
const look = (scale: number, opacity: number): CardLook => ({ scale: round(scale), opacity: round(opacity) });

export function dragLook(dx: number, rtl: boolean): DragLook {
  const p = Math.min(1, Math.abs(dx) / DRAG_FULL_PX);
  const towardEnd = rtl ? dx < 0 : dx > 0;
  const incoming = look(lerp(SIDE_REST.scale, 1, p), lerp(SIDE_REST.opacity, 1, p));
  const outgoing = look(lerp(SIDE_REST.scale, 0.86, p), lerp(SIDE_REST.opacity, 0.6, p));
  return {
    rowX: round(dx * DRAG_FOLLOW),
    center: look(lerp(1, 0.9, p), lerp(1, 0.75, p)),
    easier: dx === 0 ? look(SIDE_REST.scale, SIDE_REST.opacity) : towardEnd ? incoming : outgoing,
    harder: dx === 0 ? look(SIDE_REST.scale, SIDE_REST.opacity) : towardEnd ? outgoing : incoming,
  };
}

export const lookStyle = ({ scale, opacity }: CardLook) => ({ transform: `scale(${scale})`, opacity: String(opacity) });
