'use client';

import { Dumbbell } from 'lucide-react';

export interface TrainingWeeklyShiftStripProps {
  becameFitCount: number;
  nearThresholdCount: number;
  stayedFitCount: number;
  droppedCount: number;
  determinableCount: number;
}

/**
 * 07.10.2026 — the brigade-dashboard strip from the original four-
 * location investigation (06.10.2026). Source: readiness-training-
 * weekly-shift.service.ts, exclusively readiness-training-status.service.ts-
 * derived — never the official-test path.
 *
 * === Naming — PROPOSED, flagged for confirmation (David's explicit instruction) ===
 * NearThresholdCard ("קרובים לסף") and FailToPassTransitionCard ("עברו
 * מלא-כשיר לכשיר") already exist and are OFFICIAL-TEST-based. To avoid
 * the same two phrases meaning two different things on the same
 * screen, this strip's own labels add an explicit "באימון" qualifier
 * and a group-level subtitle reusing the EXACT wording already
 * established in TrendsMainChart.tsx's own legend ("אפליקציה (אינדיקציה,
 * לא קובע)") for the training/app-derived vs official-test distinction
 * — so the SAME phrase means the SAME thing everywhere in this build,
 * not a new ad-hoc disclaimer invented here. "כשיר+ עדיין מעל הקו" is
 * tightened to "נשארו מעל הסף" to read as the direct mirror of "ירדו
 * מהקו" (stayed above / fell below), which also sidesteps repeating
 * "כשיר" where it isn't the distinguishing word. "הפכו לכשירים השבוע"
 * is kept verbatim — no existing card uses this time-bounded phrasing,
 * so nothing to disambiguate.
 *
 * === Empty state (David, item ג) ===
 * determinableCount === 0 means no soldier has training evidence at
 * BOTH comparison points yet — a real "no data," not four real zeros.
 * Rendered as one unified message, never as 0/0/0/0 (which would read
 * as "nobody improved," a materially different claim).
 */
export default function TrainingWeeklyShiftStrip({ becameFitCount, nearThresholdCount, stayedFitCount, droppedCount, determinableCount }: TrainingWeeklyShiftStripProps) {
  const metrics = [
    { label: 'הפכו לכשירים השבוע', value: becameFitCount },
    { label: 'קרובים לסף באימון', value: nearThresholdCount },
    { label: 'נשארו מעל הסף', value: stayedFitCount },
    { label: 'ירדו מהקו', value: droppedCount },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Dumbbell size={16} style={{ color: '#2563EB' }} />
        <h3 className="text-sm font-black text-gray-900">מגמת אימון שבועית</h3>
        <span className="text-[11px] text-gray-400">אפליקציה (אינדיקציה, לא קובע) — לא בוחן רשמי</span>
      </div>

      {determinableCount === 0 ? (
        <p className="text-sm text-gray-400 py-2">אין נתוני אימון עדיין.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-2xl font-black" style={{ color: '#2563EB' }}>{m.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
