'use client';
import type { QualityRunRoute, QualityVariant } from './types';
import { aggregateVariant } from './aggregate';
import { VARIANT_COLOR } from './RouteQualityMap';

const REASON_HE: Record<string, string> = { retrace: 'חזרה על רחוב', uturn: 'פרסה/ענף מת', compactness: 'צר מדי', unmarked_crossings: 'חציות לא מסומנות' };
const VARIANT_HE: Record<QualityVariant, string> = { off: 'נוכחי', on: 'v1', gh: 'GH' };
const pct = (n: number) => `${n.toFixed(0)}%`;

export function RouteQualityAggregate({ routes, variants, generations, empty }: {
  routes: QualityRunRoute[]; variants: QualityVariant[]; generations: Record<QualityVariant, number>; empty: Record<QualityVariant, number>;
}) {
  const aggs = variants.map(v => aggregateVariant(routes, v));
  const rows: Array<[string, (a: ReturnType<typeof aggregateVariant>) => string]> = [
    ['הרצות / ריקות', a => `${generations[a.variant]} / ${empty[a.variant]}`],
    ['עם פרסה או ענף מת', a => pct(a.uturnPct)],
    ['חזרה על רחוב > 8%', a => pct(a.retraceOver8Pct)],
    ['חזרה ממוצעת', a => `${a.meanRetracePct.toFixed(1)}%`],
    ['קומפקטיות ממוצעת', a => a.meanCompactness.toFixed(2)],
    ['בטווח ±15% מהיעד', a => pct(a.withinWindowPct)],
    ['אורך על כבישים ראשיים', a => pct(a.majorRoadPct)],
    ['חציות כביש ראשי לק״מ', a => a.crossingsPerKm.toFixed(2)],
    ['מתוכן לא מסומנות לק״מ', a => a.unmarkedPerKm.toFixed(2)],
    ['עובר את כל הספים', a => pct(a.passPct)],
    ['זמן יצירה', a => `${(a.meanMs / 1000).toFixed(1)} ש׳`],
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 text-xs">
          <th className="text-right font-bold py-2">מסלול ראשון בכל הרצה</th>
          {aggs.map(a => <th key={a.variant} className="text-right font-bold py-2" style={{ color: VARIANT_COLOR[a.variant] }}>{VARIANT_HE[a.variant]}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(([label, fn]) => (
          <tr key={label}><td className="py-1.5 text-gray-600">{label}</td>{aggs.map(a => <td key={a.variant} className="py-1.5 font-bold text-gray-900 tabular-nums">{fn(a)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function RouteQualityRows({ routes, selectedKey, onSelect }: {
  routes: QualityRunRoute[]; selectedKey: string | null; onSelect: (key: string | null) => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-400">
          {['גרסה', 'הרצה', 'ק״מ', 'שגיאת מרחק', 'פרסות', 'חזרה', 'קומפקטיות', 'חציות (לא מסומנות)', 'ראשיים', 'תוצאה'].map(h => <th key={h} className="text-right font-bold py-2 px-1">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {routes.map(r => {
          const m = r.metrics;
          return (
            <tr
              key={r.key}
              onClick={() => onSelect(selectedKey === r.key ? null : r.key)}
              className={`cursor-pointer hover:bg-gray-50 ${selectedKey === r.key ? 'bg-cyan-50' : ''}`}
            >
              <td className="py-1.5 px-1 font-bold" style={{ color: VARIANT_COLOR[r.variant] }}>{VARIANT_HE[r.variant]}{r.rank > 0 ? ` #${r.rank + 1}` : ''}</td>
              <td className="px-1 tabular-nums">{r.run + 1}</td>
              <td className="px-1 tabular-nums">{r.distanceKm.toFixed(1)}</td>
              <td className="px-1 tabular-nums">{m.distanceErrorPct == null ? '—' : `${(m.distanceErrorPct * 100).toFixed(0)}%`}</td>
              <td className="px-1 tabular-nums">{m.uTurnCount + m.spurCount}</td>
              <td className="px-1 tabular-nums">{(m.retracedPct * 100).toFixed(1)}%</td>
              <td className="px-1 tabular-nums">{m.compactness.toFixed(2)}</td>
              <td className="px-1 tabular-nums">{m.crossings ? `${m.crossings.total} (${m.crossings.unmarked})` : '—'}</td>
              <td className="px-1 tabular-nums">{m.majorRoadPct == null ? '—' : `${(m.majorRoadPct * 100).toFixed(0)}%`}</td>
              <td className={`px-1 font-bold ${r.verdict.pass ? 'text-emerald-600' : 'text-red-500'}`}>
                {r.verdict.pass ? 'עובר' : r.verdict.reasons.map(x => REASON_HE[x] ?? x).join(', ')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
