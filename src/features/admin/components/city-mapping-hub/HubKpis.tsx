'use client';

/** HubKpis — totals over ALL authorities (not the filtered view), so the numbers never jump while typing. */
import type { HubKpis as Kpis } from '@/lib/city-mapping-hub/filters';

export default function HubKpis({ k }: { k: Kpis }) {
  const items: Array<{ value: number; label: string; tone: string }> = [
    { value: k.total, label: 'רשויות', tone: 'text-slate-900' },
    { value: k.red, label: 'אדום', tone: 'text-red-600' },
    { value: k.yellow, label: 'צהוב', tone: 'text-amber-700' },
    { value: k.green, label: 'ירוק', tone: 'text-emerald-700' },
    { value: k.unmeasured, label: 'לא נמדדו', tone: 'text-slate-500' },
    { value: k.pendingRoutes, label: 'מסלולים ממתינים', tone: 'text-orange-600' },
    { value: k.pendingContributions, label: 'תרומות / מיקומים ממתינים', tone: 'text-violet-700' },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="סיכום">
      {items.map((i) => (
        <div key={i.label} data-testid="hub-kpi" className="flex min-w-0 flex-col rounded-2xl border border-slate-100 bg-white px-3.5 py-2.5 shadow-sm">
          <b className={`text-xl font-black tabular-nums ${i.tone}`}>{i.value}</b>
          <span className="truncate text-xs font-semibold text-slate-500">{i.label}</span>
        </div>
      ))}
    </section>
  );
}
