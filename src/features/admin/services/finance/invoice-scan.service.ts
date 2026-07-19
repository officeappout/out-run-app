/**
 * Finance module — invoice scan logic (PURE, no I/O).
 * Spec: מודול כספים §4. The scan route feeds Gmail data in and gets back
 * candidates; all Gmail/Drive/Firestore side effects stay in the route.
 *
 * Mirrors the workout-engine purity convention: logic here has NO React,
 * NO Firebase, NO network — everything arrives as arguments.
 */
import type { FinanceVendor } from './finance-vendors.seed';
import type { Currency, ExpenseNature } from './transaction.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedInvoiceFields {
  amountGross: number | null;
  currency: Currency | null;
  invoiceNumber: string | null;
  /** YYYY-MM-DD when a date was found in the text. */
  dateISO: string | null;
}

export interface VendorMatch {
  vendor: FinanceVendor | null;
  reason: 'sender_domain' | 'sender_alias' | 'subject_alias' | 'none';
  confidence: number; // 0..1
}

export interface InvoiceAttachment {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Where the amount was found via the PDF→body→snippet cascade; 'none' = not extracted. */
export type ExtractionSource = 'pdf' | 'body' | 'snippet' | 'none';

/** One would-be transaction, surfaced by a dry-run scan for human review. */
export interface InvoiceCandidate {
  threadId: string;
  mailbox: string;
  subject: string;
  fromEmail: string;
  messageId: string;
  vendorId: string | null;
  vendorName: string | null;
  matchReason: VendorMatch['reason'];
  /** Overall confidence: vendor match × field extraction. */
  confidence: number;
  extracted: ExtractedInvoiceFields;
  /** Which source yielded the amount: pdf → body → snippet. */
  extractionSource: ExtractionSource;
  /** PDF present but no extractable text (scanned image) → needs OCR. */
  needsOCR: boolean;
  /** Invoice is behind a link (no attachment), e.g. Google Workspace — flagged,
   *  never auto-fetched. */
  linkedInvoice: boolean;
  attachments: Array<Pick<InvoiceAttachment, 'filename' | 'mimeType' | 'size'>>;
  dedupSignature: string;
  /** Human-readable preview of what a live run would write. */
  preview: {
    category: string | null;
    paymentMethod: string | null;
    expenseNature: ExpenseNature | null;
    vatApplicable: boolean;
    driveFolderPath: string;
    /** Exact filename a live capture would store (§4 step 4 convention). */
    fileName: string;
  };
}

// ─── Invoice-likeness ───────────────────────────────────────────────────────

const INVOICE_KEYWORDS: RegExp[] = [
  /חשבונ/i, /קבלה/i, /חיוב/i, /תשלום\s*התקבל|קבלה\s*על\s*תשלום/i,
  /invoice/i, /receipt/i, /\bbilling\b/i, /payment\s*received/i,
];

/** §4 step 1: PDF attachment OR an invoice-ish keyword makes a thread a candidate. */
export function looksLikeInvoice(subject: string, snippet: string, hasPdf: boolean): boolean {
  if (hasPdf) return true;
  const text = `${subject} ${snippet}`;
  return INVOICE_KEYWORDS.some((r) => r.test(text));
}

/**
 * Newsletter / promo / broker mail that can otherwise look invoice-ish (a promo
 * carrying a PDF, or a marketing blast from a vendor's own domain). Ported from
 * crm-agent's proven SKIP_THREAD_PATTERNS — but deliberately WITHOUT the
 * no-reply pattern, since many SaaS invoices are sent from no-reply@. Matched on
 * sender + subject only (not the body snippet) so a real invoice whose footer
 * says "unsubscribe" is not dropped.
 */
const NOISE_PATTERNS: RegExp[] = [
  /unsubscribe/i,
  /newsletter|ניוזלטר/i,
  /list-id/i,
  /goren-amir\.co\.il/i,
  /הסרה\s*מרשימ/i,
];
export function isNoiseThread(fromHeader: string, subject: string): boolean {
  const text = `${fromHeader} ${subject}`;
  return NOISE_PATTERNS.some((r) => r.test(text));
}

/**
 * Light precision filter: vendor-sender mail that clearly ISN'T an invoice
 * (payment-failure / access / action-needed notices). Subject-only and kept
 * deliberately narrow so real invoices are never dropped.
 */
const NOT_INVOICE_PATTERNS: RegExp[] = [
  /payment\s*(failed|declined|unsuccessful)|תשלום\s*(נכשל|בוטל|לא\s*בוצע)/i,
  /(access|subscription|account)\s*(is\s*)?(turned off|disabled|suspended|cancell?ed|revoked|paused)/i,
  /\baction\s*(needed|required)\b/i,
  /card\s*(is\s*)?(expir|declin)/i,
  /failed\s*to\s*(charge|renew|process)/i,
];
export function isNotInvoiceNotification(subject: string): boolean {
  return NOT_INVOICE_PATTERNS.some((r) => r.test(subject));
}

/**
 * Invoice available behind a link (no attachment) — e.g. Google Workspace
 * "your invoice is available", "view your invoice", "החשבונית זמינה". Flagged so
 * a human fetches it; the scanner never follows the link.
 */
const LINKED_INVOICE_PATTERNS: RegExp[] = [
  /invoice\s*(is\s*)?(available|ready|issued)/i,
  /view\s*(your\s*)?(invoice|bill|statement)/i,
  /חשבונית\s*(זמינה|מוכנה|ממתינה|הופקה)/i,
  /לצפייה\s*בחשבונית/i,
];
export function looksLinkedInvoice(text: string): boolean {
  return LINKED_INVOICE_PATTERNS.some((r) => r.test(text));
}

/**
 * Decode human-readable body text from a full Gmail thread's messages
 * (text/plain preferred; text/html stripped of tags). Operates on payloads
 * already fetched with format:full — no network here.
 */
export function extractBodyText(messages: any[]): string {
  const chunks: string[] = [];
  const decode = (data: string) =>
    Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const walk = (part: any) => {
    if (!part) return;
    const mime: string = part.mimeType ?? '';
    if (part.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
      const raw = decode(part.body.data);
      chunks.push(mime === 'text/html' ? stripHtml(raw) : raw);
    }
    (part.parts ?? []).forEach(walk);
  };
  for (const msg of messages ?? []) walk(msg.payload);
  return chunks.join('\n').replace(/[ \t]+/g, ' ').slice(0, 20000);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ');
}

// ─── Vendor matching ──────────────────────────────────────────────────────────

/**
 * Best vendor for a message. Domain match is strongest, then the raw sender
 * string, then a keyword hit anywhere in subject/snippet. Only `active` vendors
 * are considered.
 */
export function matchVendor(
  fromEmail: string,
  subject: string,
  snippet: string,
  vendors: FinanceVendor[],
): VendorMatch {
  const from = fromEmail.toLowerCase();
  const domain = (from.split('@')[1] ?? '').toLowerCase();
  const text = `${subject} ${snippet}`.toLowerCase();

  let best: VendorMatch = { vendor: null, reason: 'none', confidence: 0 };
  const consider = (vendor: FinanceVendor, reason: VendorMatch['reason'], confidence: number) => {
    if (confidence > best.confidence) best = { vendor, reason, confidence };
  };

  for (const vendor of vendors) {
    if (!vendor.active) continue;
    for (const rawAlias of vendor.aliases) {
      const alias = rawAlias.toLowerCase().trim();
      if (alias.length < 2) continue;
      if (domain && domain.includes(alias)) consider(vendor, 'sender_domain', 0.95);
      else if (from.includes(alias)) consider(vendor, 'sender_alias', 0.85);
      else if (text.includes(alias)) consider(vendor, 'subject_alias', 0.6);
    }
  }
  return best;
}

// ─── Field extraction (best-effort — low confidence ⇒ pending review) ─────────

export function extractInvoiceFields(text: string): ExtractedInvoiceFields {
  return {
    currency: extractCurrency(text),
    amountGross: extractAmount(text),
    invoiceNumber: extractInvoiceNumber(text),
    dateISO: extractDate(text),
  };
}

/**
 * Amount cascade (§ live-run fix): run extraction over sources in order
 * (pdf → body → snippet) and take the FIRST that yields an amount, using all of
 * that source's fields. If none has an amount, merge the best non-amount fields
 * (currency / invoice# / date) and report source 'none'.
 */
export function extractFromSources(
  sources: Array<{ src: Exclude<ExtractionSource, 'none'>; text: string }>,
): { fields: ExtractedInvoiceFields; source: ExtractionSource } {
  const evaluated = sources.map((s) => ({ src: s.src, fields: extractInvoiceFields(s.text) }));
  const withAmount = evaluated.find((e) => e.fields.amountGross != null);
  if (withAmount) return { fields: withAmount.fields, source: withAmount.src };

  const firstNonNull = <T>(xs: (T | null)[]): T | null => xs.find((x) => x != null) ?? null;
  return {
    source: 'none',
    fields: {
      amountGross: null,
      currency: firstNonNull(evaluated.map((e) => e.fields.currency)),
      invoiceNumber: firstNonNull(evaluated.map((e) => e.fields.invoiceNumber)),
      dateISO: firstNonNull(evaluated.map((e) => e.fields.dateISO)),
    },
  };
}

function extractCurrency(text: string): Currency | null {
  if (/₪|ש["״]?ח|\bILS\b|שקל/i.test(text)) return 'ILS';
  if (/\$|\bUSD\b|דולר/i.test(text)) return 'USD';
  if (/€|\bEUR\b|יורו|אירו/i.test(text)) return 'EUR';
  return null;
}

/**
 * Grabs a money-looking number, preferring one adjacent to a currency symbol or
 * a "total"/"סה\"כ" cue. Returns null when nothing confident is found.
 */
function extractAmount(text: string): number | null {
  const near =
    text.match(/(?:סה["״]?כ|total|לתשלום|amount\s*due)[^\d]{0,12}([\d.,]+)/i) ??
    text.match(/(?:₪|\$|€)\s*([\d.,]+)/) ??
    text.match(/([\d.,]+)\s*(?:₪|\$|€|ILS|USD|EUR)/i);
  if (!near) return null;
  const n = parseMoney(near[1]);
  return n != null && n > 0 ? n : null;
}

function parseMoney(raw: string): number | null {
  // Drop stray leading/trailing separators — e.g. an amount that ends a sentence
  // ("72.00.") would otherwise poison Number().
  let s = raw.trim().replace(/^[.,]+|[.,]+$/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  // A comma is the decimal separator only when it comes last AND has 1–2 digits
  // after it: European "89,90" / "1.234,56". A comma with 3 trailing digits is a
  // thousands group ("1,234"). Otherwise the dot is the decimal / comma is
  // thousands ("1,234.56", "72.00").
  if (lastComma > lastDot && /,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function extractInvoiceNumber(text: string): string | null {
  const m = text.match(
    /(?:חשבונית(?:\s*מס['׳]?)?|invoice(?:\s*(?:no|number|#))?|קבלה(?:\s*מס['׳]?)?|receipt)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{2,})/i,
  );
  return m?.[1] ?? null;
}

function extractDate(text: string): string | null {
  // DD/MM/YYYY or DD.MM.YYYY or YYYY-MM-DD
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const mo = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${mo}-${d}`;
  }
  return null;
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

/** Cross-run signature (spec §4 step 3). messageId is the primary key; this is
 *  the secondary "same vendor+amount+date" guard for recurring monthly charges. */
export function dedupSignature(
  vendorId: string | null,
  amountGross: number | null,
  dateISO: string | null,
): string {
  return `${vendorId ?? 'unknown'}::${amountGross ?? '?'}::${dateISO ?? '?'}`;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

/** Combines vendor + extraction. ≥ 0.7 ⇒ ready candidate; below ⇒ pending review. */
export function candidateConfidence(match: VendorMatch, fields: ExtractedInvoiceFields): number {
  let c = match.confidence * 0.6;
  if (fields.amountGross != null) c += 0.3;
  if (fields.invoiceNumber != null) c += 0.05;
  if (fields.currency != null) c += 0.05;
  return Math.min(1, Math.round(c * 100) / 100);
}

export const CANDIDATE_CONFIDENCE_THRESHOLD = 0.7;

// ─── Attachment collection (operates on Gmail message payloads — `any`) ───────

const ATTACHMENT_EXT = /\.(pdf|png|jpe?g)$/i;
const NOISE_FILES = [/^image\d+/i, /logo/i, /signature/i, /^att\d+\./i];

/** Collect PDF/image invoice attachments from a full Gmail thread's messages. */
export function collectInvoiceAttachments(messages: any[]): InvoiceAttachment[] {
  const out: InvoiceAttachment[] = [];
  for (const msg of messages ?? []) {
    const walk = (parts: any[]) => {
      for (const p of parts ?? []) {
        if (p.parts) walk(p.parts);
        const filename: string | undefined = p.filename;
        const attachmentId: string | undefined = p.body?.attachmentId;
        if (!filename || !attachmentId) continue;
        if (!ATTACHMENT_EXT.test(filename)) continue;
        if (NOISE_FILES.some((r) => r.test(filename))) continue;
        out.push({
          messageId: msg.id,
          attachmentId,
          filename,
          mimeType: p.mimeType ?? 'application/octet-stream',
          size: p.body?.size ?? 0,
        });
      }
    };
    walk(msg.payload?.parts ?? []);
  }
  return out;
}
