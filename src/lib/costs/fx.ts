/**
 * Currency conversion to ILS — pure.
 *
 * Each month doc stores the rate it was summed with (admin_costs/{month}.fx), so a past month
 * never changes when the shekel moves. Precedence: a manual rate the owner typed > the rate the
 * daily refresh fetched from Frankfurter (ECB reference rates, free, no key —
 * https://api.frankfurter.dev/v2/rate/USD/ILS) > DEFAULT_FX below.
 */
import type { Currency, FxRates, MonthFx } from './cost-types';

/** Fallback only (ECB reference 19.10.2026: USD 3.0973, EUR 3.4813). */
export const DEFAULT_FX: FxRates = { USD: 3.1, EUR: 3.48 };

export function isSaneRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0.5 && v < 20;
}

export function toIls(amount: number, currency: Currency, fx: FxRates): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === 'ILS') return amount;
  const rate = isSaneRate(fx[currency]) ? fx[currency] : DEFAULT_FX[currency];
  return amount * rate;
}

/** The rates a month is summed with. `stored` is admin_costs/{month}.fx (may be absent). */
export function resolveMonthFx(stored: Partial<MonthFx> | undefined | null): MonthFx {
  if (stored && isSaneRate(stored.USD) && isSaneRate(stored.EUR)) {
    return {
      USD: stored.USD,
      EUR: stored.EUR,
      source: stored.source === 'manual' || stored.source === 'frankfurter' ? stored.source : 'default',
      ...(typeof stored.updatedAtMs === 'number' ? { updatedAtMs: stored.updatedAtMs } : {}),
    };
  }
  return { ...DEFAULT_FX, source: 'default' };
}

/** A fetched rate never overwrites one the owner typed by hand. */
export function mergeFetchedFx(stored: Partial<MonthFx> | undefined | null, fetched: FxRates, nowMs: number): MonthFx | null {
  if (stored?.source === 'manual') return null;
  if (!isSaneRate(fetched.USD) || !isSaneRate(fetched.EUR)) return null;
  return { USD: fetched.USD, EUR: fetched.EUR, source: 'frankfurter', updatedAtMs: nowMs };
}

/** Parses Frankfurter's `/v2/rate/{base}/ILS` body: { date, base, quote, rate }. */
export function parseFrankfurterRate(body: unknown): number | null {
  const rate = (body as { rate?: unknown } | null)?.rate;
  const quote = (body as { quote?: unknown } | null)?.quote;
  if (quote !== undefined && quote !== 'ILS') return null;
  return isSaneRate(rate) ? rate : null;
}

export function roundIls(v: number): number {
  return Math.round(v * 100) / 100;
}
