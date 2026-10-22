import { describe, it, expect } from 'vitest';
import {
  summarySheetSnaps,
  SUMMARY_COLLAPSED_PX,
  SUMMARY_SAFE_TOP_MARGIN_PX,
} from '../blocks/summary-sheet.util';

describe('summarySheetSnaps — summary drawer snap math', () => {
  it('open = viewport minus the map gap, peek = collapsed px', () => {
    const { snapPoints, initialIndex } = summarySheetSnaps(844, 150);
    expect(snapPoints).toEqual([SUMMARY_COLLAPSED_PX, 694]);
    expect(initialIndex).toBe(1);
  });

  it('history view (gap 0) still keeps a small top margin — never a 0 gap', () => {
    expect(summarySheetSnaps(844, 0).snapPoints[1]).toBe(844 - SUMMARY_SAFE_TOP_MARGIN_PX);
  });

  it('history view (gap 0) clears the notch: full = vh − (safeTop + 8)', () => {
    // iPhone 14-ish: 47px status bar / notch.
    expect(summarySheetSnaps(844, 0, 'full', SUMMARY_COLLAPSED_PX, 47).snapPoints[1]).toBe(844 - 55);
  });

  it('Android edge-to-edge fallback inset (24) also clears the status bar', () => {
    expect(summarySheetSnaps(800, 0, 'full', SUMMARY_COLLAPSED_PX, 24).snapPoints[1]).toBe(800 - 32);
  });

  it('a map peek gap larger than the safe area wins (/map unchanged)', () => {
    expect(summarySheetSnaps(844, 150, 'full', SUMMARY_COLLAPSED_PX, 47).snapPoints[1]).toBe(694);
  });

  it('a safe area larger than the peek gap wins', () => {
    expect(summarySheetSnaps(844, 20, 'full', SUMMARY_COLLAPSED_PX, 59).snapPoints[1]).toBe(844 - 67);
  });

  it('ignores a bad safeTop (NaN / negative) and keeps the margin', () => {
    expect(summarySheetSnaps(844, 0, 'full', SUMMARY_COLLAPSED_PX, Number.NaN).snapPoints[1]).toBe(836);
    expect(summarySheetSnaps(844, 0, 'full', SUMMARY_COLLAPSED_PX, -10).snapPoints[1]).toBe(836);
  });

  it('a taller collapsed peek (history top bar) stays below full', () => {
    const [peek, full] = summarySheetSnaps(844, 0, 'full', SUMMARY_COLLAPSED_PX + 40, 47).snapPoints;
    expect(peek).toBe(SUMMARY_COLLAPSED_PX + 40);
    expect(peek).toBeLessThan(full);
  });

  it("initial 'peek' starts collapsed", () => {
    expect(summarySheetSnaps(844, 150, 'peek').initialIndex).toBe(0);
  });

  it('never lets peek reach or exceed the open height on a tiny viewport', () => {
    const [peek, full] = summarySheetSnaps(300, 150, 'full', 400).snapPoints;
    expect(full).toBe(320);
    expect(peek).toBeLessThan(full);
  });

  it('all snap values are px (> 1) so DraggableSheet never reads them as fractions', () => {
    const [peek, full] = summarySheetSnaps(844, 150, 'full', 0).snapPoints;
    expect(peek).toBeGreaterThan(1);
    expect(full).toBeGreaterThan(1);
  });

  it('falls back to a sane viewport on bad input', () => {
    expect(summarySheetSnaps(Number.NaN, -5).snapPoints[1]).toBe(800 - SUMMARY_SAFE_TOP_MARGIN_PX);
  });
});
