import { describe, it, expect } from 'vitest';
import { summarySheetSnaps, SUMMARY_COLLAPSED_PX } from '../blocks/summary-sheet.util';

describe('summarySheetSnaps — summary drawer snap math', () => {
  it('open = viewport minus the map gap, peek = collapsed px', () => {
    const { snapPoints, initialIndex } = summarySheetSnaps(844, 150);
    expect(snapPoints).toEqual([SUMMARY_COLLAPSED_PX, 694]);
    expect(initialIndex).toBe(1);
  });

  it('history view (gap 0) opens to the full viewport', () => {
    expect(summarySheetSnaps(844, 0).snapPoints[1]).toBe(844);
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
    expect(summarySheetSnaps(Number.NaN, -5).snapPoints[1]).toBe(800);
  });
});
