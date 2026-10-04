'use client';

import { Info } from 'lucide-react';
import type { DeclaredNotInRosterEntry } from '@/features/readiness/core/services/readiness-match.service';

/**
 * "מוצהרים שאינם ברשימת הבוחן" (04.10.2026, §13.84) — information only,
 * never an action (David, explicit: "זה מידע לקצין, לא פעולה" — no
 * link/create button here at all, unlike PendingLinkSection above,
 * which IS actionable and serves a different, narrower population
 * (officer-approved declarations only). This section shows every
 * declared member with no linked roster row, regardless of
 * unitApprovedByOfficer — David: don't merge the two approval
 * questions.
 */
interface DeclaredNotInRosterSectionProps {
  entries: DeclaredNotInRosterEntry[];
}

export default function DeclaredNotInRosterSection({ entries }: DeclaredNotInRosterSectionProps) {
  if (entries.length === 0) return null;

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Info size={16} className="text-slate-400 flex-shrink-0" />
        <h3 className="text-sm font-bold text-slate-700">מוצהרים שאינם ברשימת הבוחן ({entries.length})</h3>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        משתמשי אפליקציה שהצהירו על היחידה ואין להם שורה ברשימת הבוחן. מידע בלבד — אין פעולה כאן.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <span key={e.uid} className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-1">
            {e.accountName} <span className="text-slate-400 font-normal">· {e.declaredUnitName}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
