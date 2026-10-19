import { describe, expect, it } from 'vitest';
import { isLiveInMonth, itemChargeInMonth, nextRenewal, upcomingRenewals } from '../items';
import { DEFAULT_FX, mergeFetchedFx, parseFrankfurterRate, resolveMonthFx, toIls } from '../fx';
import { dayKeysOfMonth, daysInMonth, lastMonths, monthProgress, shiftMonth } from '../month';
import { parseCostItem, CostItemInputSchema } from '../item-schema';
import { mergeOutcome, safeErrorCode } from '../refresh-logic';
import type { CostItem } from '../cost-types';

const item = (over: Partial<CostItem>): CostItem => ({
  id: 'x', name: 'n', vendor: '', amount: 10, currency: 'USD', cadence: 'monthly',
  startDate: '2026-03-15', category: 'other', active: true, ...over,
});

describe('month keys', () => {
  it('shift / lastMonths across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
  it('days, progress', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(dayKeysOfMonth('2026-10', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(monthProgress('2026-10', '2026-10-19')).toEqual({ elapsedDays: 19, totalDays: 31, isCurrent: true });
    expect(monthProgress('2026-09', '2026-10-19').isCurrent).toBe(false);
  });
});

describe('itemChargeInMonth', () => {
  it('monthly from start month until end month', () => {
    const i = item({ endDate: '2026-06-02', active: false });
    expect(itemChargeInMonth(i, '2026-02')).toBe(0);
    expect(itemChargeInMonth(i, '2026-03')).toBe(10);
    expect(itemChargeInMonth(i, '2026-06')).toBe(10);
    expect(itemChargeInMonth(i, '2026-07')).toBe(0);
  });
  it('yearly in the anchor month only (renewalDate wins over startDate)', () => {
    const i = item({ cadence: 'yearly', amount: 99, renewalDate: '2026-11-01' });
    expect(itemChargeInMonth(i, '2026-11')).toBe(99);
    expect(itemChargeInMonth(i, '2027-11')).toBe(99);
    expect(itemChargeInMonth(i, '2026-03')).toBe(0);
  });
  it('one-off only in its start month', () => {
    const i = item({ cadence: 'one_off', amount: 25 });
    expect(itemChargeInMonth(i, '2026-03')).toBe(25);
    expect(itemChargeInMonth(i, '2026-04')).toBe(0);
  });
  it('inactive without endDate never counts (no over-count)', () => {
    expect(isLiveInMonth(item({ active: false }), '2026-04')).toBe(false);
  });
});

describe('renewals', () => {
  it('monthly: next day-of-month, clamped to short months', () => {
    expect(nextRenewal(item({ startDate: '2026-01-31' }), '2026-02-10')).toBe('2026-02-28');
    expect(nextRenewal(item({ startDate: '2026-01-05' }), '2026-02-10')).toBe('2026-03-05');
  });
  it('yearly: next anniversary; one-off and inactive: none', () => {
    expect(nextRenewal(item({ cadence: 'yearly', startDate: '2025-11-01' }), '2026-10-19')).toBe('2026-11-01');
    expect(nextRenewal(item({ cadence: 'yearly', startDate: '2025-03-01' }), '2026-10-19')).toBe('2027-03-01');
    expect(nextRenewal(item({ cadence: 'one_off' }), '2026-01-01')).toBeNull();
    expect(nextRenewal(item({ active: false }), '2026-01-01')).toBeNull();
  });
  it('upcoming within 30 days, soonest first', () => {
    const list = upcomingRenewals(
      [
        item({ id: 'a', name: 'Apple', cadence: 'yearly', startDate: '2025-11-10' }),
        item({ id: 'b', name: 'Workspace', startDate: '2026-01-25' }),
        item({ id: 'c', name: 'Far', cadence: 'yearly', startDate: '2025-12-31' }),
      ],
      '2026-10-19',
    );
    expect(list.map((r) => [r.item.id, r.inDays])).toEqual([['b', 6], ['a', 22]]);
  });
});

describe('fx', () => {
  it('toIls with fallback on a broken rate', () => {
    expect(toIls(10, 'ILS', DEFAULT_FX)).toBe(10);
    expect(toIls(10, 'USD', { USD: 3.5, EUR: 4 })).toBe(35);
    expect(toIls(10, 'USD', { USD: NaN, EUR: 4 })).toBeCloseTo(10 * DEFAULT_FX.USD);
  });
  it('resolveMonthFx: stored sane → stored, else default', () => {
    expect(resolveMonthFx({ USD: 3.6, EUR: 3.9, source: 'manual' }).source).toBe('manual');
    expect(resolveMonthFx({ USD: 0, EUR: 3.9 }).source).toBe('default');
    expect(resolveMonthFx(undefined)).toMatchObject({ ...DEFAULT_FX, source: 'default' });
  });
  it('a fetched rate never overwrites a manual one', () => {
    expect(mergeFetchedFx({ USD: 3.6, EUR: 3.9, source: 'manual' }, { USD: 3.1, EUR: 3.5 }, 1)).toBeNull();
    expect(mergeFetchedFx(undefined, { USD: 3.1, EUR: 3.5 }, 1)).toEqual({ USD: 3.1, EUR: 3.5, source: 'frankfurter', updatedAtMs: 1 });
  });
  it('parses Frankfurter /v2/rate (recorded 19.10.2026)', () => {
    expect(parseFrankfurterRate({ date: '2026-10-19', base: 'USD', quote: 'ILS', rate: 3.0973 })).toBe(3.0973);
    expect(parseFrankfurterRate({ quote: 'EUR', rate: 0.9 })).toBeNull();
    expect(parseFrankfurterRate(null)).toBeNull();
  });
});

describe('item schema', () => {
  it('accepts a valid item and rejects unknown fields / bad dates', () => {
    const ok = { name: 'Apple Developer', vendor: 'Apple', amount: 99, currency: 'USD', cadence: 'yearly', startDate: '2026-01-10', category: 'stores' };
    expect(CostItemInputSchema.safeParse(ok).success).toBe(true);
    expect(CostItemInputSchema.safeParse({ ...ok, active: false, hack: 1 }).success).toBe(false);
    expect(CostItemInputSchema.safeParse({ ...ok, startDate: '2026-13-01' }).success).toBe(false);
    expect(CostItemInputSchema.safeParse({ ...ok, amount: -5 }).success).toBe(false);
  });
  it('parseCostItem guards fields', () => {
    expect(parseCostItem('a', { amount: 'x' })).toBeNull();
    expect(parseCostItem('a', { name: 'W', amount: 150, currency: 'ILS', cadence: 'monthly', startDate: '2026-01-01', category: 'zzz' })).toMatchObject({ category: 'other', active: true, vendorKey: null });
  });
});

describe('refresh merge', () => {
  const good = { status: 'ok' as const, amount: 5, currency: 'USD' as const, breakdown: [], fetchedAtMs: 1 };
  it('an error keeps the last good amount and marks it', () => {
    expect(mergeOutcome(good, { status: 'error', error: 'http_500' }, 9)).toMatchObject({ status: 'ok', amount: 5, error: 'http_500', errorAtMs: 9 });
  });
  it('a recovery clears the error', () => {
    const next = mergeOutcome({ ...good, error: 'x', errorAtMs: 2 }, { ...good, amount: 7, fetchedAtMs: 10 }, 10)!;
    expect(next.error).toBeUndefined();
    expect(next.amount).toBe(7);
  });
  it('keep / not_configured over good data → no write', () => {
    expect(mergeOutcome(good, 'keep', 1)).toBeNull();
    expect(mergeOutcome(good, { status: 'not_configured' }, 1)).toBeNull();
    expect(mergeOutcome(undefined, { status: 'not_configured' }, 1)?.status).toBe('not_configured');
  });
  it('safeErrorCode never leaks free text', () => {
    expect(safeErrorCode({ code: 'http_403' })).toBe('http_403');
    expect(safeErrorCode(new Error('Bearer sk-secret failed'))).toBe('fetch_failed');
    expect(safeErrorCode({ name: 'TimeoutError' })).toBe('timeout');
  });
});
