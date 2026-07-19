/**
 * Finance module — client-side data access (browser).
 * Admin pages fetch financial data through the admin-SDK API routes (never the
 * client Firestore SDK), so these are thin fetch() wrappers. The session cookie
 * authorizes the request (requireAdminApi accepts it).
 */
import type { Transaction } from './transaction.types';

const BASE = '/api/admin/finance/transactions';

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export interface TransactionFilters {
  approval?: 'pending' | 'approved' | 'rejected' | 'all';
  period?: string;
  type?: 'expense' | 'income';
  limit?: number;
}

export async function listTransactions(f: TransactionFilters = {}): Promise<Transaction[]> {
  const q = new URLSearchParams();
  if (f.approval) q.set('approval', f.approval);
  if (f.period) q.set('period', f.period);
  if (f.type) q.set('type', f.type);
  if (f.limit) q.set('limit', String(f.limit));
  const body = await jsonFetch(`${BASE}?${q.toString()}`);
  return body.transactions as Transaction[];
}

export async function createTransaction(data: Partial<Transaction>): Promise<Transaction> {
  const body = await jsonFetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  return body.transaction as Transaction;
}

export async function patchTransaction(
  id: string,
  payload: {
    approval?: 'approved' | 'rejected';
    rejectionReason?: string;
    reviewedBy?: string;
    invoiceNumber?: string;
    patch?: Partial<Transaction>;
  },
): Promise<Transaction> {
  const body = await jsonFetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return body.transaction as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await jsonFetch(`${BASE}/${id}`, { method: 'DELETE' });
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

const SCAN = '/api/admin/finance/scan-invoices';

export interface ScanOptions {
  days?: number;
  after?: string; // YYYY-MM-DD
  before?: string; // YYYY-MM-DD
  capture?: 'off' | 'dry' | 'live';
}

/** Trigger a mailbox scan. capture:'live' writes candidates + needs-review rows. */
export async function runScan(opts: ScanOptions): Promise<any> {
  return jsonFetch(SCAN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
}

export async function getLastScan(): Promise<{ lastScanAt: string | null; writeEnabled: boolean }> {
  return jsonFetch(SCAN);
}

// ─── Accountant packet ────────────────────────────────────────────────────────

/** Generate the monthly XLSX packet → Drive, returns links + summary. */
export async function generatePacket(period: string): Promise<{
  ok: boolean; period: string; count: number; truncated?: boolean;
  xlsxUrl: string | null; monthFolderUrl: string | null;
  summary: { ilsGross: number; ilsNet: number; ilsVat: number; missing: number; foreign: Record<string, number> };
}> {
  return jsonFetch('/api/admin/finance/packet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ period }),
  });
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const CURRENCY_SYMBOL: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€' };

export function fmtMoney(amount: number | null | undefined, currency: string | undefined): string {
  if (amount == null) return '—';
  const sym = CURRENCY_SYMBOL[currency ?? 'ILS'] ?? currency ?? '';
  return `${sym}${amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

export const EXPENSE_CATEGORIES = [
  'תוכנה/כלים', 'פיתוח', 'שיווק', 'הנהלת חשבונות', 'משפטי',
  'הלוואות ומימון', 'נסיעות/כנסים', 'ציוד', 'אחר',
] as const;

export const PAYMENT_METHODS = ['אשראי', 'ספקים', 'חד פעמי', 'הלוואה', 'העברה בנקאית'] as const;

export const PAYMENT_STATUSES = ['שולם', 'נדרש לשלם', 'תשלום עתידי'] as const;

export const CURRENCIES = ['ILS', 'USD', 'EUR'] as const;

export const APPROVAL_LABEL: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
};

export const SOURCE_LABEL: Record<string, string> = {
  email: 'מייל',
  manual: 'ידני',
  bank: 'בנק',
  invoicing_api: 'מערכת חשבוניות',
};
