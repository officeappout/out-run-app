import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';

/**
 * Numbers in catalog params go through Intl with the user's locale (digits,
 * decimal separator). `km` / `gapKm` keep a fixed number of decimals; every
 * other number is formatted as is. Strings (e.g. a "5:30" pace) pass through.
 */
const FIXED: Record<string, number> = { km: 1, gapKm: 2 };

export function localizeParams(params: Record<string, string | number>, locale: Locale, fixed: Record<string, number> = FIXED): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    // `n` is the ICU plural/select selector — it must stay a number.
    if (k === 'n' || typeof v !== 'number' || !Number.isFinite(v)) { out[k] = v; continue; }
    const d = fixed[k];
    out[k] = formatNumber(v, locale, d != null ? { minimumFractionDigits: d, maximumFractionDigits: d } : undefined);
  }
  return out;
}
