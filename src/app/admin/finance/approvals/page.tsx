'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  Loader2, X, Check, Ban, FileText, RefreshCw, ExternalLink, Wallet, Table2,
} from 'lucide-react';
import Link from 'next/link';
import type { Transaction } from '@/features/admin/services/finance/transaction.types';
import { deriveVatFields } from '@/features/admin/services/finance/transaction.types';
import {
  listTransactions, patchTransaction, fmtMoney,
  EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, CURRENCIES, SOURCE_LABEL,
} from '@/features/admin/services/finance/transaction.client';

export default function FinanceApprovalsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/authority-login'); return; }
      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isSystemAdmin) { router.push('/admin'); return; }
        const profile = await getUserFromFirestore(user.uid);
        setAdminName((profile as any)?.core?.name || user.email || '');
        setAuthorized(true);
        void load();
      } catch { router.push('/admin'); } finally { setCheckingAuth(false); }
    });
    return () => unsub();
  }, [router]);

  const load = async () => {
    setLoading(true);
    try { setPending(await listTransactions({ approval: 'pending' })); }
    catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    finally { setLoading(false); }
  };

  const removeRow = (id: string) => {
    setPending((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => (prev?.id === id ? null : prev));
  };

  const handleApprove = async (t: Transaction, patch?: Partial<Transaction>, invoiceNumber?: string) => {
    setProcessingId(t.id);
    try { await patchTransaction(t.id, { approval: 'approved', reviewedBy: adminName, patch, invoiceNumber }); removeRow(t.id); }
    catch (e: any) { alert('שגיאה באישור: ' + e.message); }
    finally { setProcessingId(null); }
  };

  const handleReject = async (t: Transaction) => {
    const reason = window.prompt('סיבת הדחייה (אופציונלי, יירשם):');
    if (reason === null) return;
    setProcessingId(t.id);
    try { await patchTransaction(t.id, { approval: 'rejected', reviewedBy: adminName, rejectionReason: reason }); removeRow(t.id); }
    catch (e: any) { alert('שגיאה בדחייה: ' + e.message); }
    finally { setProcessingId(null); }
  };

  const handleSaveEdit = async (t: Transaction, patch: Partial<Transaction>, invoiceNumber?: string) => {
    setProcessingId(t.id);
    try {
      const updated = await patchTransaction(t.id, { patch, invoiceNumber });
      setPending((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
      setSelected(updated);
    } catch (e: any) { alert('שגיאה בשמירה: ' + e.message); }
    finally { setProcessingId(null); }
  };

  if (checkingAuth) return <FullLoader />;
  if (!authorized) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6">
      <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">תור אישור חשבוניות</h1>
            <p className="text-sm text-slate-500">{pending.length} ממתינות לאישור · אישור מכניס לספר ההוצאות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/finance/expenses" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50">
            <Table2 className="w-4 h-4" /> ספר הוצאות
          </Link>
          <button onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
        </div>
      </header>

      {loading ? (
        <FullLoader />
      ) : pending.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">אין חשבוניות ממתינות</p>
          <p className="text-sm text-slate-400 mt-1">כל מה שהסוכן קלט אושר או נדחה.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((t) => (
            <PendingRow key={t.id} t={t} processing={processingId === t.id}
              onOpen={() => setSelected(t)} onApprove={() => handleApprove(t)} onReject={() => handleReject(t)} />
          ))}
        </div>
      )}

      {selected && (
        <ReviewDrawer tx={selected} processing={processingId === selected.id}
          onClose={() => setSelected(null)}
          onApprove={handleApprove} onReject={handleReject} onSave={handleSaveEdit} />
      )}
    </div>
  );
}

function FullLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
    </div>
  );
}

function PendingRow({ t, processing, onOpen, onApprove, onReject }: {
  t: Transaction; processing: boolean; onOpen: () => void; onApprove: () => void; onReject: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 flex items-center gap-3 hover:border-emerald-200 transition-colors">
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 text-right min-w-0">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 truncate">{t.vendorOrClient}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-slate-500 shrink-0">{SOURCE_LABEL[t.source] ?? t.source}</span>
          </div>
          <div className="text-xs text-slate-500 truncate">{t.category} · {t.period}{t.invoice?.invoiceNumber ? ` · #${t.invoice.invoiceNumber}` : ''}</div>
        </div>
        <div className="text-lg font-black text-slate-900 shrink-0">{fmtMoney(t.amountGross, t.currency)}</div>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <button disabled={processing} onClick={onApprove} title="אשר"
          className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50">
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
        </button>
        <button disabled={processing} onClick={onReject} title="דחה"
          className="w-9 h-9 rounded-xl bg-white border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 disabled:opacity-50">
          <Ban className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewDrawer({ tx, processing, onClose, onApprove, onReject, onSave }: {
  tx: Transaction; processing: boolean; onClose: () => void;
  onApprove: (t: Transaction, patch?: Partial<Transaction>, invoiceNumber?: string) => void;
  onReject: (t: Transaction) => void;
  onSave: (t: Transaction, patch: Partial<Transaction>, invoiceNumber?: string) => void;
}) {
  const [vendorOrClient, setVendor] = useState(tx.vendorOrClient);
  const [amountGross, setAmount] = useState<number>(tx.amountGross);
  const [currency, setCurrency] = useState(tx.currency);
  const [category, setCategory] = useState(tx.category);
  const [paymentMethod, setMethod] = useState(tx.paymentMethod);
  const [status, setStatus] = useState(tx.status);
  const [period, setPeriod] = useState(tx.period);
  const [vatApplicable, setVat] = useState(tx.vatApplicable);
  const [invoiceNumber, setInvNum] = useState(tx.invoice?.invoiceNumber ?? '');
  const [notes, setNotes] = useState(tx.notes ?? '');

  const derived = deriveVatFields({ amountGross: Number(amountGross) || 0, currency, vatApplicable });

  const buildPatch = (): Partial<Transaction> => ({
    vendorOrClient, amountGross: Number(amountGross) || 0, currency, category,
    paymentMethod, status, period, vatApplicable, notes,
  });

  const previewUrl = tx.invoice?.driveFileId ? `https://drive.google.com/file/d/${tx.invoice.driveFileId}/preview` : null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div dir="rtl" className="fixed top-0 bottom-0 left-0 z-[81] w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-black text-slate-900 truncate">{tx.vendorOrClient}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* PDF preview */}
          {previewUrl ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              <iframe src={previewUrl} className="w-full h-72" title="חשבונית" />
              {tx.invoice?.driveUrl && (
                <a href={tx.invoice.driveUrl} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 border-t border-gray-200">
                  <ExternalLink className="w-4 h-4" /> פתח חשבונית במסך מלא
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-slate-400">אין קובץ חשבונית מצורף</div>
          )}

          {/* Editable fields */}
          <Field label="ספק / לקוח"><input value={vendorOrClient} onChange={(e) => setVendor(e.target.value)} className={inputCls} /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="סכום (כולל מע״מ)"><input type="number" step="0.01" value={amountGross} onChange={(e) => setAmount(Number(e.target.value))} className={inputCls} /></Field>
            <Field label="מטבע">
              <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="קטגוריה">
              <select value={category} onChange={(e) => setCategory(e.target.value as any)} className={inputCls}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="אמצעי תשלום">
              <select value={paymentMethod} onChange={(e) => setMethod(e.target.value as any)} className={inputCls}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="סטטוס תשלום">
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="חודש שיוך"><input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" className={inputCls} /></Field>
          </div>

          <Field label="מספר חשבונית"><input value={invoiceNumber} onChange={(e) => setInvNum(e.target.value)} className={inputCls} /></Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={vatApplicable} onChange={(e) => setVat(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            חייב מע״מ
          </label>

          {/* Derived net/VAT preview */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm grid grid-cols-3 gap-2 text-center">
            <div><div className="text-slate-400 text-xs">ללא מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.amountNet, currency)}</div></div>
            <div><div className="text-slate-400 text-xs">מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.vatAmount, currency)}</div></div>
            <div><div className="text-slate-400 text-xs">כולל</div><div className="font-bold text-slate-900">{fmtMoney(Number(amountGross) || 0, currency)}</div></div>
          </div>

          <Field label="הערות"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 p-4 flex items-center gap-2">
          <button disabled={processing} onClick={() => onApprove(tx, buildPatch(), invoiceNumber)}
            className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50">
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} אשר → ספר הוצאות
          </button>
          <button disabled={processing} onClick={() => onSave(tx, buildPatch(), invoiceNumber)}
            className="h-11 px-4 rounded-xl bg-white border border-gray-200 text-slate-700 font-bold hover:bg-gray-50 disabled:opacity-50">שמור</button>
          <button disabled={processing} onClick={() => onReject(tx)}
            className="h-11 px-4 rounded-xl bg-white border border-red-200 text-red-600 font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5">
            <Ban className="w-4 h-4" /> דחה
          </button>
        </div>
      </div>
    </>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-400 bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
