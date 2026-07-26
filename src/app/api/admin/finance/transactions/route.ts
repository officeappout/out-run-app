/**
 * GET  /api/admin/finance/transactions?approval=&period=&type=&limit=
 *   List transactions (newest first). Filters applied in-memory to avoid
 *   composite-index setup at this volume.
 *
 * POST /api/admin/finance/transactions
 *   Manual expense entry (no PDF) — e.g. software house / loan / accountant.
 *   Human-entered ⇒ approval='approved', source='manual'. Net/VAT derived server-side.
 *
 * Financial data is admin-SDK only — never read/written from the client Firestore
 * SDK. Auth: requireAdminApi (agent key or admin session cookie).
 */
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  deriveVatFields,
  directionForType,
  periodKey,
  type Transaction,
} from '@/features/admin/services/finance/transaction.types';

const COLLECTION = 'transactions';

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const approval = url.searchParams.get('approval') ?? 'all';
  const period = url.searchParams.get('period') ?? '';
  const type = url.searchParams.get('type') ?? '';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 500), 1000);

  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
    let rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }));
    if (approval !== 'all') rows = rows.filter((r) => r.approval === approval);
    if (period) rows = rows.filter((r) => r.period === period);
    if (type) rows = rows.filter((r) => r.type === type);
    return NextResponse.json({ transactions: rows, count: rows.length });
  } catch (err: any) {
    console.error('[finance/transactions GET]', err);
    return NextResponse.json({ error: err?.message ?? 'list error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: Partial<Transaction> = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }

  if (body.amountGross == null || !Number.isFinite(body.amountGross)) {
    return NextResponse.json({ error: 'amountGross is required' }, { status: 400 });
  }
  if (!body.vendorOrClient) {
    return NextResponse.json({ error: 'vendorOrClient is required' }, { status: 400 });
  }

  try {
    const { Timestamp } = await import('firebase-admin/firestore');
    const db = getAdminDb();
    // admin Timestamp ≠ the client Timestamp the Transaction type refers to — the
    // stored shape is identical, so treat it loosely at the write boundary.
    const now: any = Timestamp.now();

    const type: Transaction['type'] = body.type === 'income' ? 'income' : 'expense';
    const currency: Transaction['currency'] = body.currency ?? 'ILS';
    const vatApplicable = body.vatApplicable ?? true;
    const amountGross = body.amountGross;
    const { amountNet, vatAmount } = deriveVatFields({ amountGross, currency, vatApplicable });

    const ref = db.collection(COLLECTION).doc();
    const tx: Transaction = {
      id: ref.id,
      type,
      direction: directionForType(type),
      vendorOrClient: body.vendorOrClient,
      vendorId: body.vendorId,
      category: body.category ?? 'אחר',
      title: body.title ?? body.vendorOrClient,
      currency,
      amountGross,
      amountNet,
      vatAmount,
      vatApplicable,
      paymentMethod: body.paymentMethod ?? 'אשראי',
      expenseNature: body.expenseNature,
      status: body.status ?? 'שולם',
      period: body.period ?? periodKey(new Date()),
      invoice: { status: body.invoice?.status ?? 'חסר', invoiceNumber: body.invoice?.invoiceNumber },
      source: 'manual',
      approval: 'approved', // human-entered ⇒ straight to the ledger
      notes: body.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(stripUndefined(tx));
    return NextResponse.json({ ok: true, transaction: tx });
  } catch (err: any) {
    console.error('[finance/transactions POST]', err);
    return NextResponse.json({ error: err?.message ?? 'create error' }, { status: 500 });
  }
}

/** Firestore rejects undefined — drop undefined keys (plain objects only). */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const isPlain = (v: any) => v != null && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) ? stripUndefined(v) : v;
  }
  return out as T;
}
