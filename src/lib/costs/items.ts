/**
 * Manual / fixed subscriptions — what each one charges in a month, and when it renews. Pure.
 *
 *   monthly  — charged every month from startDate's month until endDate's month (inclusive)
 *   yearly   — charged once a year, in the month of the renewal anchor (renewalDate ?? startDate)
 *   one_off  — charged once, in startDate's month
 *
 * A deactivated item keeps its history: deactivating sets active=false + endDate, and months up
 * to endDate are still counted.
 */
import type { CostItem } from './cost-types';
import { isDayKey } from './month';

function anchorOf(item: Pick<CostItem, 'startDate' | 'renewalDate'>): string {
  return isDayKey(item.renewalDate) ? item.renewalDate : item.startDate;
}

/** Is the item live at any point of `month`? */
export function isLiveInMonth(item: Pick<CostItem, 'startDate' | 'endDate' | 'active'>, month: string): boolean {
  if (!isDayKey(item.startDate) || item.startDate.slice(0, 7) > month) return false;
  if (isDayKey(item.endDate)) return item.endDate.slice(0, 7) >= month;
  // Deactivated without an end date (legacy / hand-edited): treat as ended — never over-count.
  return item.active !== false;
}

/** Amount charged in `month`, in the item's own currency. */
export function itemChargeInMonth(item: CostItem, month: string): number {
  if (!(item.amount > 0) || !isLiveInMonth(item, month)) return 0;
  switch (item.cadence) {
    case 'monthly':
      return item.amount;
    case 'yearly':
      return anchorOf(item).slice(5, 7) === month.slice(5, 7) ? item.amount : 0;
    case 'one_off':
      return item.startDate.slice(0, 7) === month ? item.amount : 0;
    default:
      return 0;
  }
}

function clampDay(year: number, monthIdx0: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${year}-${String(monthIdx0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Next charge date on/after `today` ('YYYY-MM-DD'), or null (one-off, inactive, ended). */
export function nextRenewal(item: CostItem, today: string): string | null {
  if (item.active === false || item.cadence === 'one_off') return null;
  const anchor = anchorOf(item);
  if (!isDayKey(anchor)) return null;
  if (anchor >= today) return anchor;
  const [ty, tm] = today.split('-').map(Number);
  const day = Number(anchor.slice(8, 10));
  let candidate: string;
  if (item.cadence === 'monthly') {
    candidate = clampDay(ty, tm - 1, day);
    if (candidate < today) candidate = clampDay(tm === 12 ? ty + 1 : ty, tm % 12, day);
  } else {
    const am = Number(anchor.slice(5, 7)) - 1;
    candidate = clampDay(ty, am, day);
    if (candidate < today) candidate = clampDay(ty + 1, am, day);
  }
  if (isDayKey(item.endDate) && candidate > item.endDate) return null;
  return candidate;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface UpcomingRenewal {
  item: CostItem;
  date: string;
  inDays: number;
}

/** Renewals within `windowDays` of today, soonest first. */
export function upcomingRenewals(items: CostItem[], today: string, windowDays = 30): UpcomingRenewal[] {
  const out: UpcomingRenewal[] = [];
  for (const item of items) {
    const date = nextRenewal(item, today);
    if (!date) continue;
    const inDays = dayDiff(today, date);
    if (inDays >= 0 && inDays <= windowDays) out.push({ item, date, inDays });
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.item.name.localeCompare(b.item.name));
}
