'use client';

import { CheckCircle2, CircleDashed, CircleAlert, PenLine } from 'lucide-react';
import type { DashboardPayload } from '@/lib/costs/dashboard';
import { CONNECTOR_BY_ID } from '@/lib/costs/connector-meta';
import { fmtMoney } from './costs-client';

type View = DashboardPayload['connectors'][number];

function state(c: View): { tone: string; icon: React.ReactNode; text: string } {
  const meta = CONNECTOR_BY_ID[c.id];
  if (c.id === 'mapbox') return { tone: 'text-slate-500', icon: <PenLine size={14} aria-hidden />, text: 'ידני' };
  if (!c.configured) return { tone: 'text-slate-500', icon: <CircleDashed size={14} aria-hidden />, text: 'לא מחובר' };
  const s = c.snapshot;
  if (!s) return { tone: 'text-slate-500', icon: <CircleDashed size={14} aria-hidden />, text: meta.historical ? 'עוד לא רוענן' : 'אין נתון לחודש הזה' };
  if (s.status === 'error') return { tone: 'text-red-600', icon: <CircleAlert size={14} aria-hidden />, text: `שגיאה (${s.error ?? '?'})` };
  if (s.error) return { tone: 'text-amber-700', icon: <CircleAlert size={14} aria-hidden />, text: `הרענון האחרון נכשל (${s.error}) — מוצג הנתון הקודם` };
  if (s.status === 'ok') return { tone: 'text-emerald-700', icon: <CheckCircle2 size={14} aria-hidden />, text: fmtMoney(s.amount, s.currency) };
  return { tone: 'text-slate-500', icon: <CircleDashed size={14} aria-hidden />, text: 'לא מחובר' };
}

export default function ConnectorsPanel({ connectors }: { connectors: DashboardPayload['connectors'] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-sm font-bold text-slate-900">מחברים</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {connectors.map((c) => {
          const meta = CONNECTOR_BY_ID[c.id];
          const st = state(c);
          const needsSetup = !c.configured || c.id === 'mapbox' || c.snapshot?.status === 'error';
          return (
            <li key={c.id} className="py-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-slate-800 min-w-0">{meta.label}</span>
                <span className={`ms-auto inline-flex items-center gap-1 text-xs shrink-0 tabular-nums ${st.tone}`}>
                  {st.icon}
                  {st.text}
                </span>
              </div>
              {needsSetup && (
                <details className="mt-1 group">
                  <summary className="text-xs text-sky-700 cursor-pointer select-none hover:underline underline-offset-2">איך מחברים</summary>
                  <ol className="mt-1 list-decimal ps-5 space-y-1 text-xs text-slate-600 leading-relaxed">
                    {meta.setupHe.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  {meta.requiredEnv.length > 0 && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      משתני סביבה: <span dir="ltr" className="font-mono">{[...meta.requiredEnv, ...(meta.optionalEnv ?? []).map((e) => `${e} (רשות)`)].join(', ')}</span>
                    </p>
                  )}
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
