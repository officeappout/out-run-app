/**
 * Finance module — Transaction model (source of truth).
 * Spec: מודול כספים §1 + David's Phase-0 requirements.
 *
 * ONE flexible model for BOTH expenses and income (a "movement"), so income
 * wires in at Phase 2 with no schema rewrite. Phase 1 only ever writes
 * type='expense'.
 *
 * Collection: `transactions` (server-owned). Every row the scanner captures
 * starts `approval='pending'` — a human approves before it counts, mirroring
 * the "drafts for approval" philosophy of the CRM agent.
 *
 * Timestamp is imported as a *type only* (erased at compile) so this file stays
 * client-safe — no firebase-admin / firebase runtime pulled into any bundle.
 */
import type { Timestamp } from 'firebase/firestore';

// ─── Shared enums (also imported by finance-vendors.seed.ts) ──────────────────

export type TransactionType = 'expense' | 'income';
export type TransactionDirection = 'out' | 'in';

/** חו"ל: יש הוצאות ב-EUR/USD (כנס גרמניה) — שומרים מטבע + סכום מקורי. */
export type Currency = 'ILS' | 'EUR' | 'USD';

/** Business-domain classification (§2) — the lens for expense cross-cuts. */
export type ExpenseCategory =
  | 'תוכנה/כלים'
  | 'פיתוח'
  | 'שיווק'
  | 'הנהלת חשבונות'
  | 'משפטי'
  | 'הלוואות ומימון'
  | 'נסיעות/כנסים'
  | 'ציוד'
  | 'אחר';

export type PaymentMethod =
  | 'אשראי'
  | 'ספקים'
  | 'חד פעמי'
  | 'הלוואה'
  | 'העברה בנקאית';

/**
 * Optimization lens (David §Q1): `fixed` subscriptions to audit for waste,
 * `variable` spend to rein in, `human_supplier` to re-price. Denormalized onto
 * each transaction so the optimization reports survive a later vendor edit.
 */
export type ExpenseNature = 'fixed' | 'variable' | 'human_supplier';

export type PaymentStatus = 'שולם' | 'נדרש לשלם' | 'תשלום עתידי';

export type TransactionSource = 'email' | 'manual' | 'bank' | 'invoicing_api';

export type ApprovalState = 'pending' | 'approved' | 'rejected';

/** Mirrors the old tracker's "עלה החשבונית" column. */
export type InvoiceStatus = 'הועלה' | 'ממתין' | 'חסר';

export interface TransactionInvoice {
  status: InvoiceStatus;
  driveFileId?: string;
  driveUrl?: string;
  invoiceNumber?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Derived from `type`: expense→out, income→in. See directionForType(). */
  direction: TransactionDirection;

  vendorOrClient: string;
  /** Links back to finance_vendors/{id} when the scanner matched a vendor. */
  vendorId?: string;
  category: ExpenseCategory;
  title: string;

  // ── Money ──
  currency: Currency;
  /** Total incl. VAT, in `currency`. */
  amountGross: number;
  /** Derived (gross / 1.18). null for foreign / non-VAT — never entered by hand. */
  amountNet: number | null;
  /** Derived (gross − net). null for foreign / non-VAT. */
  vatAmount: number | null;
  /** false for loans/financing and anything not VAT-liable. */
  vatApplicable: boolean;
  /** Foreign → ILS conversion, entered later (§1: "0 לחו"ל עד להזנת שער"). */
  fxRate?: number;
  /** Derived when fxRate is present. */
  amountGrossILS?: number;

  paymentMethod: PaymentMethod;
  /**
   * Denormalized from the vendor at capture time so optimization reports keep
   * working even if the vendor's nature is later changed (David §Q1 req 4).
   */
  expenseNature?: ExpenseNature;

  status: PaymentStatus;
  paidDate?: Timestamp;
  /** Accounting period `YYYY-MM` — the month this belongs to. */
  period: string;

  invoice: TransactionInvoice;

  source: TransactionSource;
  /** messageId / external id — dedup key (§4 req 3 + 6). */
  sourceRef?: string;
  /** Defaults to 'pending' for every agent capture; set at write time. */
  approval: ApprovalState;
  notes?: string;

  /** Detected as an invoice but the amount wasn't auto-extracted — a human must
   *  complete it (fill the amount from the PDF/link) before it can be approved. */
  needsReview?: boolean;
  /** Source-email (Gmail) link — for needs-review / linked invoices with no PDF. */
  sourceUrl?: string;

  /** Groups all rows written by one capture run — the rollback handle. */
  importBatchId?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Derivations (pure — no I/O) ──────────────────────────────────────────────

/** Israel VAT rate (18%). */
export const IL_VAT_RATE = 0.18;
const VAT_DIVISOR = 1 + IL_VAT_RATE; // 1.18

export function directionForType(type: TransactionType): TransactionDirection {
  return type === 'income' ? 'in' : 'out';
}

/**
 * Derive net + VAT from a gross amount — always computed, never manual.
 * - ILS + vatApplicable → real numbers (rounded to agorot).
 * - Foreign currency → null until an fxRate is entered (§1 decision).
 * - Non-VAT (e.g. loans) → null.
 */
export function deriveVatFields(args: {
  amountGross: number;
  currency: Currency;
  vatApplicable: boolean;
}): { amountNet: number | null; vatAmount: number | null } {
  const { amountGross, currency, vatApplicable } = args;
  if (!vatApplicable || currency !== 'ILS' || !Number.isFinite(amountGross)) {
    return { amountNet: null, vatAmount: null };
  }
  const net = round2(amountGross / VAT_DIVISOR);
  return { amountNet: net, vatAmount: round2(amountGross - net) };
}

/** `YYYY-MM` for a given date — used for `period` + the Drive month subfolder. */
export function periodKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
