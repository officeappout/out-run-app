/**
 * PATCH  /api/admin/finance/transactions/[id]
 *   Body: { approval?: 'approved'|'rejected', rejectionReason?, reviewedBy?, patch?: {editable fields} }
 *   Edits fields and/or approves/rejects. Net/VAT are re-derived server-side
 *   whenever amount / currency / vatApplicable change — never trusted from client.
 *
 * DELETE /api/admin/finance/transactions/[id]
 *   Remove a transaction (e.g. batch rollback / cleanup).
 *
 * Auth: requireAdminApi (agent key or admin session cookie).
 */
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { deriveVatFields, type Transaction } from '@/features/admin/services/finance/transaction.types';

const COLLECTION = 'transactions';

// Fields a human may edit in the review UI (whitelist — no mass assignment).
const EDITABLE: (keyof Transaction)[] = [
  'vendorOrClient', 'vendorId', 'category', 'title', 'amountGross', 'currency',
  'vatApplicable', 'paymentMethod', 'expenseNature', 'status', 'period', 'notes', 'needsReview',
];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: {
    approval?: 'approved' | 'rejected';
    rejectionReason?: string;
    reviewedBy?: string;
    invoiceNumber?: string;
    patch?: Partial<Transaction>;
  } = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }

  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const current = snap.data() as Transaction;

    const update: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };

    // Apply whitelisted field edits.
    if (body.patch) {
      for (const key of EDITABLE) {
        if (key in body.patch && body.patch[key] !== undefined) update[key] = body.patch[key];
      }
    }
    if (body.invoiceNumber !== undefined) {
      update['invoice.invoiceNumber'] = body.invoiceNumber;
    }

    // Re-derive net/VAT if any money input changed.
    const amountGross = (update.amountGross ?? current.amountGross) as number;
    const currency = (update.currency ?? current.currency) as Transaction['currency'];
    const vatApplicable = (update.vatApplicable ?? current.vatApplicable) as boolean;
    if (['amountGross', 'currency', 'vatApplicable'].some((k) => k in update)) {
      const { amountNet, vatAmount } = deriveVatFields({ amountGross, currency, vatApplicable });
      update.amountNet = amountNet;
      update.vatAmount = vatAmount;
    }

    // Approve / reject.
    if (body.approval === 'approved' || body.approval === 'rejected') {
      update.approval = body.approval;
      update.reviewedBy = body.reviewedBy ?? 'admin';
      update.reviewedAt = FieldValue.serverTimestamp();
      if (body.approval === 'rejected' && body.rejectionReason) update.rejectionReason = body.rejectionReason;
    }

    await ref.update(update);
    const after = await ref.get();
    return NextResponse.json({ ok: true, transaction: { id: after.id, ...after.data() } });
  } catch (err: any) {
    console.error('[finance/transactions PATCH]', err);
    return NextResponse.json({ error: err?.message ?? 'update error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    await getAdminDb().collection(COLLECTION).doc(params.id).delete();
    return NextResponse.json({ ok: true, id: params.id });
  } catch (err: any) {
    console.error('[finance/transactions DELETE]', err);
    return NextResponse.json({ error: err?.message ?? 'delete error' }, { status: 500 });
  }
}
