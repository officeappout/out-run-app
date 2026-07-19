'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { Loader2, Wallet, Plus, RefreshCw, Clock, X, Check, ExternalLink, FileWarning, FileSpreadsheet, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import type { Transaction } from '@/features/admin/services/finance/transaction.types';
import { deriveVatFields, periodKey } from '@/features/admin/services/finance/transaction.types';
import {
  listTransactions, createTransaction, generatePacket, fmtMoney,
  EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, CURRENCIES, SOURCE_LABEL,
} from '@/features/admin/services/finance/transaction.client';

export default function FinanceExpensesPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [packet, setPacket] = useState<Awaited<ReturnType<typeof generatePacket>> | null>(null);

  const genPacket = async () => {
    if (period === 'all') { alert('בחר חודש ספציפי כדי להפיק ריכוז'); return; }
    setGenerating(true);
    try { setPacket(await generatePacket(period)); }
    catch (e: any) { alert('שגיאה בהפקת ריכוז: ' + e.message); }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/authority-login'); return; }
      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isSystemAdmin) { router.push('/admin'); return; }
        await getUserFromFirestore(user.uid);
        setAuthorized(true);
        void load();
      } catch { router.push('/admin'); } finally { setCheckingAuth(false); }
    });
    return () => unsub();
  }, [router]);

  const load = async () => {
    setLoading(true);
    try { setRows(await listTransactions({ approval: 'approved', type: 'expense', limit: 1000 })); }
    catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    finally { setLoading(false); }
  };

  const periods = useMemo(
    () => Array.from(new Set(rows.map((r) => r.period))).sort().reverse(),
    [rows],
  );
  const filtered = useMemo(
    () => (period === 'all' ? rows : rows.filter((r) => r.period === period)),
    [rows, period],
  );

  const summary = useMemo(() => {
    let ilsGross = 0, ilsNet = 0, ilsVat = 0, missing = 0;
    const foreign: Record<string, number> = {};
    for (const r of filtered) {
      if (r.currency === 'ILS') {
        ilsGross += r.amountGross;
        ilsNet += r.amountNet ?? 0;
        ilsVat += r.vatAmount ?? 0;
      } else {
        foreign[r.currency] = (foreign[r.currency] ?? 0) + r.amountGross;
      }
      if (!r.invoice?.driveFileId) missing++;
    }
    return { ilsGross, ilsNet, ilsVat, missing, foreign, count: filtered.length };
  }, [filtered]);

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
            <h1 className="text-2xl font-black text-slate-900">ספר הוצאות</h1>
            <p className="text-sm text-slate-500">{filtered.length} תנועות מאושרות{period !== 'all' ? ` · ${period}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700">
            <option value="all">כל החודשים</option>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Link href="/admin/finance/approvals" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50">
            <Clock className="w-4 h-4" /> תור אישור
          </Link>
          <button onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
          <button onClick={genPacket} disabled={generating || period === 'all'} title={period === 'all' ? 'בחר חודש' : `ריכוז ${period}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} ריכוז לרו״ח
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600">
            <Plus className="w-4 h-4" /> הוסף הוצאה ידנית
          </button>
        </div>
      </header>

      {loading ? <FullLoader /> : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['ספק', 'קטגוריה', 'אמצעי', 'כולל מע״מ', 'ללא מע״מ', 'מע״מ', 'סטטוס', 'חשבונית', 'חודש', 'מקור'].map((h) => (
                    <th key={h} className="text-right py-2.5 px-3 font-bold text-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-slate-400">אין תנועות מאושרות{period !== 'all' ? ' בחודש זה' : ''}.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">{r.vendorOrClient}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{r.category}</td>
                    <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{r.paymentMethod}</td>
                    <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">{fmtMoney(r.amountGross, r.currency)}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{fmtMoney(r.amountNet, r.currency)}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{fmtMoney(r.vatAmount, r.currency)}</td>
                    <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{r.status}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {r.invoice?.driveUrl ? (
                        <a href={r.invoice.driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" /> צפה
                        </a>
                      ) : <span className="inline-flex items-center gap-1 text-amber-600"><FileWarning className="w-3.5 h-3.5" /> חסר</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{r.period}</td>
                    <td className="py-2 px-3 whitespace-nowrap"><span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-slate-500">{SOURCE_LABEL[r.source] ?? r.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="border-t-2 border-gray-200 bg-gray-50 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCell label="סה״כ כולל מע״מ (₪)" value={fmtMoney(summary.ilsGross, 'ILS')}
              sub={Object.entries(summary.foreign).map(([c, v]) => fmtMoney(v, c)).join(' · ') || undefined} />
            <SummaryCell label="סה״כ ללא מע״מ (₪)" value={fmtMoney(summary.ilsNet, 'ILS')} />
            <SummaryCell label="מע״מ להחזר (₪)" value={fmtMoney(summary.ilsVat, 'ILS')} accent />
            <SummaryCell label="חשבוניות חסרות" value={String(summary.missing)} warn={summary.missing > 0} />
          </div>
        </div>
      )}

      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); void load(); }} />}
      {packet && <PacketModal packet={packet} onClose={() => setPacket(null)} />}
    </div>
  );
}

function PacketModal({ packet, onClose }: { packet: Awaited<ReturnType<typeof generatePacket>>; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div dir="rtl" className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> ריכוז {packet.period}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-xs text-slate-400">כולל מע״מ</div><div className="font-black text-slate-900">{fmtMoney(packet.summary.ilsGross, 'ILS')}</div></div>
              <div><div className="text-xs text-slate-400">ללא מע״מ</div><div className="font-black text-slate-900">{fmtMoney(packet.summary.ilsNet, 'ILS')}</div></div>
              <div><div className="text-xs text-slate-400">מע״מ להחזר</div><div className="font-black text-emerald-600">{fmtMoney(packet.summary.ilsVat, 'ILS')}</div></div>
            </div>
            <div className="text-sm text-slate-500 text-center">{packet.count} תנועות{packet.summary.missing > 0 ? ` · ${packet.summary.missing} חשבוניות חסרות` : ''}{Object.keys(packet.summary.foreign).length ? ` · מט״ח: ${Object.entries(packet.summary.foreign).map(([c, v]) => fmtMoney(v as number, c)).join(' · ')}` : ''}</div>
            <a href={packet.xlsxUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-500 text-white font-black hover:bg-emerald-600">
              <FileSpreadsheet className="w-5 h-5" /> פתח / הורד XLSX
            </a>
            {packet.monthFolderUrl && (
              <a href={packet.monthFolderUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-slate-700 font-bold hover:bg-gray-50">
                <FolderOpen className="w-5 h-5" /> תיקיית החשבוניות של החודש
              </a>
            )}
            <p className="text-xs text-slate-400 text-center">ה-XLSX נשמר גם ב-Drive: ריכוזים-לרואה-חשבון/. השליחה לרו״ח — ידנית.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryCell({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs font-bold text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-black ${warn ? 'text-amber-600' : accent ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">מט״ח: {sub}</div>}
    </div>
  );
}

function FullLoader() {
  return <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>;
}

function AddExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [vendorOrClient, setVendor] = useState('');
  const [amountGross, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<Transaction['currency']>('ILS');
  const [category, setCategory] = useState<Transaction['category']>('פיתוח');
  const [paymentMethod, setMethod] = useState<Transaction['paymentMethod']>('ספקים');
  const [status, setStatus] = useState<Transaction['status']>('שולם');
  const [period, setPeriod] = useState(periodKey(new Date()));
  const [vatApplicable, setVat] = useState(true);
  const [invoiceNumber, setInvNum] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = Number(amountGross) || 0;
  const derived = deriveVatFields({ amountGross: amount, currency, vatApplicable });

  const submit = async () => {
    if (!vendorOrClient.trim()) { alert('שם ספק חובה'); return; }
    if (!amount || amount <= 0) { alert('סכום חובה'); return; }
    setSaving(true);
    try {
      await createTransaction({
        vendorOrClient: vendorOrClient.trim(), amountGross: amount, currency, category,
        paymentMethod, status, period, vatApplicable, notes,
        invoice: { status: 'חסר', invoiceNumber: invoiceNumber || undefined },
      });
      onCreated();
    } catch (e: any) { alert('שגיאה בשמירה: ' + e.message); setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div dir="rtl" className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
            <h2 className="text-lg font-black text-slate-900">הוספת הוצאה ידנית</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">להוצאות שלא מגיעות כ-PDF במייל (בית תוכנה, הלוואה, רו״ח). נכנס ישר לספר ההוצאות כמאושר.</p>
            <Field label="ספק / לקוח"><input value={vendorOrClient} onChange={(e) => setVendor(e.target.value)} className={inputCls} placeholder="בית תוכנה תחזוקה" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="סכום (כולל מע״מ)"><input type="number" step="0.01" value={amountGross} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
              <Field label="מטבע"><select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className={inputCls}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="קטגוריה"><select value={category} onChange={(e) => setCategory(e.target.value as any)} className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="אמצעי תשלום"><select value={paymentMethod} onChange={(e) => setMethod(e.target.value as any)} className={inputCls}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="סטטוס תשלום"><select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="חודש שיוך"><input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" className={inputCls} /></Field>
            </div>
            <Field label="מספר חשבונית (אופציונלי)"><input value={invoiceNumber} onChange={(e) => setInvNum(e.target.value)} className={inputCls} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={vatApplicable} onChange={(e) => setVat(e.target.checked)} className="w-4 h-4 accent-emerald-600" /> חייב מע״מ
            </label>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm grid grid-cols-3 gap-2 text-center">
              <div><div className="text-slate-400 text-xs">ללא מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.amountNet, currency)}</div></div>
              <div><div className="text-slate-400 text-xs">מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.vatAmount, currency)}</div></div>
              <div><div className="text-slate-400 text-xs">כולל</div><div className="font-bold text-slate-900">{fmtMoney(amount, currency)}</div></div>
            </div>
            <Field label="הערות"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
          </div>
          <div className="border-t border-gray-100 p-4 flex gap-2 sticky bottom-0 bg-white">
            <button disabled={saving} onClick={submit} className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} שמור לספר ההוצאות
            </button>
            <button disabled={saving} onClick={onClose} className="h-11 px-4 rounded-xl bg-white border border-gray-200 text-slate-700 font-bold hover:bg-gray-50">ביטול</button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-400 bg-white';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold text-slate-500 mb-1">{label}</span>{children}</label>;
}
