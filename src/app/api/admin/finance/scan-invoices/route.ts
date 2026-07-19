/**
 * POST /api/admin/finance/scan-invoices
 * Body: { days?: number; capture?: 'off' | 'dry' | 'live' }
 *
 * Scans the 3 mailboxes for invoice-like mail, matches each to the vendor
 * catalog, and returns the transactions it WOULD create — for human review.
 * Gmail access is STRICTLY READ-ONLY (enforced by makeReadOnly).
 *
 * capture:
 *   'off'  (default) — pure scan, no writes anywhere.
 *   'dry'            — compute the capture plan (Drive target + transaction) but
 *                      write nothing.
 *   'live'           — actually upload each candidate's PDF to Drive and write a
 *                      transactions doc (approval='pending'). Idempotent by
 *                      sourceRef. Candidates only; pendingReview never written.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  A LIVE write requires BOTH capture:'live' AND the env            ║
 * ║  FINANCE_WRITE_ENABLED=1. The deployed route (env unset) can      ║
 * ║  never write — a live capture is always a deliberate, out-of-band ║
 * ║  act. capture:'live' without the env is downgraded to a dry plan. ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import 'server-only';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getCombinedClient, ALL_MAILBOXES, PRIMARY_MAILBOX } from '@/lib/google-service-account';
import {
  looksLikeInvoice,
  isNoiseThread,
  isNotInvoiceNotification,
  isQuote,
  isCreditStatement,
  isMunicipalIncome,
  isOutgoingOrIncome,
  looksLinkedInvoice,
  matchVendor,
  extractBodyText,
  extractInvoiceFields,
  collectInvoiceAttachments,
  dedupSignature,
  candidateConfidence,
  CANDIDATE_CONFIDENCE_THRESHOLD,
  type InvoiceCandidate,
} from '@/features/admin/services/finance/invoice-scan.service';
import {
  FINANCE_VENDORS_COLLECTION,
  type FinanceVendor,
} from '@/features/admin/services/finance/finance-vendors.seed';
import {
  expensesMonthPath,
  invoiceFileName,
  FINANCE_EXPENSES_FOLDER_ID,
} from '@/features/admin/services/finance/finance-drive.constants';
import {
  periodKey,
  deriveVatFields,
  type Transaction,
} from '@/features/admin/services/finance/transaction.types';

type CaptureMode = 'off' | 'dry' | 'live';

// LIVE writes require this env in addition to capture:'live'. The deployed route
// (env unset) can never write — the master kill-switch.
const WRITE_ENABLED = process.env.FINANCE_WRITE_ENABLED === '1';

// Server-side pre-filter: fetch only mail that could be an invoice — an
// attachment OR an invoice-ish keyword. This is a SUPERSET of the client-side
// looksLikeInvoice gate (attachment OR keyword), so it never drops a real
// candidate, while keeping the result set small enough to page through fully.
const INVOICE_QUERY = '(has:attachment OR חשבונית OR קבלה OR חיוב OR invoice OR receipt OR billing)';
// Page cap per mailbox (100/page). If a mailbox exceeds this, the scan flags
// `truncated` rather than silently dropping — accounting scans must not hide gaps.
const MAX_PAGES_PER_MAILBOX = 5;

// ─── Result contract ──────────────────────────────────────────────────────────

interface CaptureItem {
  threadId: string;
  vendorName: string | null;
  amountGross: number;
  currency: string;
  period: string;
  fileName: string;
  action: 'would-write' | 'written' | 'duplicate' | 'error';
  needsReview?: boolean;
  txId?: string;
  driveFileId?: string;
  error?: string;
}

interface FinanceScanResult {
  period: string;
  window: string;
  /** true when nothing was written (capture 'off'/'dry', or 'live' blocked). */
  dryRun: boolean;
  /** true when capture:'live' was requested but FINANCE_WRITE_ENABLED was unset. */
  dryRunForced: boolean;
  /** Capture outcome (null when capture:'off'). */
  capture: null | {
    requested: CaptureMode;
    effective: CaptureMode;
    writeEnabled: boolean;
    importBatchId?: string;
    items: CaptureItem[];
  };
  /** Confident matches (vendor + amount) — would become transactions. */
  candidates: InvoiceCandidate[];
  /** Invoice-like but low confidence — need a human to complete (spec §4 step 7). */
  pendingReview: InvoiceCandidate[];
  skipped: Array<{ threadId: string; subject: string; reason: string; mailbox: string }>;
  stats: {
    threadsScanned: number;
    invoiceLike: number;
    vendorMatched: number;
    wouldCreate: number;
    apiCalls: number;
    /** cross-mailbox duplicates removed (same Message-ID in >1 mailbox). */
    deduped: number;
    /** invoice-like PDFs with no extractable text — need OCR before capture. */
    needsOCR: number;
    /** invoices behind a link (no attachment) — flagged, never auto-fetched. */
    linkedInvoice: number;
    /** true if any mailbox hit the page cap — the report is incomplete. */
    truncated: boolean;
  };
  runLog: string[];
}

// ─── READ-ONLY GUARD (defense-in-depth) ───────────────────────────────────────

/** Throws if any Gmail write method is touched — the scanner only ever reads. */
function makeReadOnly(gmail: any): any {
  const guard = (obj: any, blocked: string[], ns: string) =>
    new Proxy(obj, {
      get(target, prop: string) {
        if (typeof prop === 'string' && blocked.includes(prop)) {
          throw new Error(
            `[finance-agent] FORBIDDEN: gmail.users.${ns}.${prop}() — the invoice scanner is strictly read-only.`,
          );
        }
        return (target as any)[prop];
      },
    });
  // The token still carries modify+compose+drive scopes (google-service-account),
  // so every write-capable Gmail surface an accidental future edit could reach is
  // fenced off — not just the send/draft path. (A fully read-scoped client is the
  // eventual belt-and-suspenders, pending gmail.readonly authorization.)
  const u = gmail.users;
  u.messages = guard(u.messages, ['send', 'insert', 'import', 'trash', 'delete', 'batchDelete', 'batchModify', 'modify'], 'messages');
  u.drafts = guard(u.drafts, ['create', 'send', 'update', 'delete'], 'drafts');
  u.threads = guard(u.threads, ['modify', 'trash', 'delete'], 'threads');
  if (u.labels) u.labels = guard(u.labels, ['create', 'update', 'patch', 'delete'], 'labels');
  if (u.settings) {
    u.settings = guard(u.settings, ['updateAutoForwarding', 'updateImap', 'updatePop', 'updateLanguage', 'updateVacation'], 'settings');
  }
  for (const write of ['watch', 'stop'] as const) {
    if (typeof u[write] === 'function') {
      u[write] = () => {
        throw new Error(`[finance-agent] FORBIDDEN: gmail.users.${write}() — the invoice scanner is strictly read-only.`);
      };
    }
  }
  // The Drive client from getCombinedClient is intentionally never obtained here
  // (we destructure only { gmail }), so no Drive write path exists.
  return gmail;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFromEmail(fromHeader: string): string {
  const m = fromHeader.match(/<(.+?)>/);
  return (m ? m[1] : fromHeader).toLowerCase().trim();
}

function vatApplicableFor(vendor: FinanceVendor | null): boolean {
  if (!vendor) return true; // unknown → assume VAT-liable until a human confirms
  return !(vendor.paymentMethod === 'הלוואה' || vendor.category === 'הלוואות ומימון');
}

/** Find-or-create the הוצאות/YYYY-MM month subfolder (live capture only). */
async function getOrCreateMonthFolder(drive: any, period: string): Promise<string> {
  const safe = period.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${FINANCE_EXPENSES_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: period, mimeType: 'application/vnd.google-apps.folder', parents: [FINANCE_EXPENSES_FOLDER_ID] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

/** First non-trashed file of this exact name in the folder (for idempotent upload). */
async function findFileInFolder(
  drive: any,
  folderId: string,
  name: string,
): Promise<{ id: string; webViewLink?: string } | null> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safe}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = res.data.files?.[0];
  return f?.id ? { id: f.id, webViewLink: f.webViewLink ?? undefined } : null;
}

/**
 * Firestore rejects `undefined` — drop undefined keys. Only PLAIN objects are
 * recursed into (nested `invoice`); Timestamps, FieldValue sentinels and arrays
 * are preserved as-is (recursing into them would corrupt the write).
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const isPlain = (v: any) => v != null && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) ? stripUndefined(v) : v;
  }
  return out as T;
}

/** Map a confident candidate → a pending expense transaction. */
function buildTransaction(
  c: InvoiceCandidate,
  id: string,
  period: string,
  importBatchId: string,
  now: any,
  extra: { driveFileId?: string; driveUrl?: string; needsReview?: boolean; sourceUrl?: string },
): Transaction {
  const currency = c.extracted.currency ?? c.preview.currency ?? 'ILS';
  const hasAmount = c.extracted.amountGross != null && c.extracted.amountGross > 0;
  const amountGross = hasAmount ? (c.extracted.amountGross as number) : 0;
  const vatApplicable = c.preview.vatApplicable;
  const { amountNet, vatAmount } = hasAmount
    ? deriveVatFields({ amountGross, currency, vatApplicable })
    : { amountNet: null, vatAmount: null };
  return {
    id,
    type: 'expense',
    direction: 'out',
    vendorOrClient: c.vendorName ?? c.fromEmail,
    vendorId: c.vendorId ?? undefined,
    category: (c.preview.category as Transaction['category']) ?? 'אחר',
    title: c.subject,
    currency: currency as Transaction['currency'],
    amountGross,
    amountNet,
    vatAmount,
    vatApplicable,
    paymentMethod: (c.preview.paymentMethod as Transaction['paymentMethod']) ?? 'אשראי',
    expenseNature: c.preview.expenseNature ?? undefined,
    status: 'שולם',
    period,
    invoice: {
      status: extra.driveFileId ? 'הועלה' : 'חסר',
      driveFileId: extra.driveFileId,
      driveUrl: extra.driveUrl,
      invoiceNumber: c.extracted.invoiceNumber ?? undefined,
    },
    source: 'email',
    sourceRef: c.messageId, // stable first-message id or thread fallback — never empty
    approval: 'pending',
    needsReview: extra.needsReview || undefined,
    sourceUrl: extra.sourceUrl,
    notes: '',
    importBatchId,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { days?: number; after?: string; before?: string; capture?: CaptureMode } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → defaults */
  }

  const days = Math.min(Math.max(body.days ?? 40, 1), 400); // up to ~13mo for one-time catch-up
  // Gmail date filter: explicit after/before (YYYY-MM-DD) wins; else newer_than:days.
  const toGmailDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '/') : '');
  const afterQ = toGmailDate(body.after);
  const beforeQ = toGmailDate(body.before);
  const dateQuery = afterQ || beforeQ
    ? [afterQ && `after:${afterQ}`, beforeQ && `before:${beforeQ}`].filter(Boolean).join(' ')
    : `newer_than:${days}d`;
  // Validate against the enum — any unknown value coerces to the safe 'off'.
  const requestedCapture: CaptureMode = body.capture === 'dry' || body.capture === 'live' ? body.capture : 'off';
  // capture:'live' requires FINANCE_WRITE_ENABLED; otherwise it degrades to a dry plan.
  const captureMode: CaptureMode = requestedCapture === 'live' && !WRITE_ENABLED ? 'dry' : requestedCapture;
  const dryRun = captureMode !== 'live';
  const dryRunForced = requestedCapture === 'live' && !WRITE_ENABLED;

  const runLog: string[] = [];
  const log = (m: string) => {
    runLog.push(m);
    console.log(`[finance-scan] ${m}`);
  };

  const result: FinanceScanResult = {
    period: periodKey(new Date()),
    window: dateQuery,
    dryRun,
    dryRunForced,
    capture: null,
    candidates: [],
    pendingReview: [],
    skipped: [],
    stats: { threadsScanned: 0, invoiceLike: 0, vendorMatched: 0, wouldCreate: 0, apiCalls: 0, deduped: 0, needsOCR: 0, linkedInvoice: 0, truncated: false },
    runLog,
  };
  const apiCall = () => {
    result.stats.apiCalls++;
  };

  if (dryRunForced) log('⚠️ capture:live requested but FINANCE_WRITE_ENABLED is unset — writing nothing (dry plan).');

  try {
    const db = getAdminDb();

    // ── Load vendor catalog ─────────────────────────────────────────────────
    log('Loading finance_vendors catalog');
    const vendorSnap = await db.collection(FINANCE_VENDORS_COLLECTION).get();
    apiCall();
    const vendors: FinanceVendor[] = vendorSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinanceVendor, 'id'>) }));
    log(`   ${vendors.length} vendors (${vendors.filter((v) => v.active).length} active)`);
    if (vendors.length === 0) {
      log('   ⚠️ empty catalog — run /api/admin/finance/seed-vendors first');
    }

    // ── Build read-only Gmail clients for all mailboxes ──────────────────────
    log('Building read-only Gmail clients (parallel)');
    const clients = await Promise.all(
      ALL_MAILBOXES.map(async (mailbox) => {
        const { gmail } = await getCombinedClient(mailbox);
        return { mailbox, gmail: makeReadOnly(gmail) };
      }),
    );

    // ── Scan each mailbox for invoice-like threads ───────────────────────────
    log(`Scanning ${ALL_MAILBOXES.length} mailboxes (${result.window})`);
    const scans = await Promise.all(
      clients.map(async ({ mailbox, gmail }) => {
        // Page through the targeted query until exhausted or the cap is hit.
        const threads: any[] = [];
        let pageToken: string | undefined;
        let pages = 0;
        let truncated = false;
        do {
          const res = await gmail.users.threads.list({
            userId: 'me',
            q: `${dateQuery} ${INVOICE_QUERY}`,
            maxResults: 100,
            pageToken,
          });
          apiCall();
          threads.push(...(res.data.threads ?? []));
          pageToken = res.data.nextPageToken ?? undefined;
          pages++;
          if (pageToken && pages >= MAX_PAGES_PER_MAILBOX) {
            truncated = true;
            log(`   ⚠️ [${mailbox}] hit ${MAX_PAGES_PER_MAILBOX}-page cap — results truncated`);
            break;
          }
        } while (pageToken);

        const metas = await Promise.all(
          threads.map(async (t) => {
            const detail = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'metadata' });
            apiCall();
            return { threadId: t.id as string, detail };
          }),
        );
        return { mailbox, gmail, threads: threads.length, metas, truncated };
      }),
    );

    // PDF text extractor (serverless-safe) — imported once, reused per candidate.
    const { extractText, getDocumentProxy } = await import('unpdf');

    // ── Classify each thread (cross-mailbox dedupe) ──────────────────────────
    const seen = new Set<string>();
    // PDF bytes kept for the capture phase (reused, not re-downloaded).
    const captureBufs = new Map<string, { buf: Buffer; mimeType: string }>();
    for (const { mailbox, gmail, threads, metas, truncated } of scans) {
      if (truncated) result.stats.truncated = true;
      result.stats.threadsScanned += threads;
      for (const { threadId, detail } of metas) {
        const messages: any[] = detail.data.messages ?? [];
        if (!messages.length) continue;
        const lastMsg = messages[messages.length - 1];
        const hdrs: Record<string, string> = {};
        for (const h of lastMsg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
        const subject = hdrs['subject'] ?? '(no subject)';
        const from = hdrs['from'] ?? '';
        const snippet = lastMsg.snippet ?? '';
        const fromEmail = parseFromEmail(from);

        // Stable dedup identity: the ORIGINAL (first) message's Message-ID. Unlike
        // the last message's, it does NOT change when the thread gains a reply, and
        // it's identical across mailboxes. Falls back to the thread id so it is
        // never empty — the persisted sourceRef + idempotency key both use it.
        const firstHdrs: Record<string, string> = {};
        for (const h of messages[0].payload?.headers ?? []) firstHdrs[h.name.toLowerCase()] = h.value;
        const messageId = firstHdrs['message-id'] || hdrs['message-id'] || `thread:${threadId}`;

        if (seen.has(messageId)) {
          result.stats.deduped++;
          continue;
        }
        seen.add(messageId);

        // Drop newsletters / promos / broker mail before classifying.
        if (isNoiseThread(from, subject)) {
          result.skipped.push({ threadId, subject, reason: 'noise/newsletter', mailbox });
          continue;
        }

        // Drop clear vendor notifications (payment failed / access disabled / …).
        if (isNotInvoiceNotification(subject)) {
          result.skipped.push({ threadId, subject, reason: 'vendor-notification', mailbox });
          continue;
        }

        // Drop OUR OWN outgoing invoices / customer-charge income (expenses only).
        if (isOutgoingOrIncome(from, subject)) {
          result.skipped.push({ threadId, subject, reason: 'income/outgoing', mailbox });
          continue;
        }

        // Drop municipal / B2G mail — municipalities are customers (income, Phase 2).
        if (isMunicipalIncome(from, subject)) {
          result.skipped.push({ threadId, subject, reason: 'b2g/municipal', mailbox });
          continue;
        }

        // Drop price quotes / proposals (Oversight sends both חשבונית מס and הצעת מחיר).
        if (isQuote(subject)) {
          result.skipped.push({ threadId, subject, reason: 'quote', mailbox });
          continue;
        }

        // Credit-card monthly statements (icc) — own bucket, feeds Phase 3, not captured.
        if (isCreditStatement(from, subject)) {
          result.skipped.push({ threadId, subject, reason: 'credit-statement', mailbox });
          continue;
        }

        // A PDF attachment (not a logo image) or an invoice keyword marks it.
        const hasPdf = messages.some((m: any) =>
          (m.payload?.parts ?? []).some((p: any) => /\.pdf$/i.test(p.filename ?? '')),
        );
        if (!looksLikeInvoice(subject, snippet, hasPdf)) {
          result.skipped.push({ threadId, subject, reason: 'not invoice-like', mailbox });
          continue;
        }
        result.stats.invoiceLike++;

        const match = matchVendor(fromEmail, subject, snippet, vendors);
        if (match.vendor) result.stats.vendorMatched++;

        // Fetch full thread → body text + attachments (with ids for PDF download).
        let bodyText = '';
        let attachments: InvoiceCandidate['attachments'] = [];
        let pdfAtts: ReturnType<typeof collectInvoiceAttachments> = [];
        try {
          const full = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
          apiCall();
          const msgs = full.data.messages ?? [];
          bodyText = extractBodyText(msgs);
          const atts = collectInvoiceAttachments(msgs);
          attachments = atts.map((a) => ({ filename: a.filename, mimeType: a.mimeType, size: a.size }));
          pdfAtts = atts.filter((a) => /\.pdf$/i.test(a.filename));
        } catch (err: any) {
          log(`   ⚠️ could not read thread ${threadId}: ${err?.message}`);
        }

        // Amount cascade: PDF text → body → snippet. Image-only PDFs → needs OCR.
        let pdfText = '';
        let needsOCR = false;
        if (pdfAtts.length) {
          try {
            const att = await gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: pdfAtts[0].messageId,
              id: pdfAtts[0].attachmentId,
            });
            apiCall();
            const buf = Buffer.from((att.data.data ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            if (captureMode !== 'off') captureBufs.set(threadId, { buf, mimeType: pdfAtts[0].mimeType });
            const doc = await getDocumentProxy(new Uint8Array(buf));
            const { text } = await extractText(doc, { mergePages: true });
            pdfText = (typeof text === 'string' ? text : (text as string[]).join('\n')).trim();
            if (pdfText.length < 20) {
              needsOCR = true; // scanned image PDF — no extractable text
              pdfText = '';
            }
          } catch (err: any) {
            needsOCR = true;
            log(`   ⚠️ PDF parse failed for ${threadId}: ${err?.message}`);
          }
        }

        // Amount is taken from the PDF ONLY (never body/snippet), and only when it
        // sits behind a Total / Amount-paid / סה"כ label. Other metadata
        // (currency / date / invoice#) may fall back body → subject.
        const pdfFields = pdfText
          ? extractInvoiceFields(`${subject}\n${pdfText}`, { amountHint: match.vendor?.amountHint })
          : null;
        const bodyFields = bodyText ? extractInvoiceFields(`${subject}\n${bodyText}`) : null;
        const subjFields = extractInvoiceFields(`${subject}\n${snippet}`);
        const pick = <T,>(...xs: (T | null | undefined)[]): T | null => xs.find((x) => x != null) ?? null;
        const fields = {
          amountGross: pdfFields?.amountGross ?? null,
          currency: pick(pdfFields?.currency, bodyFields?.currency, subjFields.currency),
          invoiceNumber: pick(pdfFields?.invoiceNumber, bodyFields?.invoiceNumber, subjFields.invoiceNumber),
          dateISO: pick(pdfFields?.dateISO, bodyFields?.dateISO, subjFields.dateISO),
        };
        const source: InvoiceCandidate['extractionSource'] = fields.amountGross != null ? 'pdf' : 'none';

        const linkedInvoice = pdfAtts.length === 0 && looksLinkedInvoice(`${subject}\n${bodyText}`);
        if (needsOCR) result.stats.needsOCR++;
        if (linkedInvoice) result.stats.linkedInvoice++;

        const confidence = candidateConfidence(match, fields);
        const vatApplicable = vatApplicableFor(match.vendor);
        // File under the invoice's OWN month, not the scan month — a 40-day
        // window routinely spans a month boundary.
        const invoicePeriod = fields.dateISO ? fields.dateISO.slice(0, 7) : result.period;
        const candidate: InvoiceCandidate = {
          threadId,
          mailbox,
          subject,
          fromEmail,
          messageId,
          vendorId: match.vendor?.id ?? null,
          vendorName: match.vendor?.name ?? null,
          matchReason: match.reason,
          confidence,
          extracted: fields,
          extractionSource: source,
          needsOCR,
          linkedInvoice,
          attachments,
          dedupSignature: dedupSignature(match.vendor?.id ?? null, fields.amountGross, fields.dateISO),
          preview: {
            category: match.vendor?.category ?? null,
            paymentMethod: match.vendor?.paymentMethod ?? null,
            expenseNature: match.vendor?.expenseNature ?? null,
            currency: match.vendor?.currency ?? null,
            vatApplicable,
            driveFolderPath: expensesMonthPath(invoicePeriod),
            fileName: invoiceFileName({
              dateISO: fields.dateISO,
              vendorName: match.vendor?.name ?? fromEmail,
              amountGross: fields.amountGross,
              currency: fields.currency ?? 'ILS',
              originalExt: attachments[0]?.filename.split('.').pop() ?? 'pdf',
            }),
          },
        };

        // Super-rule: a real candidate MUST have an attached PDF (amount is
        // PDF-only). Anything without one — even high confidence — goes to review.
        if (confidence >= CANDIDATE_CONFIDENCE_THRESHOLD && pdfAtts.length > 0) {
          result.candidates.push(candidate);
          result.stats.wouldCreate++;
        } else {
          result.pendingReview.push(candidate);
        }
      }
    }

    result.candidates.sort((a, b) => b.confidence - a.confidence);
    result.pendingReview.sort((a, b) => b.confidence - a.confidence);

    // ── Capture phase: write confident candidates + "needs review" items (invoice-
    //    like with a PDF or a linked invoice but no extracted amount). Idempotent by
    //    sourceRef. 'dry' plans without writing; 'live' uploads PDFs + writes.
    if (captureMode !== 'off') {
      const importBatchId = `imp_${Date.now()}`;
      const toCapture: Array<{ c: InvoiceCandidate; needsReview: boolean }> = [
        ...result.candidates.map((c) => ({ c, needsReview: false })),
        ...result.pendingReview
          .filter((c) => (c.attachments?.length ?? 0) > 0 || c.linkedInvoice)
          .map((c) => ({ c, needsReview: true })),
      ];
      result.capture = {
        requested: requestedCapture,
        effective: captureMode,
        writeEnabled: WRITE_ENABLED,
        importBatchId,
        items: [],
      };
      log(`Capture (${captureMode}) — ${result.candidates.length} candidate(s) + ${toCapture.length - result.candidates.length} needs-review, batch ${importBatchId}`);

      const { Timestamp } = await import('firebase-admin/firestore');
      let drive: any = null;
      let Readable: typeof import('stream').Readable | null = null;
      if (captureMode === 'live') {
        ({ drive } = await getCombinedClient(PRIMARY_MAILBOX)); // Drive WRITE client (not read-only)
        ({ Readable } = await import('stream'));
      }
      const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;
      const monthFolderCache = new Map<string, string>();

      for (const { c, needsReview } of toCapture) {
        const currency = c.extracted.currency ?? c.preview.currency ?? 'ILS';
        const period = c.extracted.dateISO ? c.extracted.dateISO.slice(0, 7) : result.period;
        const item: CaptureItem = {
          threadId: c.threadId,
          vendorName: c.vendorName,
          amountGross: c.extracted.amountGross ?? 0,
          currency,
          period,
          fileName: c.preview.fileName,
          action: 'would-write',
          needsReview,
        };

        // Idempotent: skip if a transaction with this sourceRef already exists.
        // (messageId is always non-empty — the first-message id or thread fallback.)
        const dup = await db.collection('transactions').where('sourceRef', '==', c.messageId).limit(1).get();
        apiCall();
        if (!dup.empty) {
          item.action = 'duplicate';
          item.txId = dup.docs[0].id;
          result.capture.items.push(item);
          continue;
        }

        // Only 'live' writes; every other reached mode is a dry plan.
        if (captureMode !== 'live') {
          result.capture.items.push(item); // action stays 'would-write'
          continue;
        }

        // LIVE: upload the PDF when present (idempotent by filename), then write the tx.
        try {
          const bufEntry = captureBufs.get(c.threadId);
          let driveFileId: string | undefined;
          let driveUrl: string | undefined;
          if (bufEntry) {
            let folderId = monthFolderCache.get(period);
            if (!folderId) {
              folderId = await getOrCreateMonthFolder(drive, period);
              monthFolderCache.set(period, folderId);
              apiCall();
            }
            // Reuse an existing same-named file (avoids an orphan if a prior run
            // uploaded the PDF but failed the tx write).
            const existing = await findFileInFolder(drive, folderId, c.preview.fileName);
            apiCall();
            if (existing) {
              driveFileId = existing.id;
              driveUrl = existing.webViewLink;
            } else {
              const up = await drive.files.create({
                requestBody: { name: c.preview.fileName, parents: [folderId] },
                media: { mimeType: bufEntry.mimeType, body: Readable!.from(bufEntry.buf) },
                fields: 'id,webViewLink',
                supportsAllDrives: true,
              });
              apiCall();
              driveFileId = up.data.id ?? undefined;
              driveUrl = up.data.webViewLink ?? undefined;
            }
          }
          // No PDF (linked / needs-review) → keep a link to the source email.
          const sourceUrl = !bufEntry ? gmailLink(c.threadId) : undefined;
          const now = Timestamp.now();
          const txRef = db.collection('transactions').doc();
          const tx = buildTransaction(c, txRef.id, period, importBatchId, now, { driveFileId, driveUrl, needsReview, sourceUrl });
          await txRef.set(stripUndefined(tx));
          apiCall();
          item.action = 'written';
          item.txId = txRef.id;
          item.driveFileId = driveFileId;
        } catch (err: any) {
          item.action = 'error';
          item.error = err?.message;
          log(`   ⚠️ capture failed for ${c.threadId}: ${err?.message}`);
        }
        result.capture.items.push(item);
      }

      const written = result.capture.items.filter((i) => i.action === 'written').length;
      const dupes = result.capture.items.filter((i) => i.action === 'duplicate').length;
      const errs = result.capture.items.filter((i) => i.action === 'error').length;
      log(`Capture done — ${written} written · ${dupes} duplicate · ${errs} error`);

      // Record the scan time (drives the "since last scan" default window).
      if (captureMode === 'live') {
        try {
          await db.collection('finance_meta').doc('scan').set(
            { lastScanAt: Timestamp.now(), lastWindow: dateQuery, lastWritten: written },
            { merge: true },
          );
        } catch { /* non-fatal */ }
      }
    }

    log(
      `${result.stats.truncated ? '⚠️ scan TRUNCATED' : '✅ scan complete'} — ${result.candidates.length} candidate(s), ${result.pendingReview.length} pending review, ${result.skipped.length} skipped` +
        (result.stats.truncated ? ' — raise MAX_PAGES_PER_MAILBOX or narrow the window' : ''),
    );
    return NextResponse.json(result);
  } catch (err: any) {
    log(`❌ Fatal: ${err?.message ?? err}`);
    console.error('[finance/scan-invoices]', err);
    return NextResponse.json({ ...result, error: err?.message ?? 'scan error' }, { status: 500 });
  }
}

/** GET → the last scan timestamp, for the UI's "since last scan" default window. */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    const snap = await getAdminDb().collection('finance_meta').doc('scan').get();
    const lastScanAt = snap.exists ? (snap.data()?.lastScanAt?.toDate?.()?.toISOString() ?? null) : null;
    return NextResponse.json({ lastScanAt, writeEnabled: WRITE_ENABLED });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'meta error' }, { status: 500 });
  }
}
