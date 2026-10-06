'use client';

export interface CommandSummaryStripProps {
  entityLabel: string;
  entityCount: number;
  totalSoldiers: number;
  averagePassPercent: number | null;
  appActiveCount: number;
  notYetTestedCount: number;
  /** David: "ובנוסף, תמיד גלוי: 'X מתוך 49 עם נתונים'" — total is the full unfiltered set at this level (never shrinks with search/filter), entityWithData is how many of them have hasData. */
  entityWithDataCount: number;
  entityTotalAtThisLevel: number;
}

/**
 * 06.10.2026 — one row, 5 numbers, always labeled in the current
 * level's own entity type (חטיבות/גדודים/פלוגות) — same component at
 * every drill depth, per David's "אותם רכיבים, אותם כללים".
 */
export default function CommandSummaryStrip({
  entityLabel, entityCount, totalSoldiers, averagePassPercent, appActiveCount, notYetTestedCount, entityWithDataCount, entityTotalAtThisLevel,
}: CommandSummaryStripProps) {
  const items = [
    { label: `מספר ${entityLabel}`, value: String(entityCount) },
    { label: 'מספר חיילים', value: String(totalSoldiers) },
    { label: 'ממוצע כשירות', value: averagePassPercent !== null ? `${averagePassPercent}%` : '—' },
    { label: 'מחוברים לאפליקציה', value: String(appActiveCount) },
    { label: 'טרם נבדקו', value: String(notYetTestedCount) },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-1.5">
            <span className="text-lg font-black text-gray-900">{item.value}</span>
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
        {entityWithDataCount} מתוך {entityTotalAtThisLevel} עם נתונים
      </p>
    </div>
  );
}
