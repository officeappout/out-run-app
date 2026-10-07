'use client';

export interface CommandSummaryStripProps {
  entityLabel: string;
  entityCount: number;
  totalSoldiers: number;
  /** 07.10.2026 (David) — "מספר חיילים" → "חיילים ברשימות", with "מתוכם X נבדקו" as this block's own context line. */
  testedSoldiers: number;
  averagePassPercent: number | null;
  /** 07.10.2026 (David, item 1) — "ממוצע כשירות"'s own second line, "X% באימון". null (dash, never 0%) when nobody has a determinable training status yet. */
  averageTrainingPassPercent: number | null;
  /** 07.10.2026 (David, item 2) — ever connected to the app ("מחוברים" — the label already meant this; the value didn't match it). Now the primary number under "מחוברים לאפליקציה". */
  linkedCount: number;
  /** Active in the last 30 days — now this block's own second line ("מתוכם X פעילים ב-30 יום"), not the primary number. */
  appActiveCount: number;
  notYetTestedCount: number;
  /** 07.10.2026 (David, item 3) — of the officially not_yet_tested, how many already meet the threshold via training. Gated by averageTrainingPassPercent !== null (same "no training data yet" signal) — a real 0 here is still shown once there IS training data; a dash only when there's none at all. */
  notYetTestedButTrainingPassingCount: number;
  /** David: "ובנוסף, תמיד גלוי: 'X מתוך 49 עם נתונים'" — total is the full unfiltered set at this level (never shrinks with search/filter), entityWithData is how many of them have hasData. Now this block's own context line, not a separate line under the whole strip. */
  entityWithDataCount: number;
  entityTotalAtThisLevel: number;
}

interface ExtraLine {
  text: string;
  /** 07.10.2026 (David) — 'blue' for training-sourced lines (readiness-training-status data only), same subordinate-visual rule as the dashed training bar. 'gray' for everything else (e.g. "מחוברים לאפליקציה"'s second line — app-activity, a separate source, not training). */
  color: 'blue' | 'gray';
}

interface Block {
  label: string;
  value: string;
  context: string;
  /** A genuinely separate second line below context — David: "שורה שנייה", not a suffix appended onto the existing context text. */
  extraLine?: ExtraLine;
}

function SummaryBlock({ label, value, context, extraLine }: Block) {
  return (
    <div className="flex-1 min-w-[140px] bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500 font-bold">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">{context}</p>
      {extraLine && (
        <p className="text-[11px] font-bold mt-0.5" style={{ color: extraLine.color === 'blue' ? '#2563EB' : '#9CA3AF' }}>
          {extraLine.text}
        </p>
      )}
    </div>
  );
}

/**
 * 07.10.2026 (David) — five SEPARATE blocks side by side, not one line of
 * numbers. Each block: label, big number, context line. Same component
 * at every drill depth, labeled in the current level's own entity type
 * (חטיבות/גדודים/פלוגות).
 *
 * 07.10.2026 (David, training-rows round) — three of the five blocks
 * gain a second line. "ממוצע כשירות" and "טרם נבדקו"'s lines are
 * training-sourced (blue) — exclusively from readiness-training-status.service.ts
 * via computeBrigadeDashboard, never recomputed here. "מחוברים
 * לאפליקציה"'s is NOT training data (it's app-activity, a separate
 * source) — gray, not blue.
 */
export default function CommandSummaryStrip({
  entityLabel, entityCount, totalSoldiers, testedSoldiers, averagePassPercent, averageTrainingPassPercent, linkedCount, appActiveCount, notYetTestedCount, notYetTestedButTrainingPassingCount, entityWithDataCount, entityTotalAtThisLevel,
}: CommandSummaryStripProps) {
  const linkedPercent = totalSoldiers > 0 ? Math.round((linkedCount / totalSoldiers) * 1000) / 10 : null;
  const notYetTestedPercent = totalSoldiers > 0 ? Math.round((notYetTestedCount / totalSoldiers) * 1000) / 10 : null;
  // Shared "is there any training data at all" gate for both training
  // lines below — a dash (never a fabricated 0%/0) when nobody has a
  // determinable training status yet; a real number, including a real
  // 0, once there is.
  const hasTrainingData = averageTrainingPassPercent !== null;

  const blocks: Block[] = [
    { label: `מספר ${entityLabel}`, value: String(entityCount), context: `${entityWithDataCount} מתוך ${entityTotalAtThisLevel} עם נתונים` },
    { label: 'חיילים ברשימות', value: String(totalSoldiers), context: `מתוכם ${testedSoldiers} נבדקו` },
    {
      label: 'ממוצע כשירות',
      value: averagePassPercent !== null ? `${averagePassPercent}%` : '—',
      context: `מבוסס על ${testedSoldiers} שנבדקו`,
      extraLine: { text: hasTrainingData ? `${averageTrainingPassPercent}% באימון` : '— באימון', color: 'blue' },
    },
    {
      label: 'מחוברים לאפליקציה',
      value: String(linkedCount),
      context: linkedPercent !== null ? `${linkedPercent}% מהחיילים` : '—',
      extraLine: { text: `מתוכם ${appActiveCount} פעילים ב-30 יום`, color: 'gray' },
    },
    {
      label: 'טרם נבדקו',
      value: String(notYetTestedCount),
      context: notYetTestedPercent !== null ? `${notYetTestedPercent}% מהחיילים` : '—',
      extraLine: { text: hasTrainingData ? `מתוכם ${notYetTestedButTrainingPassingCount} כבר עומדים בסף באימון` : 'אין נתוני אימון', color: 'blue' },
    },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {blocks.map((b) => <SummaryBlock key={b.label} {...b} />)}
    </div>
  );
}
