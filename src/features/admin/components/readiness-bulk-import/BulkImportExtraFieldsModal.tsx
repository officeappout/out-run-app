'use client';

/**
 * ⚠️ SUPERSEDED 04.10.2026 (00-MASTER-PLAN.md §13.83) — its only caller,
 * import/page.tsx, dropped it when that route switched to the
 * results-import flow (BulkResultsInputStep.tsx / BulkResultsReviewStep.tsx),
 * which has no equivalent "discarded extra fields" modal of its own
 * (the new 5/6-column format uses every field it parses; nothing is
 * silently dropped the way a 2nd+ tab-separated field was here). No
 * remaining caller as of this date. Deliberately NOT deleted yet
 * (David: this is the rollback if something breaks in production) —
 * kept for one week of real usage before a separate deletion round.
 */

import { X } from 'lucide-react';
import type { ParsedImportRow } from '@/features/readiness/core/services/readiness-import-parse';

/**
 * "שום נתון לא נעלם בשקט, ושום ניחוש מה העמודה השנייה אומרת" — this
 * modal exists purely so the officer can see exactly what got dropped
 * from an Excel paste (anything past the first tab-separated field)
 * before confirming the import. Read-only, no action taken here.
 */
interface BulkImportExtraFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ParsedImportRow[];
}

export default function BulkImportExtraFieldsModal({ isOpen, onClose, rows }: BulkImportExtraFieldsModalProps) {
  if (!isOpen) return null;
  const withExtra = rows.filter((r) => r.extraFields.length > 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="flex items-start justify-center min-h-full py-6 px-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative max-h-[85vh] flex flex-col" dir="rtl">
          <button onClick={onClose} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
          <h3 className="text-lg font-black text-gray-900 mb-1">שדות שהושמטו</h3>
          <p className="text-xs text-gray-500 mb-4">
            רק השם (השדה הראשון) נלקח מכל שורה. השדות הבאים נמצאו ולא יובאו.
          </p>

          <div className="overflow-y-auto space-y-2">
            {withExtra.map((row, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-sm font-bold text-slate-800">{row.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{row.extraFields.join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
