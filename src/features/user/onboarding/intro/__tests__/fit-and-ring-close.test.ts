import { describe, it, expect } from 'vitest';
import { CANVAS_CONTENT_H, CANVAS_FIT_W, CANVAS_MAX_SCALE, fitCanvasScale } from '../canvas-fit';
import {
  RING_CLOSE_BEATS as B, RING_CLOSE_GUTTER, RING_CLOSE_SPAN, SLOT_WAIT_S, popDelay, ringClosePlan, ringCloseScale,
} from '../ring-close-timeline';

/** Box above the CTA bar: viewport − safe-area top − bar (clamp(104, 17dvh, 150) + safe bottom). */
function boxFor(w: number, h: number, safeTop: number, safeBottom: number) {
  const bar = Math.min(150, Math.max(104, 0.17 * h)) + safeBottom;
  return { w, h: h - safeTop - bar };
}

describe('intro canvas fits every phone (owner note 21.10 #1 — never scroll)', () => {
  const phones = [
    ['iPhone SE', 375, 667, 20, 0],
    ['iPhone 13', 390, 844, 47, 34],
    ['iPhone 15 Pro Max', 430, 932, 59, 34],
    ['Android small', 360, 640, 24, 0],
    ['Android tall', 412, 800, 24, 16],
  ] as const;
  it.each(phones)('%s: the content zone fits above the CTA bar and inside the width', (_n, w, h, top, bottom) => {
    const box = boxFor(w, h, top, bottom);
    const s = fitCanvasScale(box.w, box.h);
    expect(s).toBeGreaterThan(0.6);
    expect(CANVAS_CONTENT_H * s).toBeLessThanOrEqual(box.h + 1e-6);
    expect(CANVAS_FIT_W * s).toBeLessThanOrEqual(box.w + 1e-6);
  });
  it('caps the scale on big screens and returns 0 for an unmeasured box', () => {
    expect(fitCanvasScale(2000, 3000)).toBe(CANVAS_MAX_SCALE);
    expect(fitCanvasScale(0, 800)).toBe(0);
  });
});

describe('ring-close timeline (owner note 21.10 #4)', () => {
  it('slot already there: rises the instant the logo is formed, veil lifts mid-flight', () => {
    const p = ringClosePlan(0.2);
    expect(p.riseStart).toBe(B.riseAt);
    expect(p.landAt).toBeCloseTo(B.riseAt + B.riseS);
    expect(p.veilStart).toBeGreaterThan(p.riseStart);
    expect(p.veilStart).toBeLessThan(p.landAt);
    expect(p.doneAt).toBe(Math.max(p.landAt, p.veilEnd));
  });
  it('slot appears late: the logo rises the moment it does, the veil never before it', () => {
    const p = ringClosePlan(B.riseAt + 1.2);
    expect(p.riseStart).toBeCloseTo(B.riseAt + 1.2);
    expect(p.veilStart).toBeGreaterThan(B.riseAt + 1.2);
  });
  it('slot never found: the veil waits for the landing', () => {
    const p = ringClosePlan(null);
    expect(p.veilStart).toBeCloseTo(p.landAt - B.veilLeadS);
  });
  it('AF2: one continuous build, no beat waits on a gap', () => {
    const lastPopEnd = popDelay(4) + B.popS;
    // the ring closes as the last segment lands, condenses as it closes, rises as it is formed
    expect(Math.abs(B.closeAt - lastPopEnd)).toBeLessThanOrEqual(0.1);
    expect(B.crossfadeAt).toBeCloseTo(B.closeAt + B.closeS);
    expect(B.riseAt).toBe(B.crossfadeEnd);
    // the happy path is over well before the old 4.6 s
    expect(ringClosePlan(0).doneAt).toBeLessThan(3.5);
  });
  it('never waits longer than SLOT_WAIT_S', () => {
    expect(ringClosePlan(null).riseStart).toBe(B.riseAt + SLOT_WAIT_S);
    expect(ringClosePlan(99).riseStart).toBe(B.riseAt + SLOT_WAIT_S);
  });
  it('ring + labels stay on screen on narrow phones', () => {
    for (const w of [320, 360, 375, 390, 430]) {
      const k = ringCloseScale(w);
      expect(RING_CLOSE_SPAN * k).toBeLessThanOrEqual(w - 2 * RING_CLOSE_GUTTER + 1e-6);
      expect(k).toBeLessThanOrEqual(1);
    }
    expect(ringCloseScale(1200)).toBe(1);
  });
});
