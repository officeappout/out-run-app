/**
 * Finance module — Drive folder targets (spec §6).
 * IDs supplied by David; the folders already exist. Kept as constants here the
 * same way `AUTHORITIES_ROOT_FOLDER_ID` lives in google-service-account.ts.
 *
 * Monthly subfolders under EXPENSES (`הוצאות/YYYY-MM`) are created on demand by
 * the scanner (live mode only) — see getOrCreateMonthFolder in the scan route.
 */

export const FINANCE_ROOT_FOLDER_ID = '1cpYQWPEhl7z1aaPTvrd1-Wk5LS8Jus6z';            // 06 — פיננסי
export const FINANCE_EXPENSES_FOLDER_ID = '1fsTgjjFICkNc8edQaYnNPDWvSSp6crWN';        // הוצאות
export const FINANCE_EXPENSES_2026_07_FOLDER_ID = '1ad0TTiQq2C0gNIoWfMVieDavXFqFX_2F'; // הוצאות/2026-07 (seed month)
export const FINANCE_ACCOUNTANT_PACKETS_FOLDER_ID = '1HBrLSNsf12Z2wH-AfwfcCW_8p3sz7gT7'; // ריכוזים-לרואה-חשבון
export const FINANCE_INCOME_FOLDER_ID = '1t4ihdQQHtYnbZ2yMatRVcDseX0dzPd8T';          // הכנסות (עתידי)
export const FINANCE_TRACKER_FOLDER_ID = '1PiH4gmC478jlzueFLXmVA2gsuxMV13B5';         // טבלת-מעקב

/** Drive path (for dry-run previews / logs) of the month subfolder under הוצאות. */
export function expensesMonthPath(period: string): string {
  return `06 — פיננסי/הוצאות/${period}`;
}

/**
 * Stored-invoice filename convention (§4 step 4): `YYYY-MM-DD__ספק__סכום.pdf`.
 * Slashes / control chars are stripped so the name is Drive-safe.
 */
export function invoiceFileName(args: {
  dateISO: string | null;
  vendorName: string;
  amountGross: number | null;
  currency: string;
  originalExt: string;
}): string {
  const date = args.dateISO ?? 'unknown-date';
  const vendor = sanitizeSegment(args.vendorName);
  const amount =
    args.amountGross != null ? `${args.amountGross}${currencySuffix(args.currency)}` : 'unknown-amount';
  const ext = args.originalExt.replace(/^\./, '') || 'pdf';
  return `${date}__${vendor}__${amount}.${ext}`;
}

function currencySuffix(currency: string): string {
  return currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
}

function sanitizeSegment(s: string): string {
  return s.replace(/[\\/\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
