/**
 * Admin "עלויות" (costs) dashboard — shared types. Client-safe (no secrets, no SDKs).
 *
 * Firestore (Admin SDK only — firestore.rules denies every client):
 *   admin_costs/{yyyy-mm}       one doc per month: FX rates + one cached snapshot per connector
 *   admin_cost_items/{id}       manual / fixed subscriptions (Workspace, Apple Developer, …)
 */

export const ADMIN_COSTS_COLLECTION = 'admin_costs';
export const ADMIN_COST_ITEMS_COLLECTION = 'admin_cost_items';

export type Currency = 'ILS' | 'USD' | 'EUR';
export const CURRENCIES: readonly Currency[] = ['ILS', 'USD', 'EUR'];

export type Cadence = 'monthly' | 'yearly' | 'one_off';
export const CADENCES: readonly Cadence[] = ['monthly', 'yearly', 'one_off'];

export type CostCategory = 'infra' | 'ai' | 'tools' | 'stores' | 'comms' | 'domains' | 'other';
export const COST_CATEGORIES: readonly CostCategory[] = ['infra', 'ai', 'tools', 'stores', 'comms', 'domains', 'other'];

/** Vendors that have (or may have) an automatic connector. Manual items use them too, so a
 *  manual "Vercel Pro" item is recognised as covered once the Vercel connector reports. */
export type VendorKey = 'anthropic' | 'gcp' | 'vercel' | 'bunny' | 'github' | 'mapbox';

export type ConnectorId = 'ai_ledger' | 'anthropic_admin' | 'gcp_billing' | 'vercel' | 'bunny' | 'github' | 'mapbox';

/** ILS per 1 unit of the currency. */
export interface FxRates {
  USD: number;
  EUR: number;
}

export interface MonthFx extends FxRates {
  source: 'manual' | 'frankfurter' | 'default';
  /** ms epoch */
  updatedAtMs?: number;
}

export interface BreakdownLine {
  label: string;
  amount: number;
}

export type ConnectorStatus = 'ok' | 'not_configured' | 'error' | 'manual';

/** What one connector stored for one month (admin_costs/{month}.connectors.{id}). */
export interface ConnectorSnapshot {
  status: ConnectorStatus;
  /** month-to-date (or full month when the month is over), in `currency` */
  amount: number;
  currency: Currency;
  breakdown: BreakdownLine[];
  fetchedAtMs: number;
  /** short, non-secret error code of the LAST refresh (the amounts above may be from an earlier good one) */
  error?: string;
  errorAtMs?: number;
}

export interface MonthDoc {
  month: string;
  fx?: MonthFx;
  connectors?: Partial<Record<ConnectorId, ConnectorSnapshot>>;
}

export interface CostItem {
  id: string;
  name: string;
  vendor: string;
  /** optional link to a connector vendor (avoids double counting) */
  vendorKey?: VendorKey | null;
  amount: number;
  currency: Currency;
  cadence: Cadence;
  /** 'YYYY-MM-DD' */
  startDate: string;
  /** 'YYYY-MM-DD' — anchor for yearly renewals; defaults to startDate */
  renewalDate?: string | null;
  /** 'YYYY-MM-DD' — set when deactivated; months after it are not charged */
  endDate?: string | null;
  category: CostCategory;
  notes?: string;
  active: boolean;
}
