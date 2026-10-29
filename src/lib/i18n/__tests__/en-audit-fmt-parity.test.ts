import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from '../core/fmt';

/** English audit: call sites that hard-coded 'he-IL' now pass the UI locale; Hebrew output is identical. */
describe('he-IL call sites moved to the locale formatters', () => {
  it('download percent (OverviewMoreMenu)', () => {
    for (const v of [0, 0.37, 1]) {
      expect(formatNumber(v, 'he', { style: 'percent' })).toBe(new Intl.NumberFormat('he-IL', { style: 'percent' }).format(v));
    }
    expect(formatNumber(0.5, 'en', { style: 'percent' })).toBe('50%');
  });
  it('scheduled share date (FreeRunDrawer)', () => {
    const d = new Date(2026, 9, 29);
    const opts = { day: '2-digit', month: '2-digit' } as const;
    expect(formatDate(d, 'he', opts)).toBe(new Intl.DateTimeFormat('he-IL', opts).format(d));
    expect(formatDate(d, 'en', opts)).toBe('10/29');
  });
});
