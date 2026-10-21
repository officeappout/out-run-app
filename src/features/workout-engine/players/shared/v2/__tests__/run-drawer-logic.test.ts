import { describe, expect, it } from 'vitest';
import {
  DRAWER_DRAG_PX,
  DRAWER_FLICK_V,
  getRememberedDrawerSnap,
  rememberDrawerSnap,
  resolveDrawerGesture,
  toggleDrawerSnap,
} from '../run-drawer-logic';
import { FLAG_DEFS, FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';

describe('resolveDrawerGesture (run / walk metrics drawer)', () => {
  it('full: drag down past the threshold → compact', () => {
    expect(resolveDrawerGesture('full', DRAWER_DRAG_PX + 1, 0)).toEqual({ type: 'snap', snap: 'compact' });
  });
  it('full: a flick down alone → compact', () => {
    expect(resolveDrawerGesture('full', 10, DRAWER_FLICK_V + 1)).toEqual({ type: 'snap', snap: 'compact' });
  });
  it('full: small moves and drags up do nothing', () => {
    expect(resolveDrawerGesture('full', 20, 100)).toEqual({ type: 'none' });
    expect(resolveDrawerGesture('full', -200, -900)).toEqual({ type: 'none' });
  });
  it('compact: further down hands over to the shell (session list), as today', () => {
    expect(resolveDrawerGesture('compact', 120, 0)).toEqual({ type: 'openList' });
    expect(resolveDrawerGesture('compact', 5, 900)).toEqual({ type: 'openList' });
  });
  it('compact: up → full', () => {
    expect(resolveDrawerGesture('compact', -60, 0)).toEqual({ type: 'snap', snap: 'full' });
    expect(resolveDrawerGesture('compact', -5, -800)).toEqual({ type: 'snap', snap: 'full' });
  });
  it('compact: a jiggle does nothing', () => {
    expect(resolveDrawerGesture('compact', 12, -30)).toEqual({ type: 'none' });
  });
  it('contradictory offset vs flick → nothing', () => {
    expect(resolveDrawerGesture('compact', 80, -900)).toEqual({ type: 'none' });
  });
  it('non-finite input is treated as no movement', () => {
    expect(resolveDrawerGesture('full', Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ type: 'none' });
  });
});

describe('drawer snap memory + toggle', () => {
  it('toggles between the two snaps', () => {
    expect(toggleDrawerSnap('full')).toBe('compact');
    expect(toggleDrawerSnap('compact')).toBe('full');
  });
  it('starts full and remembers the last snap (back from the session list)', () => {
    expect(getRememberedDrawerSnap()).toBe('full');
    rememberDrawerSnap('compact');
    expect(getRememberedDrawerSnap()).toBe('compact');
    rememberDrawerSnap('full');
    expect(getRememberedDrawerSnap()).toBe('full');
  });
});

describe('enable_run_player_drawer_v1 flag', () => {
  it('is fail-closed, previewed by super admins', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_run_player_drawer_v1');
    expect(def).toBeDefined();
    expect(def?.key).toBe('enableRunPlayerDrawerV1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect(FIRESTORE_FLAG_DEFAULTS.enable_run_player_drawer_v1).toBe(false);
  });
});
