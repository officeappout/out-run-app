import { describe, it, expect } from 'vitest';
import { clipCircle, infoSheetReveal } from '../info-sheet-motion';

describe('infoSheetReveal (board IOrigin)', () => {
  const vp = { width: 390, height: 844 };
  const rect = { left: 220, top: 90, width: 32, height: 32 };

  it('grows from the "i" centre, written from the frame left / bottom edges', () => {
    const m = infoSheetReveal(rect, vp);
    // centre x = 236, from bottom = 844 - 106 = 738
    expect(m.initial).toEqual({ clipPath: 'circle(12px at left 236px bottom 738px)' });
    expect(m.exit).toEqual(m.initial);
    expect(String((m.animate as { clipPath: string }).clipPath)).toMatch(/^circle\(\d+px at left 236px bottom 738px\)$/);
  });

  it('ends with a radius that covers the whole frame (farthest corner)', () => {
    const m = infoSheetReveal(rect, vp);
    const r = Number(/circle\((\d+)px/.exec(String((m.animate as { clipPath: string }).clipPath))![1]);
    expect(r).toBeGreaterThanOrEqual(Math.hypot(236, 844));
  });

  it('runs ~550ms on the sheet curve', () => {
    expect(infoSheetReveal(rect, vp).transition).toEqual({ duration: 0.55, ease: [0.32, 0.72, 0, 1] });
  });

  it('rounds to whole pixels', () => {
    expect(clipCircle(12.4, 10.6, 99.5)).toBe('circle(12px at left 11px bottom 100px)');
  });
});
