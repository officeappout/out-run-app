/**
 * POST /api/admin/finance/scan-invoices
 * Body: { days?: number; dryRun?: boolean }
 *
 * Scans the 3 mailboxes for invoice-like mail, matches each to the vendor
 * catalog, and returns the transactions it WOULD create — for human review.
 * Forked from crm-agent/run, but STRICTLY READ-ONLY:
 *   • no Gmail send/draft/label/modify (enforced at runtime by makeReadOnly)
 *   • no Drive writes, no Firestore writes
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DRY_RUN_ONLY is a hard kill-switch, currently ON.               ║
 * ║  While true, the route NEVER writes — even if the caller passes  ║
 * ║  dryRun:false. Flipping it to false (a deliberate, reviewed step) ║
 * ║  is what unlocks the live capture path in a later phase.          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import 'server-only';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getCombinedClient, ALL_MAILBOXES } from '@/lib/google-service-account';
import {
  looksLikeInvoice,
  isNoiseThread,
  isNotInvoiceNotification,
  looksLinkedInvoice,
  matchVendor,
  extractBodyText,
  extractFromSources,
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
import { expensesMonthPath, invoiceFileName } from '@/features/admin/services/finance/finance-drive.constants';
import { periodKey } from '@/features/admin/services/finance/transaction.types';

// ── HARD KILL-SWITCH ──────────────────────────────────────────────────────────
// The live capture path (Drive upload + `transactions` writes) is not built yet
// and must not run. Keep this true until that path is written AND reviewed.
const DRY_RUN_ONLY = true;

// Server-side pre-filter: fetch only mail that could be an invoice — an
// attachment OR an invoice-ish keyword. This is a SUPERSET of the client-side
// looksLikeInvoice gate (attachment OR keyword), so it never drops a real
// candidate, while keeping the result set small enough to page through fully.
const INVOICE_QUERY = '(has:attachment OR חשבונית OR קבלה OR חיוב OR invoice OR receipt OR billing)';
// Page cap per mailbox (100/page). If a mailbox exceeds this, the scan flags
// `truncated` rather than silently dropping — accounting scans must not hide gaps.
const MAX_PAGES_PER_MAILBOX = 5;

// ─── Result contract ──────────────────────────────────────────────────────────

interface FinanceScanResult {
  period: string;
  window: string;
  dryRun: boolean;
  /** true when DRY_RUN_ONLY overrode an explicit dryRun:false request. */
  dryRunForced: boolean;
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { days?: number; dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → defaults */
  }

  const days = Math.min(Math.max(body.days ?? 40, 1), 120);
  const requestedDryRun = body.dryRun ?? true;
  const dryRun = DRY_RUN_ONLY ? true : requestedDryRun;
  const dryRunForced = DRY_RUN_ONLY && requestedDryRun === false;

  const runLog: string[] = [];
  const log = (m: string) => {
    runLog.push(m);
    console.log(`[finance-scan] ${m}`);
  };

  const result: FinanceScanResult = {
    period: periodKey(new Date()),
    window: `newer_than:${days}d`,
    dryRun,
    dryRunForced,
    candidates: [],
    pendingReview: [],
    skipped: [],
    stats: { threadsScanned: 0, invoiceLike: 0, vendorMatched: 0, wouldCreate: 0, apiCalls: 0, deduped: 0, needsOCR: 0, linkedInvoice: 0, truncated: false },
    runLog,
  };
  const apiCall = () => {
    result.stats.apiCalls++;
  };

  if (dryRunForced) log('⚠️ dryRun:false requested but DRY_RUN_ONLY is ON — forcing dry-run (no writes).');

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
            q: `newer_than:${days}d ${INVOICE_QUERY}`,
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
        const messageId = hdrs['message-id'] ?? '';
        const snippet = lastMsg.snippet ?? '';
        const fromEmail = parseFromEmail(from);

        // Cross-mailbox dedupe on the RFC Message-ID (identical in every mailbox
        // the same email reached); fall back to threadId when it's missing.
        const dedupeKey = messageId || `thread:${threadId}`;
        if (seen.has(dedupeKey)) {
          result.stats.deduped++;
          continue;
        }
        seen.add(dedupeKey);

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

        const sources: Array<{ src: 'pdf' | 'body' | 'snippet'; text: string }> = [];
        if (pdfText) sources.push({ src: 'pdf', text: `${subject}\n${pdfText}` });
        if (bodyText) sources.push({ src: 'body', text: `${subject}\n${bodyText}` });
        sources.push({ src: 'snippet', text: `${subject}\n${snippet}` });
        const { fields, source } = extractFromSources(sources);

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

        if (confidence >= CANDIDATE_CONFIDENCE_THRESHOLD) {
          result.candidates.push(candidate);
          result.stats.wouldCreate++;
        } else {
          result.pendingReview.push(candidate);
        }
      }
    }

    result.candidates.sort((a, b) => b.confidence - a.confidence);
    result.pendingReview.sort((a, b) => b.confidence - a.confidence);
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
