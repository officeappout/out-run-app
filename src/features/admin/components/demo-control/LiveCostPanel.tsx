'use client';
/**
 * /admin/demo — live cost: today's and month-to-date $, sessions and AI calls against
 * the caps, plus the last days. Prices come from the owner's table (CapsEditor); a day
 * the table can't price falls back to the engine's estimate and is marked "הערכה".
 */
import { Panel, StatusPill } from '@/features/admin/components/ui';
import type { DemoStatusPayload } from '@/lib/demo-control/status';
import type { CapStatus } from '@/lib/demo-control/usage-cost';
import { fmtInt, fmtUsd } from './demo-client';

const SOURCE_LABEL: Record<string, string> = { life: 'מנוע החיים', kelly: 'קלי', testers: 'בודקים', _rest: 'לא משויך' };

function SourceBreakdown({ today, month }: { today: Record<string, number>; month: Record<string, number> }) {
  const keys = Array.from(new Set([...Object.keys(today), ...Object.keys(month)])).filter((k) => (today[k] ?? 0) > 0 || (month[k] ?? 0) > 0);
  if (keys.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {keys.map((k) => (
        <span key={k} className="whitespace-nowrap rounded-full bg-slate-50 px-3 py-1 text-[12px] font-bold text-slate-700 ring-1 ring-inset ring-slate-200">
          {SOURCE_LABEL[k] ?? k}: {fmtUsd(today[k] ?? 0)} היום · {fmtUsd(month[k] ?? 0)} החודש
        </span>
      ))}
    </div>
  );
}

const BAR = { unset: 'bg-slate-300', ok: 'bg-cyan-500', warn: 'bg-amber-500', exceeded: 'bg-rose-500' } as const;

function CapRow({ label, status, money }: { label: string; status: CapStatus; money?: boolean }) {
  const fmt = money ? fmtUsd : fmtInt;
  const pct = status.cap === null ? 0 : status.ratio === null ? 100 : Math.min(100, Math.round(status.ratio * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-slate-700">{label}</span>
        <span className="whitespace-nowrap text-[13px] text-slate-600">
          <b className="text-[18px] font-black text-slate-900">{fmt(status.used)}</b>
          {' / '}
          {status.cap === null ? 'לא הוגדרה תקרה' : fmt(status.cap)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={`h-full rounded-full ${BAR[status.state]}`} style={{ width: `${pct}%` }} />
      </div>
      {status.state === 'exceeded' && <p className="mt-1 text-[12px] font-bold text-rose-600">הגעתם לתקרה: המנועים עוצרים.</p>}
      {status.state === 'warn' && <p className="mt-1 text-[12px] font-bold text-amber-600">קרוב לתקרה.</p>}
    </div>
  );
}

export default function LiveCostPanel({ data, updatedAgoSec }: { data: DemoStatusPayload; updatedAgoSec: number | null }) {
  const { usage, caps } = data;
  const recent = usage.days.slice(0, 7);
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          עלות חיה
          <StatusPill tone="info">{updatedAgoSec === null ? 'מתעדכן' : `עודכן לפני ${updatedAgoSec} שנ׳`}</StatusPill>
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CapRow label="היום" status={caps.dailyUsd} money />
        <CapRow label="מתחילת החודש" status={caps.monthlyUsd} money />
        <CapRow label="סיורי בודקים היום" status={caps.testerSessions} />
        <CapRow label="קריאות AI היום" status={caps.llmCalls} />
      </div>

      <SourceBreakdown today={usage.bySourceToday} month={usage.bySourceMonth} />

      {usage.unpricedModels.length > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          אין מחיר בטבלה ל: {usage.unpricedModels.join(', ')}. הסכום כולל הערכה של המנוע. מלאו את המחיר בעורך למטה.
        </p>
      )}

      {recent.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">עוד אין שימוש רשום. כשהמנוע או הבודקים ירוצו, כל יום יופיע כאן.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-start text-slate-500">
                <th className="py-1 text-start font-bold">יום</th>
                <th className="py-1 text-start font-bold">$</th>
                <th className="py-1 text-start font-bold">קריאות AI</th>
                <th className="py-1 text-start font-bold">סיורים</th>
                <th className="py-1 text-start font-bold">מודל</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.date} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-1.5 font-bold text-slate-800">{d.date}</td>
                  <td className="whitespace-nowrap py-1.5">
                    {fmtUsd(d.usd)}
                    {d.usdSource !== 'priced' && d.usd > 0 && <span className="ms-1 text-[11px] font-bold text-amber-600">הערכה</span>}
                  </td>
                  <td className="py-1.5">{fmtInt(d.llmCalls)}</td>
                  <td className="py-1.5">{fmtInt(d.testerSessions)}</td>
                  <td className="max-w-[160px] truncate py-1.5 text-slate-500">{d.model ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
