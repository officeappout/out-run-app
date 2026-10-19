'use client';

/**
 * "מה קלי ישלח היום ולמה" for one user (read-only), and a test send to the admin's OWN
 * account. The API always sends the test to the caller's uid.
 */
import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { TRIGGER_LABEL_HE, proactiveAdminFetch } from './proactive-api';

interface Row {
  trigger: string;
  now: { send: boolean; reason: string };
  atItsHour: { send: boolean; reason: string; text: string | null; actions: string[]; silent: boolean };
}

export default function ProactivePreviewPanel() {
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState<'preview' | 'test' | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [testTrigger, setTestTrigger] = useState('');

  const preview = async () => {
    const v = who.trim();
    if (!v) return;
    setBusy('preview');
    setNote(null);
    const r = await proactiveAdminFetch({ method: 'POST', body: { action: 'preview', ...(v.includes('@') ? { email: v } : { uid: v }) } });
    setBusy(null);
    const p = r.data.preview as { found?: boolean; rows?: Row[]; summary?: Record<string, unknown> } | undefined;
    if (r.status !== 200 || !p?.found) {
      setRows(null);
      setNote(r.status === 404 ? 'משתמש לא נמצא' : 'שגיאה בטעינה');
      return;
    }
    setRows(p.rows ?? []);
    setSummary(p.summary ?? null);
    if (r.data.flagOn !== true) setNote('שימו לב: הודעות יזומות כבויות כרגע (או "קלי אחד" כבוי), אז בפועל לא יישלח כלום.');
  };

  const testSend = async () => {
    setBusy('test');
    setNote(null);
    const r = await proactiveAdminFetch({ method: 'POST', body: { action: 'test_send', trigger: testTrigger || null } });
    setBusy(null);
    if (r.status !== 200) setNote(r.data.error === 'not_enabled' ? 'הדגל כבוי, אין שליחת בדיקה.' : 'שליחת הבדיקה נכשלה');
    else if (r.data.sent) setNote(`נשלח לחשבון שלך (${TRIGGER_LABEL_HE[String(r.data.trigger)] ?? r.data.trigger}): ${String(r.data.text ?? '')}`);
    else setNote(`לא נשלח: ${String(r.data.reason ?? '')}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="uid או אימייל של משתמש"
          className="min-w-[260px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          dir="ltr"
        />
        <button type="button" onClick={() => void preview()} disabled={!!busy} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מה קלי ישלח היום?'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
        <span className="text-sm font-bold text-gray-700">שליחת בדיקה לחשבון שלי:</span>
        <select value={testTrigger} onChange={(e) => setTestTrigger(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
          <option value="">הראשון שמתאים</option>
          {Object.entries(TRIGGER_LABEL_HE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" onClick={() => void testSend()} disabled={!!busy} className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          שלח לי
        </button>
      </div>

      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}

      {rows && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.trigger} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-black">{TRIGGER_LABEL_HE[r.trigger] ?? r.trigger}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.now.send ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  עכשיו: {r.now.send ? 'נשלח' : 'לא'} · {r.now.reason}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.atItsHour.send ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-500'}`}>
                  בשעה שלו: {r.atItsHour.send ? 'נשלח' : 'לא'} · {r.atItsHour.reason}
                </span>
              </div>
              {r.atItsHour.text && (
                <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-snug" dir="rtl">
                  {r.atItsHour.text}
                  {r.atItsHour.actions.length > 0 && <span className="mr-2 font-mono text-[11px] text-gray-400">[{r.atItsHour.actions.join(', ')}]</span>}
                  {r.atItsHour.silent && <span className="mr-2 text-[11px] text-gray-400">(בלי התראה)</span>}
                </p>
              )}
            </div>
          ))}
          {summary && (
            <details className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
              <summary className="cursor-pointer font-bold">נתוני המשתמש שנבדקו</summary>
              <pre className="mt-2 overflow-x-auto" dir="ltr">{JSON.stringify(summary, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
