/**
 * scripts/finance-run.ts — THROWAWAY runner.
 * Runs the REAL finance route handlers (via NextRequest — no logic duplication):
 *   1. seed-vendors  (dryRun:false — real write to finance_vendors, idempotent)
 *   2. scan-invoices (dry-run, read-only) over the last DAYS days
 * then prints a report emphasizing: TRUNCATED · EUR · cross-mailbox DEDUP · 3-mailbox coverage.
 *
 * Run: npx tsx --tsconfig scripts/finance-run.tsconfig.json scripts/finance-run.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

const MAIN = '/Users/calisthenicsltd/Development/appout-1';
dotenv.config({ path: path.join(MAIN, '.env.local') });
// Absolute-ize the Gmail SA key path so it resolves regardless of cwd.
const kp = process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH;
if (kp && !path.isAbsolute(kp)) process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH = path.resolve(MAIN, kp);

import { NextRequest } from 'next/server';

const DAYS = Number(process.argv[3]) || 40; // window in days (argv[3]); default 40
const MAILBOXES = ['david@appout.co.il', 'office@appout.co.il', 'matan.danan@appout.co.il'];

async function callRoute(POST: (r: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const req = new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'x-agent-key': process.env.AGENT_API_KEY ?? '', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return res.json();
}

const money = (c: any) =>
  c.extracted.amountGross != null ? `${c.extracted.amountGross} ${c.extracted.currency ?? '?'}` : '(none)';

function line(label: string, val: unknown) {
  console.log(`  ${label.padEnd(22)} ${val}`);
}

async function main() {
  // arg: 'scan' (default, read-only) | 'dry' (write-plan) | 'live' (real write)
  const MODE = (process.argv[2] ?? 'scan') as 'scan' | 'dry' | 'live';
  const capture = MODE === 'scan' ? 'off' : MODE;
  if (MODE === 'live') process.env.FINANCE_WRITE_ENABLED = '1'; // controlled first write
  console.log('════════════════════ FINANCE RUN ════════════════════');
  line('creds key', process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH);
  line('agent key set', !!process.env.AGENT_API_KEY);
  line('MODE / capture', `${MODE} / ${capture}`);
  line('window (days)', DAYS);

  // ── 1) SEED (real write) ───────────────────────────────────────────────────
  console.log('\n──────── 1. SEED finance_vendors (dryRun:false) ────────');
  const { POST: seedPOST } = await import('@/app/api/admin/finance/seed-vendors/route');
  const seed: any = await callRoute(seedPOST as any, '/api/admin/finance/seed-vendors', { dryRun: false });
  line('ok', seed.ok);
  line('catalogSize', seed.catalogSize);
  line('created', `${seed.created?.length ?? 0} → ${JSON.stringify(seed.created)}`);
  line('skipped(existing)', `${seed.skipped?.length ?? 0}`);
  if (seed.error) line('ERROR', seed.error);

  // ── 1b) dev reconcile: the seed is idempotent-skip, so push the latest
  //         baseline aliases (e.g. the new 'sumit' alias) onto existing docs. ──
  const { getAdminDb } = await import('@/lib/firebase-admin');
  const { FINANCE_VENDORS_SEED } = await import('@/features/admin/services/finance/finance-vendors.seed');
  const db = getAdminDb();
  for (const v of FINANCE_VENDORS_SEED) {
    const { id, ...rest } = v;
    await db.collection('finance_vendors').doc(id).set(rest, { merge: true });
  }
  console.log('  (dev) synced full vendor baseline (incl. Oversight + new vendors) onto finance_vendors');

  // ── 2) SCAN (dry-run) ──────────────────────────────────────────────────────
  console.log('\n──────── 2. SCAN invoices (dry-run, read-only) ────────');
  const { POST: scanPOST } = await import('@/app/api/admin/finance/scan-invoices/route');
  const scan: any = await callRoute(scanPOST as any, '/api/admin/finance/scan-invoices', { days: DAYS, capture });

  if (scan.error) {
    console.log('  SCAN ERROR:', scan.error);
    console.log(JSON.stringify(scan.runLog ?? [], null, 2));
    return;
  }

  const all: any[] = [...(scan.candidates ?? []), ...(scan.pendingReview ?? [])];
  const s = scan.stats;

  console.log('\n  STATS');
  line('window', scan.window);
  line('dryRun / forced', `${scan.dryRun} / ${scan.dryRunForced}`);
  line('threadsScanned', s.threadsScanned);
  line('invoiceLike', s.invoiceLike);
  line('vendorMatched', s.vendorMatched);
  line('wouldCreate', s.wouldCreate);
  line('pendingReview', scan.pendingReview?.length ?? 0);
  line('skipped', scan.skipped?.length ?? 0);
  line('apiCalls', s.apiCalls);
  line('needsOCR', s.needsOCR);
  line('linkedInvoice', s.linkedInvoice);

  // ── ⭐ TRUNCATED ──
  console.log('\n  ⭐ TRUNCATED');
  line('stats.truncated', s.truncated ? '⚠️ YES — report is INCOMPLETE' : 'no — full window covered');
  (scan.runLog ?? []).filter((l: string) => /truncat/i.test(l)).forEach((l: string) => console.log('    ' + l.trim()));

  // ── ⭐ 3-MAILBOX COVERAGE ──
  console.log('\n  ⭐ 3-MAILBOX COVERAGE (candidates+pending by mailbox)');
  for (const mb of MAILBOXES) {
    const n = all.filter((c) => c.mailbox === mb).length;
    line(mb, n === 0 ? '0  ⚠️ no hits' : `${n}`);
  }
  const unknownMb = all.filter((c) => !MAILBOXES.includes(c.mailbox)).map((c) => c.mailbox);
  if (unknownMb.length) line('(unexpected mailbox)', JSON.stringify([...new Set(unknownMb)]));

  // ── ⭐ CROSS-MAILBOX DEDUP ──
  console.log('\n  ⭐ CROSS-MAILBOX DEDUP');
  line('stats.deduped', `${s.deduped} duplicate(s) removed by Message-ID`);
  const ids = all.map((c) => c.messageId).filter(Boolean);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  line('dupes remaining', dupIds.length === 0 ? '0 ✓ (no duplicate Message-IDs in output)' : `⚠️ ${dupIds.length}`);

  // ── ⭐ EUR / FOREIGN CURRENCY (validates parseMoney fix) ──
  console.log('\n  ⭐ EUR / FOREIGN CURRENCY');
  const foreign = all.filter((c) => c.extracted.currency && c.extracted.currency !== 'ILS');
  if (!foreign.length) console.log('    (none detected in this window)');
  foreign.forEach((c) =>
    console.log(`    • ${money(c)}  [${c.vendorName ?? c.fromEmail}]  "${(c.subject ?? '').slice(0, 60)}"`),
  );

  // ── ⭐ IMAGE-PDF (needs OCR) / LINKED INVOICES ──
  console.log('\n  ⭐ IMAGE-PDF (needs OCR) / LINKED INVOICES');
  line('stats.needsOCR', s.needsOCR);
  line('stats.linkedInvoice', s.linkedInvoice);
  all.filter((c: any) => c.needsOCR).slice(0, 6).forEach((c: any) => console.log(`    🖼️ OCR   [${c.vendorName ?? c.fromEmail}] "${(c.subject ?? '').slice(0, 55)}"`));
  all.filter((c: any) => c.linkedInvoice).slice(0, 6).forEach((c: any) => console.log(`    🔗 link  [${c.vendorName ?? c.fromEmail}] "${(c.subject ?? '').slice(0, 55)}"`));

  // ── CANDIDATES ──
  console.log(`\n  CANDIDATES / מוכנות (${scan.candidates?.length ?? 0})`);
  if (!scan.candidates?.length) console.log('    (none crossed the 0.7 threshold)');
  (scan.candidates ?? []).forEach((c: any, i: number) =>
    console.log(`    ${String(i + 1).padStart(2)}. ${money(c).padEnd(11)} src=${c.extractionSource} [${c.vendorName ?? '—'}/${c.matchReason}]  ${c.preview.fileName}`),
  );

  // ── PENDING REVIEW (all, with sender + attachment) ──
  console.log(`\n  PENDING REVIEW / דורש בדיקה (${scan.pendingReview?.length ?? 0})`);
  (scan.pendingReview ?? []).forEach((c: any, i: number) => {
    const flag = c.needsOCR ? '🖼️OCR' : c.linkedInvoice ? '🔗link' : c.attachments?.length ? '📎pdf' : '—';
    const who = c.vendorName ? `[${c.vendorName}]` : `<${c.fromEmail}>`;
    console.log(`    ${String(i + 1).padStart(2)}. ${money(c).padEnd(11)} src=${c.extractionSource} ${flag.padEnd(6)} ${who}  "${(c.subject ?? '').slice(0, 50)}"`);
  });

  // ── UNMATCHED invoice-like senders (candidates for catalog aliases) ──
  console.log('\n  ⭐ UNMATCHED invoice-like senders → missing catalog aliases?');
  const unmatched = (scan.pendingReview ?? []).filter((c: any) => !c.vendorName);
  const bySender: Record<string, { n: number; pdf: number; sample: string }> = {};
  unmatched.forEach((c: any) => {
    const d = (c.fromEmail || '').split('@')[1] || c.fromEmail || '?';
    if (!bySender[d]) bySender[d] = { n: 0, pdf: 0, sample: c.subject };
    bySender[d].n++; if (c.attachments?.length) bySender[d].pdf++;
  });
  Object.entries(bySender).sort((a, b) => b[1].n - a[1].n).forEach(([d, v]) =>
    console.log(`    ${d.padEnd(24)} ×${v.n} (pdf:${v.pdf})  e.g. "${(v.sample || '').slice(0, 45)}"`));

  // ── SKIPPED reasons histogram ──
  console.log('\n  SKIPPED (reason histogram)');
  const hist: Record<string, number> = {};
  (scan.skipped ?? []).forEach((sk: any) => (hist[sk.reason] = (hist[sk.reason] ?? 0) + 1));
  Object.entries(hist).forEach(([r, n]) => line(r, n));

  // ── CAPTURE report + read-back ──
  if (scan.capture) {
    const cap = scan.capture;
    console.log('\n  ⭐ CAPTURE');
    line('requested/effective', `${cap.requested} / ${cap.effective}`);
    line('writeEnabled', cap.writeEnabled);
    line('importBatchId', cap.importBatchId);
    const byAction: Record<string, number> = {};
    cap.items.forEach((i: any) => (byAction[i.action] = (byAction[i.action] ?? 0) + 1));
    line('actions', JSON.stringify(byAction));
    cap.items.forEach((i: any) =>
      console.log(
        `    ${i.action.padEnd(11)} ${String(i.amountGross).padEnd(7)} ${i.currency}  ${i.period}/${i.fileName}` +
          `${i.txId ? '  tx=' + i.txId : ''}${i.error ? '  ERR=' + i.error : ''}`,
      ),
    );

    if (MODE === 'live') {
      console.log('\n  ⭐ READ-BACK VERIFICATION');
      const batch = await db.collection('transactions').where('importBatchId', '==', cap.importBatchId).get();
      const written = batch.docs.map((d) => d.data() as any);
      line('written in batch', `${written.length}  (expect ${scan.candidates.length})`);
      const foreign = written.filter((t) => t.currency !== 'ILS');
      const foreignBad = foreign.filter((t) => t.amountNet !== null || t.vatAmount !== null);
      line('foreign net=null', !foreign.length ? '(none)' : foreignBad.length === 0 ? `✓ all ${foreign.length}` : `✗ ${foreignBad.length} bad`);
      const ils = written.filter((t) => t.currency === 'ILS');
      line('ILS net derived', !ils.length ? '(none)' : ils.every((t) => typeof t.amountNet === 'number') ? `✓ all ${ils.length}` : '✗ some missing');
      line('all approval=pending', written.every((t) => t.approval === 'pending') ? '✓' : '✗');
      const pendingIds = (scan.pendingReview ?? []).map((c: any) => c.messageId).filter(Boolean);
      let pendingWritten = 0;
      for (const mid of pendingIds) {
        const q = await db.collection('transactions').where('sourceRef', '==', mid).limit(1).get();
        if (!q.empty) pendingWritten++;
      }
      line('pending NOT written', `${pendingWritten === 0 ? '✓' : '✗'} ${pendingWritten}/${pendingIds.length} have a tx (expect 0)`);
    }
  }

  console.log('\n════════════════════ END ════════════════════');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
