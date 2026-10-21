/**
 * Pure logic for the run / walk metrics drawer (enable_run_player_drawer_v1).
 *
 * Two snaps: `full` (today's live card) and `compact` (the mini line —
 * time · distance · pace + pause). Dragging down from compact does not add a
 * third snap: it hands over to the player shell, which opens the session list
 * behind the player exactly as before.
 */

export type RunDrawerSnap = 'full' | 'compact';

export type RunDrawerAction =
  | { type: 'snap'; snap: RunDrawerSnap }
  | { type: 'openList' }
  | { type: 'none' };

/** Drag distance (px) that counts as a deliberate move. */
export const DRAWER_DRAG_PX = 44;
/** Flick velocity (px/s) that counts on its own. */
export const DRAWER_FLICK_V = 500;

/** What a released drag on the drawer does (positive y = down). */
export function resolveDrawerGesture(
  snap: RunDrawerSnap,
  offsetY: number,
  velocityY: number,
  dragPx: number = DRAWER_DRAG_PX,
  flickV: number = DRAWER_FLICK_V,
): RunDrawerAction {
  const oy = Number.isFinite(offsetY) ? offsetY : 0;
  const vy = Number.isFinite(velocityY) ? velocityY : 0;
  const down = oy > dragPx || vy > flickV;
  const up = oy < -dragPx || vy < -flickV;
  if (down && up) return { type: 'none' }; // contradictory (tiny offset, opposite flick) — ignore
  if (snap === 'full') return down ? { type: 'snap', snap: 'compact' } : { type: 'none' };
  if (up) return { type: 'snap', snap: 'full' };
  if (down) return { type: 'openList' };
  return { type: 'none' };
}

/** Tap on the handle / compact bar toggles between the two snaps. */
export function toggleDrawerSnap(snap: RunDrawerSnap): RunDrawerSnap {
  return snap === 'full' ? 'compact' : 'full';
}

// The player content unmounts while the session list is open (PlayerShell
// renders the mini bar instead) — the last snap is kept per app session so
// coming back from the list lands where the runner left it.
let rememberedSnap: RunDrawerSnap = 'full';

export function getRememberedDrawerSnap(): RunDrawerSnap {
  return rememberedSnap;
}

export function rememberDrawerSnap(snap: RunDrawerSnap): void {
  rememberedSnap = snap === 'compact' ? 'compact' : 'full';
}
