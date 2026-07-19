'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  Loader2, X, Check, Ban, FileText, RefreshCw, ExternalLink, Wallet, Table2, Mail, Search, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import type { Transaction } from '@/features/admin/services/finance/transaction.types';
import { deriveVatFields } from '@/features/admin/services/finance/transaction.types';
import {
  listTransactions, patchTransaction, runScan, getLastScan, fmtMoney,
  EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, CURRENCIES, SOURCE_LABEL,
} from '@/features/admin/services/finance/transaction.client';

export default function FinanceApprovalsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<'ready' | 'review'>('ready');
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);

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
    try { setPending(await listTransactions({ approval: 'pending', limit: 1000 })); }
    catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    finally { setLoading(false); }
  };

  const ready = useMemo(() => pending.filter((t) => !t.needsReview), [pending]);
  const review = useMemo(() => pending.filter((t) => t.needsReview), [pending]);
  const rows = tab === 'ready' ? ready : review;

  const removeRow = (id: string) => {
    setPending((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => (prev?.id === id ? null : prev));
  };

  const handleApprove = async (t: Transaction, patch?: Partial<Transaction>, invoiceNumber?: string) => {
    if (t.needsReview && (!patch?.amountGross || patch.amountGross <= 0)) { alert('יש להזין סכום לפני אישור'); return; }
    setProcessingId(t.id);
    try {
      await patchTransaction(t.id, { approval: 'approved', reviewedBy: adminName, patch: { ...patch, needsReview: false }, invoiceNumber });
      removeRow(t.id);
    } catch (e: any) { alert('שגיאה באישור: ' + e.message); }
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
      <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center"><Wallet className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">תור אישור חשבוניות</h1>
            <p className="text-sm text-slate-500">{ready.length} מוכנות · {review.length} דורשות בדיקה</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowScan(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600">
            <Mail className="w-4 h-4" /> סרוק מייל
          </button>
          <Link href="/admin/finance/expenses" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50"><Table2 className="w-4 h-4" /> ספר הוצאות</Link>
          <button onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-700 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> רענן</button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1 mb-4 w-fit">
        <TabBtn active={tab === 'ready'} onClick={() => setTab('ready')} label="מוכנות לאישור" count={ready.length} />
        <TabBtn active={tab === 'review'} onClick={() => setTab('review')} label="דורש בדיקה" count={review.length} warn />
      </div>

      {loading ? <FullLoader /> : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">{tab === 'ready' ? 'אין חשבוניות ממתינות לאישור' : 'אין פריטים שדורשים בדיקה'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <PendingRow key={t.id} t={t} processing={processingId === t.id}
              onOpen={() => setSelected(t)} onApprove={() => handleApprove(t)} onReject={() => handleReject(t)} />
          ))}
        </div>
      )}

      {selected && (
        <ReviewDrawer tx={selected} processing={processingId === selected.id}
          onClose={() => setSelected(null)} onApprove={handleApprove} onReject={handleReject} onSave={handleSaveEdit} />
      )}
      {showScan && <ScanPanel onClose={() => setShowScan(false)} onDone={() => { setShowScan(false); void load(); }} />}
    </div>
  );
}

function TabBtn({ active, onClick, label, count, warn }: { active: boolean; onClick: () => void; label: string; count: number; warn?: boolean }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${active ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-md ${warn && count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-slate-600'}`}>{count}</span>
    </button>
  );
}

function FullLoader() {
  return <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>;
}

function PendingRow({ t, processing, onOpen, onApprove, onReject }: {
  t: Transaction; processing: boolean; onOpen: () => void; onApprove: () => void; onReject: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 flex items-center gap-3 hover:border-emerald-200 transition-colors">
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 text-right min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.needsReview ? 'bg-amber-50' : 'bg-gray-100'}`}>
          {t.needsReview ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <FileText className="w-5 h-5 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 truncate">{t.vendorOrClient}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-slate-500 shrink-0">{SOURCE_LABEL[t.source] ?? t.source}</span>
          </div>
          <div className="text-xs text-slate-500 truncate">{t.category} · {t.period}{t.invoice?.invoiceNumber ? ` · #${t.invoice.invoiceNumber}` : ''}</div>
        </div>
        <div className="text-lg font-black text-slate-900 shrink-0">{t.needsReview && !(t.amountGross > 0) ? '—' : fmtMoney(t.amountGross, t.currency)}</div>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <button disabled={processing} onClick={onApprove} title="אשר"
          className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50">
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
        </button>
        <button disabled={processing} onClick={onReject} title="דחה"
          className="w-9 h-9 rounded-xl bg-white border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 disabled:opacity-50"><Ban className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function ScanPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [mode, setMode] = useState<'since' | 'preset' | 'custom'>('since');
  const [presetDays, setPresetDays] = useState(30);
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { void getLastScan().then((m) => { setLastScanAt(m.lastScanAt); setWriteEnabled(m.writeEnabled); }).catch(() => {}); }, []);

  const sinceDays = useMemo(() => {
    if (!lastScanAt) return 45;
    const d = Math.ceil((Date.now() - new Date(lastScanAt).getTime()) / 86400000) + 3; // +3 overlap
    return Math.max(3, Math.min(d, 400));
  }, [lastScanAt]);

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const opts: any = { capture: 'live' };
      if (mode === 'since') opts.days = sinceDays;
      else if (mode === 'preset') opts.days = presetDays;
      else { if (after) opts.after = after; if (before) opts.before = before; if (!after && !before) opts.days = 30; }
      const r = await runScan(opts);
      setResult(r);
    } catch (e: any) { setResult({ error: e.message }); }
    finally { setRunning(false); }
  };

  const cap = result?.capture;
  const written = cap?.items?.filter((i: any) => i.action === 'written') ?? [];
  const dupes = cap?.items?.filter((i: any) => i.action === 'duplicate') ?? [];
  const nr = written.filter((i: any) => i.needsReview);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={running ? undefined : onClose} />
      <div dir="rtl" className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2"><Search className="w-5 h-5 text-emerald-600" /> סריקת חשבוניות מהמייל</h2>
            <button onClick={onClose} disabled={running} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
          <div className="p-5 space-y-4">
            {!writeEnabled && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2.5">⚠️ FINANCE_WRITE_ENABLED לא מוגדר — הסריקה תרוץ אבל לא תכתוב.</p>}
            <div className="space-y-2">
              <RadioRow checked={mode === 'since'} onClick={() => setMode('since')} label={`מאז הסריקה האחרונה${lastScanAt ? ` (~${sinceDays} ימים + חפיפה)` : ' (45 ימים)'}`} />
              <RadioRow checked={mode === 'preset'} onClick={() => setMode('preset')} label="טווח קבוע">
                {mode === 'preset' && (
                  <div className="flex gap-1.5 mt-2">
                    {[7, 30, 90, 180].map((d) => (
                      <button key={d} onClick={() => setPresetDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${presetDays === d ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-slate-600'}`}>{d} ימים</button>
                    ))}
                  </div>
                )}
              </RadioRow>
              <RadioRow checked={mode === 'custom'} onClick={() => setMode('custom')} label="טווח מותאם">
                {mode === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-xs text-slate-500">מ־<input type="date" value={after} onChange={(e) => setAfter(e.target.value)} className="w-full mt-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
                    <label className="text-xs text-slate-500">עד<input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="w-full mt-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
                  </div>
                )}
              </RadioRow>
            </div>
            <p className="text-xs text-slate-400">דה-דופ לפי Message-ID מבטיח שאין כפילות גם בחפיפה. חשבוניות חדשות ננחתות בתור.</p>

            {result && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                {result.error ? <div className="text-red-600 font-bold">שגיאה: {result.error}</div> : (
                  <>
                    <div className="font-bold text-slate-800">נסרקו {result.stats?.threadsScanned} · זוהו {result.stats?.invoiceLike} כחשבונית</div>
                    <div className="text-emerald-700 font-bold">✓ נכתבו {written.length} ({nr.length} דורש בדיקה) · {dupes.length} כפילויות</div>
                    <div className="text-slate-500">דילג {result.skipped?.length} (רעש/הכנסה/הצעות מחיר)</div>
                    {!cap?.writeEnabled && <div className="text-amber-600">מצב תצוגה בלבד — לא נכתב.</div>}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 p-4 flex gap-2">
            <button disabled={running} onClick={run} className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50">
              {running ? <><Loader2 className="w-5 h-5 animate-spin" /> סורק… (עד ~2 דק')</> : <><Search className="w-5 h-5" /> הרץ סריקה</>}
            </button>
            <button onClick={result ? onDone : onClose} disabled={running} className="h-11 px-4 rounded-xl bg-white border border-gray-200 text-slate-700 font-bold hover:bg-gray-50 disabled:opacity-50">{result ? 'סגור ורענן' : 'ביטול'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function RadioRow({ checked, onClick, label, children }: { checked: boolean; onClick: () => void; label: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 cursor-pointer ${checked ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200'}`} onClick={onClick}>
      <div className="flex items-center gap-2">
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${checked ? 'border-emerald-500' : 'border-gray-300'}`}>{checked && <div className="w-2 h-2 rounded-full bg-emerald-500" />}</div>
        <span className="text-sm font-bold text-slate-700">{label}</span>
      </div>
      {children}
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
  const [amountGross, setAmount] = useState<number>(tx.amountGross || 0);
  const [currency, setCurrency] = useState(tx.currency);
  const [category, setCategory] = useState(tx.category);
  const [paymentMethod, setMethod] = useState(tx.paymentMethod);
  const [status, setStatus] = useState(tx.status);
  const [period, setPeriod] = useState(tx.period);
  const [vatApplicable, setVat] = useState(tx.vatApplicable);
  const [invoiceNumber, setInvNum] = useState(tx.invoice?.invoiceNumber ?? '');
  const [notes, setNotes] = useState(tx.notes ?? '');

  const derived = deriveVatFields({ amountGross: Number(amountGross) || 0, currency, vatApplicable });
  const buildPatch = (): Partial<Transaction> => ({ vendorOrClient, amountGross: Number(amountGross) || 0, currency, category, paymentMethod, status, period, vatApplicable, notes });
  const previewUrl = tx.invoice?.driveFileId ? `https://drive.google.com/file/d/${tx.invoice.driveFileId}/preview` : null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div dir="rtl" className="fixed top-0 bottom-0 left-0 z-[81] w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-black text-slate-900 truncate flex items-center gap-2">
            {tx.needsReview && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}{tx.vendorOrClient}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tx.needsReview && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2.5">הסכום לא חולץ אוטומטית — פתח את החשבונית, הזן סכום, ואשר.</p>}
          {previewUrl ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              <iframe src={previewUrl} className="w-full h-72" title="חשבונית" />
              {tx.invoice?.driveUrl && <a href={tx.invoice.driveUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 border-t border-gray-200"><ExternalLink className="w-4 h-4" /> פתח חשבונית במסך מלא</a>}
            </div>
          ) : tx.sourceUrl ? (
            <a href={tx.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
              <Mail className="w-4 h-4" /> פתח מייל מקור (החשבונית בלינק)
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-slate-400">אין קובץ חשבונית מצורף</div>
          )}

          <Field label="ספק / לקוח"><input value={vendorOrClient} onChange={(e) => setVendor(e.target.value)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="סכום (כולל מע״מ)"><input type="number" step="0.01" value={amountGross || ''} onChange={(e) => setAmount(Number(e.target.value))} className={`${inputCls} ${tx.needsReview && !(amountGross > 0) ? 'border-amber-300 bg-amber-50/40' : ''}`} /></Field>
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
          <Field label="מספר חשבונית"><input value={invoiceNumber} onChange={(e) => setInvNum(e.target.value)} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={vatApplicable} onChange={(e) => setVat(e.target.checked)} className="w-4 h-4 accent-emerald-600" /> חייב מע״מ</label>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm grid grid-cols-3 gap-2 text-center">
            <div><div className="text-slate-400 text-xs">ללא מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.amountNet, currency)}</div></div>
            <div><div className="text-slate-400 text-xs">מע״מ</div><div className="font-bold text-slate-800">{fmtMoney(derived.vatAmount, currency)}</div></div>
            <div><div className="text-slate-400 text-xs">כולל</div><div className="font-bold text-slate-900">{fmtMoney(Number(amountGross) || 0, currency)}</div></div>
          </div>
          <Field label="הערות"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
        </div>

        <div className="border-t border-gray-100 p-4 flex items-center gap-2">
          <button disabled={processing} onClick={() => onApprove(tx, buildPatch(), invoiceNumber)} className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50">
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} אשר → ספר הוצאות
          </button>
          <button disabled={processing} onClick={() => onSave(tx, buildPatch(), invoiceNumber)} className="h-11 px-4 rounded-xl bg-white border border-gray-200 text-slate-700 font-bold hover:bg-gray-50 disabled:opacity-50">שמור</button>
          <button disabled={processing} onClick={() => onReject(tx)} className="h-11 px-4 rounded-xl bg-white border border-red-200 text-red-600 font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"><Ban className="w-4 h-4" /> דחה</button>
        </div>
      </div>
    </>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-400 bg-white';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold text-slate-500 mb-1">{label}</span>{children}</label>;
}
