import { afterEach, describe, expect, it } from 'vitest';
import {
  getRememberedSnap,
  rememberSnap,
  resetRememberedSnaps,
  resolveSnapGesture,
  toggleDrawerSnap,
} from '../snap-drawer-logic';
import { DRAWER_DRAG_PX, DRAWER_FLICK_V } from '../run-drawer-logic';
import { FLAG_DEFS, FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';

afterEach(() => resetRememberedSnaps());

describe('resolveSnapGesture (strength / timed drawer)', () => {
  it('full: down past the threshold or a flick → compact', () => {
    expect(resolveSnapGesture('full', DRAWER_DRAG_PX + 1, 0)).toBe('compact');
    expect(resolveSnapGesture('full', 4, DRAWER_FLICK_V + 1)).toBe('compact');
  });
  it('full: small moves / up do nothing', () => {
    expect(resolveSnapGesture('full', 10, 50)).toBeNull();
    expect(resolveSnapGesture('full', -200, -900)).toBeNull();
  });
  it('compact: up → full', () => {
    expect(resolveSnapGesture('compact', -60, 0)).toBe('full');
    expect(resolveSnapGesture('compact', -2, -800)).toBe('full');
  });
  it('compact: further down does nothing (no list behind, unlike the run drawer)', () => {
    expect(resolveSnapGesture('compact', 200, 0)).toBeNull();
    expect(resolveSnapGesture('compact', 0, 1200)).toBeNull();
  });
  it('non-finite input → nothing', () => {
    expect(resolveSnapGesture('full', Number.NaN, Number.NaN)).toBeNull();
  });
});

describe('snap memory (per drawer key, app session)', () => {
  it('starts full for every key', () => {
    expect(getRememberedSnap('strength')).toBe('full');
    expect(getRememberedSnap('timed')).toBe('full');
  });
  it('remembers each key on its own', () => {
    rememberSnap('strength', 'compact');
    expect(getRememberedSnap('strength')).toBe('compact');
    expect(getRememberedSnap('timed')).toBe('full');
    rememberSnap('strength', 'full');
    expect(getRememberedSnap('strength')).toBe('full');
  });
  it('toggle flips the snap', () => {
    expect(toggleDrawerSnap('full')).toBe('compact');
    expect(toggleDrawerSnap('compact')).toBe('full');
  });
});

describe('enable_strength_drawer_v1 flag', () => {
  it('is fail-closed, previewed by super admins', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_strength_drawer_v1');
    expect(def?.key).toBe('enableStrengthDrawerV1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect(FIRESTORE_FLAG_DEFAULTS.enable_strength_drawer_v1).toBe(false);
  });
});
