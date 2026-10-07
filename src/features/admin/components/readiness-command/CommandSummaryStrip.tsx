'use client';

export interface CommandSummaryStripProps {
  entityLabel: string;
  entityCount: number;
  totalSoldiers: number;
  /** 07.10.2026 (David) — "מספר חיילים" → "חיילים ברשימות", with "מתוכם X נבדקו" as this block's own context line. */
  testedSoldiers: number;
  averagePassPercent: number | null;
  appActiveCount: number;
  notYetTestedCount: number;
  /** David: "ובנוסף, תמיד גלוי: 'X מתוך 49 עם נתונים'" — total is the full unfiltered set at this level (never shrinks with search/filter), entityWithData is how many of them have hasData. Now this block's own context line, not a separate line under the whole strip. */
  entityWithDataCount: number;
  entityTotalAtThisLevel: number;
}

interface Block {
  label: string;
  value: string;
  context: string;
}

function SummaryBlock({ label, value, context }: Block) {
  return (
    <div className="flex-1 min-w-[140px] bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500 font-bold">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">{context}</p>
    </div>
  );
}

/**
 * 07.10.2026 (David) — five SEPARATE blocks side by side, not one line of
 * numbers. Each block: label, big number, context line. Same component
 * at every drill depth, labeled in the current level's own entity type
 * (חטיבות/גדודים/פלוגות).
 */
export default function CommandSummaryStrip({
  entityLabel, entityCount, totalSoldiers, testedSoldiers, averagePassPercent, appActiveCount, notYetTestedCount, entityWithDataCount, entityTotalAtThisLevel,
}: CommandSummaryStripProps) {
  const appActivePercent = totalSoldiers > 0 ? Math.round((appActiveCount / totalSoldiers) * 1000) / 10 : null;
  const notYetTestedPercent = totalSoldiers > 0 ? Math.round((notYetTestedCount / totalSoldiers) * 1000) / 10 : null;

  const blocks: Block[] = [
    { label: `מספר ${entityLabel}`, value: String(entityCount), context: `${entityWithDataCount} מתוך ${entityTotalAtThisLevel} עם נתונים` },
    { label: 'חיילים ברשימות', value: String(totalSoldiers), context: `מתוכם ${testedSoldiers} נבדקו` },
    { label: 'ממוצע כשירות', value: averagePassPercent !== null ? `${averagePassPercent}%` : '—', context: `מבוסס על ${testedSoldiers} שנבדקו` },
    { label: 'מחוברים לאפליקציה', value: String(appActiveCount), context: appActivePercent !== null ? `${appActivePercent}% מהחיילים` : '—' },
    { label: 'טרם נבדקו', value: String(notYetTestedCount), context: notYetTestedPercent !== null ? `${notYetTestedPercent}% מהחיילים` : '—' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {blocks.map((b) => <SummaryBlock key={b.label} {...b} />)}
    </div>
  );
}
