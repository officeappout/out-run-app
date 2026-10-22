/**
 * Pure logic for the two-snap player drawer used outside the run players
 * (strength / tabata / AMRAP / EMOM — enable_strength_drawer_v1). Same
 * gesture thresholds as the run drawer (run-drawer-logic), with two
 * differences: there is no session list "behind" (a drag down from compact is
 * ignored), and the last snap is remembered per drawer key so each surface
 * keeps its own state for the app session.
 */

import { resolveDrawerGesture, toggleDrawerSnap, type RunDrawerSnap } from './run-drawer-logic';

export type SnapDrawerSnap = RunDrawerSnap;

/** What a released drag does: a new snap, or nothing. */
export function resolveSnapGesture(snap: SnapDrawerSnap, offsetY: number, velocityY: number): SnapDrawerSnap | null {
  const action = resolveDrawerGesture(snap, offsetY, velocityY);
  return action.type === 'snap' ? action.snap : null;
}

export { toggleDrawerSnap };

const remembered = new Map<string, SnapDrawerSnap>();

export function getRememberedSnap(key: string): SnapDrawerSnap {
  return remembered.get(key) ?? 'full';
}

export function rememberSnap(key: string, snap: SnapDrawerSnap): void {
  remembered.set(key, snap === 'compact' ? 'compact' : 'full');
}

/** Tests only. */
export function resetRememberedSnaps(): void {
  remembered.clear();
}
