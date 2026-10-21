import { describe, it, expect } from 'vitest';
import {
  APP_MAIN_NAV_RESERVE_CSS,
  V2_FAB_BOTTOM_CSS,
  V2_FAB_SIZE,
  V2_NAV_BOTTOM_CSS,
  V2_NAV_HEIGHT,
  appMainNavReservePx,
  fabBottomPx,
  navBottomPx,
  navStackTopPx,
  scrollEndClearancePx,
  scrollEndPaddingCss,
  stickyFooterPaddingPx,
} from '../bottom-chrome';

// iPhone 13: 34px home indicator; browsers / emulators without a notch: 0.
const INSETS = [0, 20, 34, 48];

describe('bottom-chrome — v2 floating nav / FAB / scroll end', () => {
  it('nav pill: never closer than 8px to the edge, tucks 10px into the safe area', () => {
    expect(navBottomPx(0)).toBe(8);
    expect(navBottomPx(34)).toBe(24);
    expect(V2_NAV_BOTTOM_CSS).toBe('max(8px, calc(env(safe-area-inset-bottom, 0px) - 10px))');
  });

  it('the stack top includes the raised map circle above the pill', () => {
    for (const s of INSETS) {
      expect(navStackTopPx(s)).toBeGreaterThan(navBottomPx(s) + V2_NAV_HEIGHT);
    }
    expect(navStackTopPx(34)).toBe(24 + 58 + 21);
  });

  it('the FAB floats above the whole nav stack (never over the tabs or the map circle)', () => {
    for (const s of INSETS) {
      expect(fabBottomPx(s)).toBeGreaterThan(navStackTopPx(s));
    }
    expect(V2_FAB_BOTTOM_CSS).toBe(`calc(${V2_NAV_BOTTOM_CSS} + 95px)`);
  });

  it('scroll end clears the FAB when there is one, else the nav stack', () => {
    for (const s of INSETS) {
      expect(scrollEndClearancePx(s, { fab: true })).toBeGreaterThan(fabBottomPx(s) + V2_FAB_SIZE);
      expect(scrollEndClearancePx(s, { fab: false })).toBeGreaterThan(navStackTopPx(s));
      expect(scrollEndClearancePx(s, { fab: false })).toBeLessThan(scrollEndClearancePx(s, { fab: true }));
    }
  });

  it('the page padding + what <main> already reserves = the clearance', () => {
    // scrollEndPaddingCss is the CSS of: navBottom + extra - reserve. Re-evaluate it in px.
    const css = scrollEndPaddingCss({ fab: true, reservedCss: APP_MAIN_NAV_RESERVE_CSS });
    const extra = Number(css.match(/\+ (\d+)px - /)![1]);
    for (const s of INSETS) {
      const padding = Math.max(0, navBottomPx(s) + extra - appMainNavReservePx(s));
      expect(padding + appMainNavReservePx(s)).toBe(scrollEndClearancePx(s, { fab: true }));
    }
    expect(css).toContain(`- (${APP_MAIN_NAV_RESERVE_CSS})`);
    expect(css.startsWith('max(0px, calc(')).toBe(true);
  });

  it('without a reserve the padding is the full clearance', () => {
    const css = scrollEndPaddingCss({ fab: false });
    expect(css).toBe(`max(0px, calc(${V2_NAV_BOTTOM_CSS} + 95px))`);
    expect(navBottomPx(34) + 95).toBe(scrollEndClearancePx(34, { fab: false }));
  });

  it('sticky footer padding: measured height + gap, static minimum until measured', () => {
    expect(stickyFooterPaddingPx(null)).toBe(144);
    expect(stickyFooterPaddingPx(0)).toBe(144);
    expect(stickyFooterPaddingPx(Number.NaN)).toBe(144);
    expect(stickyFooterPaddingPx(100)).toBe(144);
    expect(stickyFooterPaddingPx(171.4)).toBe(188);
    expect(stickyFooterPaddingPx(80, 60)).toBe(96);
  });
});
