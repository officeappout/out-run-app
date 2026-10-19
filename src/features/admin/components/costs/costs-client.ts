/**
 * Client helpers for /admin/costs — authed fetch, ILS / USD formatting, Hebrew labels.
 */
import { auth } from '@/lib/firebase';
import type { Cadence, CostCategory, Currency } from '@/lib/costs/cost-types';

export async function costsFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

const ERRORS: Record<string, string> = {
  load_failed: 'הטעינה נכשלה',
  refresh_failed: 'הרענון נכשל',
  save_failed: 'השמירה נכשלה',
  bad_request: 'נתונים לא תקינים',
  bad_month: 'חודש לא תקין',
  bad_rate: 'שער לא סביר',
  not_found: 'הפריט לא נמצא',
  Unauthorized: 'צריך להתחבר מחדש',
  Forbidden: 'אין הרשאה',
};

export async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === 'string' ? (ERRORS[body.error] ?? body.error) : `שגיאה ${res.status}`;
}

const ils0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const ils2 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 });

/** ₪ — whole shekels from ₪100 up, agorot below. */
export function fmtIls(v: number): string {
  return Math.abs(v) >= 100 ? ils0.format(v) : ils2.format(v);
}

export function fmtMoney(v: number, currency: Currency): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).format(v);
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS_HE[m - 1] ?? month;
  return short ? name.slice(0, 3) : `${name} ${y}`;
}

export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d}.${m}`;
}

export const CADENCE_HE: Record<Cadence, string> = { monthly: 'חודשי', yearly: 'שנתי', one_off: 'חד-פעמי' };

export const CATEGORY_HE: Record<CostCategory, string> = {
  infra: 'תשתית',
  ai: 'AI',
  tools: 'כלים',
  stores: 'חנויות אפליקציות',
  comms: 'תקשורת / SMS',
  domains: 'דומיינים',
  other: 'אחר',
};
