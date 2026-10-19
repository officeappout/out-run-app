'use client';
/** Horizontal bars for "count per key" (rules / generators). */
export default function StatsBars({ items, label, onPick, active }: {
  items: Array<{ key: string; count: number }>;
  label: (k: string) => string;
  onPick?: (k: string) => void;
  active?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-xs text-slate-400">אין נתונים.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={() => onPick?.(i.key)}
            className={`w-full text-start rounded px-1 ${active === i.key ? 'bg-sky-50 ring-1 ring-sky-300' : 'hover:bg-slate-50'}`}
          >
            <div className="flex justify-between text-xs text-slate-700"><span>{label(i.key)}</span><span className="font-bold">{i.count}</span></div>
            <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: `${(i.count / max) * 100}%` }} /></div>
          </button>
        </li>
      ))}
    </ul>
  );
}
