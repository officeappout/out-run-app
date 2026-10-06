'use client';

import { READINESS_COLORS } from '../readiness-dashboard/colors';

export interface CommandInsightPick {
  name: string;
  value: number;
  /** '%' for passPercent-based picks, '' for a plain count (gap in points is also shown as %, near-threshold count is a plain number). */
  unit: '%' | '';
}

export interface CommandInsightCardsProps {
  entityLabel: string;
  mostFit: CommandInsightPick | null;
  biggestGap: CommandInsightPick | null;
  mostNearThreshold: CommandInsightPick | null;
}

function InsightCard({ title, pick, color, emptyNote }: { title: string; pick: CommandInsightPick | null; color: string; emptyNote: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col">
      <p className="text-xs text-gray-500 font-bold mb-1">{title}</p>
      {pick ? (
        <>
          <p className="text-base font-black text-gray-900 truncate">{pick.name}</p>
          <p className="text-2xl font-black mt-1" style={{ color }}>{pick.value}{pick.unit}</p>
        </>
      ) : (
        <p className="text-sm text-gray-400 mt-2">{emptyNote}</p>
      )}
    </div>
  );
}

/**
 * 06.10.2026 — "דירוג הקצה": all 3 cards exclude small-sample entities
 * (pickMostFit/pickBiggestGap/pickMostNearThreshold already enforce
 * this — see readiness-command.util.ts). Same 3 cards recur at every
 * drill level, re-labeled by entityLabel (חטיבות/גדודים/פלוגות).
 */
export default function CommandInsightCards({ entityLabel, mostFit, biggestGap, mostNearThreshold }: CommandInsightCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <InsightCard title={`הכי כשירה (${entityLabel})`} pick={mostFit} color={READINESS_COLORS.pass} emptyNote="אין עדיין מספיק נתונים לדירוג." />
      <InsightCard title="הפער הגדול ביותר בין יחידות" pick={biggestGap} color="#2563EB" emptyNote="אין עדיין פער מדיד." />
      <InsightCard title="הכי הרבה קרובים לרף" pick={mostNearThreshold} color={READINESS_COLORS.fail} emptyNote="אין עדיין מספיק נתונים לדירוג." />
    </div>
  );
}
