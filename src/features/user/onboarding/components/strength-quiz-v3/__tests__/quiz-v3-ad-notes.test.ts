// @vitest-environment jsdom
/** Owner notes 30.10: AD6 (card-switch motion model) and AD8 (quiz entry starts at the top). */
import { describe, expect, it, vi } from 'vitest';
import { DRAG_FOLLOW, DRAG_FULL_PX, SIDE_REST, dragLook, lookStyle } from '../carousel-drag';
import { resetEntryScroll } from '../entry-scroll';

describe('AD6 dragLook', () => {
  it('at rest: centre full size, both sides at the resting look, row still', () => {
    const l = dragLook(0, true);
    expect(l.rowX).toBe(0);
    expect(l.center).toEqual({ scale: 1, opacity: 1 });
    expect(l.easier).toEqual(SIDE_REST);
    expect(l.harder).toEqual(SIDE_REST);
  });

  it('RTL, finger toward the start (right): harder grows to full, centre shrinks and fades', () => {
    const l = dragLook(DRAG_FULL_PX, true);
    expect(l.harder).toEqual({ scale: 1, opacity: 1 });
    expect(l.center).toEqual({ scale: 0.9, opacity: 0.75 });
    expect(l.easier.scale).toBeLessThan(SIDE_REST.scale);
    expect(l.rowX).toBe(DRAG_FULL_PX * DRAG_FOLLOW);
  });

  it('RTL, finger toward the end (left) brings the easier card in; LTR mirrors it', () => {
    expect(dragLook(-DRAG_FULL_PX, true).easier.scale).toBe(1);
    expect(dragLook(DRAG_FULL_PX, false).easier.scale).toBe(1);
    expect(dragLook(-DRAG_FULL_PX, false).harder.scale).toBe(1);
  });

  it('is tied to the distance and stops at the full look', () => {
    const half = dragLook(DRAG_FULL_PX / 2, true);
    expect(half.center.scale).toBeCloseTo(0.95);
    expect(half.harder.scale).toBeCloseTo((SIDE_REST.scale + 1) / 2);
    expect(dragLook(DRAG_FULL_PX * 3, true).center).toEqual({ scale: 0.9, opacity: 0.75 });
  });

  it('lookStyle writes transform and opacity', () => {
    expect(lookStyle({ scale: 0.9, opacity: 0.75 })).toEqual({ transform: 'scale(0.9)', opacity: '0.75' });
  });
});

describe('AD8 resetEntryScroll', () => {
  it('scrolls <main> and the window back to the top', () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    document.body.appendChild(main);
    main.scrollTop = 47;
    Object.defineProperty(window, 'scrollY', { value: 30, configurable: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    resetEntryScroll(document, window);
    expect(main.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    main.remove();
  });

  it('does nothing when already at the top', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    scrollTo.mockClear();
    resetEntryScroll(document, window);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
