/**
 * POST /api/admin/finance/packet  { period: 'YYYY-MM' }
 *
 * Builds the monthly accountant packet: an XLSX of that month's APPROVED expenses
 * (per-row + totals), uploads it to Drive ריכוזים-לרואה-חשבון/, and returns links
 * to the XLSX + the month's הוצאות folder — for cross-checking the VAT report the
 * accountant returns. Sending stays manual (WhatsApp/email).
 *
 * Idempotent per month: re-running overwrites that month's XLSX.
 * Auth: requireAdminApi.
 */
import 'server-only';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getCombinedClient, PRIMARY_MAILBOX } from '@/lib/google-service-account';
import {
  FINANCE_ACCOUNTANT_PACKETS_FOLDER_ID,
  FINANCE_EXPENSES_FOLDER_ID,
} from '@/features/admin/services/finance/finance-drive.constants';
import type { Transaction } from '@/features/admin/services/finance/transaction.types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { period?: string } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const period = body.period ?? '';
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period must be YYYY-MM' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection('transactions').orderBy('createdAt', 'desc').limit(2000).get();
    const rows = snap.docs
      .map((d) => d.data() as Transaction)
      .filter((t) => t.approval === 'approved' && t.type === 'expense' && t.period === period);

    // ── Totals (ILS headline; foreign listed separately — VAT refund is ILS-only) ──
    let ilsGross = 0, ilsNet = 0, ilsVat = 0, missing = 0;
    const foreign: Record<string, number> = {};
    for (const t of rows) {
      if (t.currency === 'ILS') { ilsGross += t.amountGross; ilsNet += t.amountNet ?? 0; ilsVat += t.vatAmount ?? 0; }
      else foreign[t.currency] = (foreign[t.currency] ?? 0) + t.amountGross;
      if (!t.invoice?.driveFileId) missing++;
    }

    // ── Build the workbook ──
    const XLSX = await import('xlsx');
    const header = ['חודש', 'ספק', 'מס׳ חשבונית', 'קטגוריה', 'אמצעי', 'מטבע', 'כולל מע״מ', 'ללא מע״מ', 'מע״מ', 'סטטוס', 'חשבונית'];
    const dataRows = rows.map((t) => [
      t.period, t.vendorOrClient, t.invoice?.invoiceNumber ?? '', t.category, t.paymentMethod, t.currency,
      t.amountGross, t.amountNet ?? '', t.vatAmount ?? '', t.status, t.invoice?.driveUrl ? 'קובץ' : 'חסר',
    ]);
    const totals = ['סה״כ (₪)', '', '', '', '', 'ILS', round2(ilsGross), round2(ilsNet), round2(ilsVat), '', `${missing} חסרות`];
    const foreignRows = Object.entries(foreign).map(([c, v]) => [`סה״כ (${c})`, '', '', '', '', c, round2(v), '', '', '', '']);
    const aoa = [header, ...dataRows, [], totals, ...foreignRows];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 9 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, period);
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // ── Upload to Drive ריכוזים-לרואה-חשבון/ (overwrite this month's file) ──
    const { drive } = await getCombinedClient(PRIMARY_MAILBOX);
    const { Readable } = await import('stream');
    const fileName = `${period}__ריכוז-הוצאות.xlsx`;
    const existing = await findFile(drive, FINANCE_ACCOUNTANT_PACKETS_FOLDER_ID, fileName);
    let xlsx;
    if (existing) {
      xlsx = await drive.files.update({
        fileId: existing,
        media: { mimeType: XLSX_MIME, body: Readable.from(buf) },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      });
    } else {
      xlsx = await drive.files.create({
        requestBody: { name: fileName, parents: [FINANCE_ACCOUNTANT_PACKETS_FOLDER_ID] },
        media: { mimeType: XLSX_MIME, body: Readable.from(buf) },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      });
    }

    // ── Link to the month's הוצאות folder ──
    const monthFolderId = await findFolder(drive, FINANCE_EXPENSES_FOLDER_ID, period);
    const monthFolderUrl = monthFolderId ? `https://drive.google.com/drive/folders/${monthFolderId}` : null;

    return NextResponse.json({
      ok: true,
      period,
      count: rows.length,
      xlsxUrl: xlsx.data.webViewLink,
      xlsxFileId: xlsx.data.id,
      monthFolderUrl,
      summary: { ilsGross: round2(ilsGross), ilsNet: round2(ilsNet), ilsVat: round2(ilsVat), missing, foreign },
    });
  } catch (err: any) {
    console.error('[finance/packet]', err);
    return NextResponse.json({ error: err?.message ?? 'packet error' }, { status: 500 });
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

async function findFile(drive: any, folderId: string, name: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safe}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function findFolder(drive: any, parentId: string, name: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}
