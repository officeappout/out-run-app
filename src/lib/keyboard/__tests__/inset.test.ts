import { describe, expect, it } from 'vitest';
import {
  insetChangeNeedsReveal,
  MIN_KEYBOARD_INSET_PX,
  computeRevealDelta,
  opensKeyboard,
  resolveKeyboardInset,
} from '../inset';

describe('resolveKeyboardInset — web (visualViewport) path', () => {
  const base = { nativeKeyboardHeight: null, layoutHeight: 844, visualOffsetTop: 0 };

  it('is 0 with no keyboard', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 844 })).toBe(0);
  });

  it('is the covered height when the visual viewport shrinks (iOS Safari)', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 508 })).toBe(336);
  });

  it('subtracts the iOS pan (offsetTop) so fixed bars do not float above the keyboard', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 508, visualOffsetTop: 120 })).toBe(216);
  });

  it('ignores small shrinks (URL bar / toolbar), not a keyboard', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 844 - (MIN_KEYBOARD_INSET_PX - 1) })).toBe(0);
  });

  it('is 0 on Android where the WebView itself resizes (layout == visual)', () => {
    expect(resolveKeyboardInset({ ...base, layoutHeight: 500, visualHeight: 500 })).toBe(0);
  });

  it('never goes negative and survives NaN', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 900 })).toBe(0);
    expect(resolveKeyboardInset({ ...base, visualHeight: Number.NaN })).toBeGreaterThanOrEqual(0);
  });

  it('rounds fractional pixels', () => {
    expect(resolveKeyboardInset({ ...base, visualHeight: 507.6 })).toBe(336);
  });
});

describe('resolveKeyboardInset — native (Capacitor iOS) path', () => {
  const base = { layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0 };

  it('uses the native keyboard height', () => {
    expect(resolveKeyboardInset({ ...base, nativeKeyboardHeight: 336 })).toBe(336);
  });

  it('is 0 when the keyboard is hidden', () => {
    expect(resolveKeyboardInset({ ...base, nativeKeyboardHeight: 0 })).toBe(0);
  });

  it('accounts for a pan', () => {
    expect(resolveKeyboardInset({ ...base, nativeKeyboardHeight: 336, visualOffsetTop: 36 })).toBe(300);
  });

  it('does not apply the web threshold to native heights', () => {
    expect(resolveKeyboardInset({ ...base, nativeKeyboardHeight: 40 })).toBe(40);
  });
});

describe('computeRevealDelta', () => {
  const base = { containerTop: 0, containerBottom: 844, layoutHeight: 844, inset: 336, margin: 16 };

  it('does nothing when the field is already visible above the keyboard', () => {
    expect(computeRevealDelta({ ...base, elTop: 200, elBottom: 252 })).toBe(0);
  });

  it('scrolls a field hidden under the keyboard to the middle of the visible part', () => {
    // visible part = 0..508, centre 254; field centre = 626 → scroll by 372
    expect(computeRevealDelta({ ...base, elTop: 600, elBottom: 652 })).toBe(372);
  });

  it('scrolls back (negative) for a field above the container view', () => {
    expect(computeRevealDelta({ ...base, containerTop: 100, elTop: 40, elBottom: 92 })).toBeLessThan(0);
  });

  it('treats a field touching the keyboard edge (inside the margin) as hidden', () => {
    expect(computeRevealDelta({ ...base, elTop: 450, elBottom: 500 })).not.toBe(0);
  });

  it('top-aligns a field taller than the visible area', () => {
    expect(computeRevealDelta({ ...base, elTop: 300, elBottom: 900 })).toBe(300 - 16);
  });

  it('returns 0 when the container is entirely under the keyboard', () => {
    expect(computeRevealDelta({ ...base, containerTop: 600, elTop: 700, elBottom: 740 })).toBe(0);
  });

  it('with no keyboard, only reveals fields outside the container', () => {
    expect(computeRevealDelta({ ...base, inset: 0, elTop: 600, elBottom: 652 })).toBe(0);
  });
});

describe('opensKeyboard', () => {
  it('text-like inputs and textareas open the keyboard', () => {
    expect(opensKeyboard('input', 'text', false)).toBe(true);
    expect(opensKeyboard('INPUT', null, false)).toBe(true);
    expect(opensKeyboard('input', 'search', false)).toBe(true);
    expect(opensKeyboard('input', 'tel', false)).toBe(true);
    expect(opensKeyboard('textarea', null, false)).toBe(true);
    expect(opensKeyboard('div', null, true)).toBe(true);
  });

  it('buttons, toggles, pickers and read-only fields do not', () => {
    expect(opensKeyboard('input', 'checkbox', false)).toBe(false);
    expect(opensKeyboard('input', 'range', false)).toBe(false);
    expect(opensKeyboard('button', null, false)).toBe(false);
    expect(opensKeyboard('input', 'text', false, true)).toBe(false);
    expect(opensKeyboard('div', null, false)).toBe(false);
  });
});

describe('insetChangeNeedsReveal', () => {
  it('reveals when the keyboard opens', () => {
    expect(insetChangeNeedsReveal(0, 336)).toBe(true);
  });
  it('reveals when an open keyboard grows (number pad → text keyboard, year → name)', () => {
    expect(insetChangeNeedsReveal(260, 336)).toBe(true);
  });
  it('does not move anything when the keyboard shrinks, closes or stays the same', () => {
    expect(insetChangeNeedsReveal(336, 260)).toBe(false);
    expect(insetChangeNeedsReveal(336, 0)).toBe(false);
    expect(insetChangeNeedsReveal(336, 336)).toBe(false);
    expect(insetChangeNeedsReveal(0, 0)).toBe(false);
  });
  it('treats non-finite / negative input as closed', () => {
    expect(insetChangeNeedsReveal(Number.NaN, 300)).toBe(true);
    expect(insetChangeNeedsReveal(-20, 0)).toBe(false);
    expect(insetChangeNeedsReveal(300, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
